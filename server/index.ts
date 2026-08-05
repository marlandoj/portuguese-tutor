import { resolve, sep } from "node:path";
import {
  DEFAULT_AVATAR_ID,
  ProviderError,
  RemoteProviderGateway,
  type ProviderGateway,
} from "./providers";
import {
  AVATAR_SESSION_MINUTES,
  QuotaEngine,
  REALTIME_SESSION_MINUTES,
  type IdentitySource,
} from "./quota";
import { loadProviderSecrets } from "./secrets";
import {
  ApiError,
  assertAllowedOrigin,
  readAudio,
  readJson,
  readSdp,
  validateChatRequest,
  validateSynthesisRequest,
} from "./validation";

const PUBLIC_ORIGIN = "https://portuguese-tutor-marlandoj.zocomputer.io";
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const STATIC_SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "media-src 'self' blob:",
    "connect-src 'self' https://cloudflareinsights.com",
    "font-src 'self' data:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
  "Permissions-Policy": "microphone=(self), camera=(), geolocation=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

interface SecretSource {
  OPENROUTER_API_KEY?: string;
  OPENAI_API_KEY?: string;
  DEEPGRAM_API_KEY?: string;
  ANAM_API_KEY?: string;
}

interface HandlerOptions {
  quota: QuotaEngine;
  providers: ProviderGateway;
  allowedOrigins: ReadonlySet<string>;
  distDirectory: string;
  secrets: SecretSource;
  /**
   * Avatar rendering is off unless explicitly enabled, independently of whether
   * ANAM_API_KEY happens to be present. Anam audio passthrough is a Beta Feature
   * and ToS 2.4 limits Beta use to internal evaluation, so possession of a key
   * must not by itself expose the route on a public deployment.
   */
  avatarEnabled?: boolean;
}

class ConcurrencyGate {
  private active = 0;

  constructor(private readonly maximum: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.maximum) throw new ApiError(503, "Service is busy.", 1);
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
    }
  }
}

function jsonResponse(status: number, payload: unknown, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function requireSecret(value: string | undefined): string {
  if (!value?.trim()) throw new ApiError(503, "This provider is not configured.", 60);
  return value.trim();
}

function quotaHeaders(source: IdentitySource): HeadersInit {
  return { "X-Quota-Identity": source };
}

function assertMethod(request: Request, method: string): void {
  if (request.method !== method) throw new ApiError(405, "Method not allowed.");
}

function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    const headers = new Headers(JSON_HEADERS);
    if (error.retryAfter !== undefined) {
      headers.set("Retry-After", String(Math.max(1, Math.ceil(error.retryAfter))));
    }
    return new Response(JSON.stringify({ error: error.message }), { status: error.status, headers });
  }
  if (error instanceof ProviderError) {
    return jsonResponse(502, { error: `${error.provider} is temporarily unavailable.` });
  }
  return jsonResponse(500, { error: "Unexpected server error." });
}

async function serveStatic(request: Request, distDirectory: string): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw new ApiError(405, "Method not allowed.");
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    throw new ApiError(400, "Invalid request path.");
  }

  if (pathname === "/favicon.ico") {
    return new Response(null, {
      status: 204,
      headers: { ...STATIC_SECURITY_HEADERS, "Cache-Control": "public, max-age=86400" },
    });
  }

  const root = resolve(distDirectory);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = resolve(root, relativePath);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    throw new ApiError(400, "Invalid request path.");
  }

  let file = Bun.file(candidate);
  if (!(await file.exists())) {
    if (relativePath.includes(".")) throw new ApiError(404, "Not found.");
    file = Bun.file(resolve(root, "index.html"));
  }
  if (!(await file.exists())) throw new ApiError(503, "Application build is unavailable.");

  const headers = new Headers(STATIC_SECURITY_HEADERS);
  if (file.type) headers.set("Content-Type", file.type);
  if (relativePath.startsWith("assets/")) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    headers.set("Cache-Control", "no-cache");
  }
  return new Response(request.method === "HEAD" ? null : file, { status: 200, headers });
}

export function createHandler(options: HandlerOptions): (request: Request) => Promise<Response> {
  const chatGate = new ConcurrencyGate(8);
  const speechGate = new ConcurrencyGate(4);
  const realtimeGate = new ConcurrencyGate(4);
  // Anam concurrency is 1 on the entry plans, so serialize until a tier that
  // supports more is actually committed (ZOU-800 decides that).
  const avatarGate = new ConcurrencyGate(1);
  const avatarAvailable = () =>
    Boolean(options.avatarEnabled) && Boolean(options.secrets.ANAM_API_KEY?.trim());

  return async (request: Request): Promise<Response> => {
    try {
      const path = new URL(request.url).pathname;
      if (path === "/api/health") {
        assertMethod(request, "GET");
        return jsonResponse(200, {
          openrouter: Boolean(options.secrets.OPENROUTER_API_KEY?.trim()),
          deepgram: Boolean(options.secrets.DEEPGRAM_API_KEY?.trim()),
          openai: Boolean(options.secrets.OPENAI_API_KEY?.trim()),
          avatar: avatarAvailable(),
        });
      }

      if (path === "/api/chat") {
        assertMethod(request, "POST");
        assertAllowedOrigin(request, options.allowedOrigins);
        const secret = requireSecret(options.secrets.OPENROUTER_API_KEY);
        const body = validateChatRequest(await readJson(request, 64 * 1_024));
        return await chatGate.run(async () => {
          const reservation = options.quota.reserve(request, "chat");
          const content = await options.providers.chat(secret, body);
          return jsonResponse(200, { content }, quotaHeaders(reservation.identitySource));
        });
      }

      if (path === "/api/speech/transcribe") {
        assertMethod(request, "POST");
        assertAllowedOrigin(request, options.allowedOrigins);
        const secret = requireSecret(options.secrets.DEEPGRAM_API_KEY);
        const audio = await readAudio(request, 5 * 1_024 * 1_024);
        return await speechGate.run(async () => {
          const reservation = options.quota.reserve(request, "speech");
          const alternatives = await options.providers.transcribe(
            secret,
            audio.bytes,
            audio.contentType
          );
          return jsonResponse(200, { alternatives }, quotaHeaders(reservation.identitySource));
        });
      }

      if (path === "/api/speech/synthesize") {
        assertMethod(request, "POST");
        assertAllowedOrigin(request, options.allowedOrigins);
        const secret = requireSecret(options.secrets.OPENAI_API_KEY);
        const text = validateSynthesisRequest(await readJson(request, 8 * 1_024));
        return await speechGate.run(async () => {
          const reservation = options.quota.reserve(request, "speech");
          const audio = await options.providers.synthesize(secret, text);
          return new Response(audio.bytes.slice().buffer as ArrayBuffer, {
            status: 200,
            headers: {
              "Content-Type": audio.contentType,
              "Cache-Control": "no-store",
              ...quotaHeaders(reservation.identitySource),
            },
          });
        });
      }

      if (path === "/api/realtime/session") {
        assertMethod(request, "POST");
        assertAllowedOrigin(request, options.allowedOrigins);
        const secret = requireSecret(options.secrets.OPENAI_API_KEY);
        const sdp = await readSdp(request, 64 * 1_024);
        return await realtimeGate.run(async () => {
          const reservation = options.quota.reserve(request, "realtime", REALTIME_SESSION_MINUTES);
          try {
            const answer = await options.providers.createRealtimeCall(secret, sdp);
            return new Response(answer, {
              status: 201,
              headers: {
                "Content-Type": "application/sdp",
                "Cache-Control": "no-store",
                ...quotaHeaders(reservation.identitySource),
              },
            });
          } catch (error) {
            reservation.rollback();
            throw error;
          }
        });
      }

      if (path === "/api/avatar/session") {
        assertMethod(request, "POST");
        assertAllowedOrigin(request, options.allowedOrigins);
        if (!avatarAvailable()) throw new ApiError(404, "API route not found.");
        const secret = requireSecret(options.secrets.ANAM_API_KEY);
        return await avatarGate.run(async () => {
          const reservation = options.quota.reserve(request, "avatar", AVATAR_SESSION_MINUTES);
          try {
            const sessionToken = await options.providers.createAvatarSession(
              secret,
              DEFAULT_AVATAR_ID
            );
            return jsonResponse(
              201,
              { sessionToken },
              quotaHeaders(reservation.identitySource)
            );
          } catch (error) {
            reservation.rollback();
            throw error;
          }
        });
      }

      if (path.startsWith("/api/")) throw new ApiError(404, "API route not found.");
      return await serveStatic(request, options.distDirectory);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 52243);
  const publicOrigin = process.env.APP_ORIGIN?.trim() || PUBLIC_ORIGIN;
  const allowedOrigins = new Set<string>([publicOrigin]);
  if (process.env.NODE_ENV !== "production") {
    allowedOrigins.add(`http://localhost:${port}`);
    allowedOrigins.add("http://localhost:52242");
    allowedOrigins.add("http://127.0.0.1:52242");
  }
  const quota = new QuotaEngine(resolve(process.cwd(), ".runtime"));
  const providers = new RemoteProviderGateway(publicOrigin);
  const secrets = loadProviderSecrets();
  const handler = createHandler({
    quota,
    providers,
    allowedOrigins,
    distDirectory: resolve(process.cwd(), "dist"),
    secrets,
    avatarEnabled: process.env.AVATAR_ENABLED?.trim() === "1",
  });
  const server = Bun.serve({ hostname: "0.0.0.0", port, fetch: handler });
  const shutdown = () => {
    server.stop(true);
    quota.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
