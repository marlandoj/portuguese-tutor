import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHandler } from "./index";
import {
  ProviderError,
  createRealtimeMultipart,
  normalizeRealtimeAnswer,
  type AudioResult,
  type ProviderGateway,
  type SpeechAlternative,
} from "./providers";
import {
  AVATAR_SESSION_MINUTES,
  QUOTA_LIMITS,
  REALTIME_SESSION_MINUTES,
  QuotaEngine,
  extractClientAddress,
  type QuotaOperation,
} from "./quota";
import { loadProviderSecrets } from "./secrets";
import { readSdp } from "./validation";
import { normalizeRealtimeSdp } from "../src/lib/api";

const ORIGIN = "https://portuguese-tutor-marlandoj.zocomputer.io";
const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "portuguese-tutor-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

class FakeProviders implements ProviderGateway {
  chatCalls = 0;
  transcriptionCalls = 0;
  synthesisCalls = 0;
  realtimeCalls = 0;
  avatarCalls = 0;
  failRealtime = false;
  failAvatar = false;
  chatBarrier: Promise<void> | null = null;

  async chat(): Promise<string> {
    this.chatCalls += 1;
    if (this.chatBarrier) await this.chatBarrier;
    return "Olá, bom dia";
  }

  async transcribe(): Promise<SpeechAlternative[]> {
    this.transcriptionCalls += 1;
    return [{ transcript: "Olá, bom dia", confidence: 0.99 }];
  }

  async synthesize(): Promise<AudioResult> {
    this.synthesisCalls += 1;
    return { bytes: new Uint8Array([1, 2, 3]), contentType: "audio/mpeg" };
  }

  async createRealtimeCall(): Promise<string> {
    this.realtimeCalls += 1;
    if (this.failRealtime) throw new ProviderError("OpenAI");
    return "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111";
  }

  async createAvatarSession(): Promise<string> {
    this.avatarCalls += 1;
    if (this.failAvatar) throw new ProviderError("Anam");
    return "fake.session.token";
  }
}

function createTestApplication(
  secrets: Record<string, string> = {
    OPENROUTER_API_KEY: "openrouter-secret",
    OPENAI_API_KEY: "openai-secret",
    DEEPGRAM_API_KEY: "deepgram-secret",
  },
  avatarEnabled = false
) {
  const root = temporaryDirectory();
  const runtime = join(root, "runtime");
  const dist = join(root, "dist");
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, "index.html"), "<main>Português Tutor</main>");
  const quota = new QuotaEngine(runtime);
  const providers = new FakeProviders();
  const handler = createHandler({
    quota,
    providers,
    allowedOrigins: new Set([ORIGIN]),
    distDirectory: dist,
    secrets,
    avatarEnabled,
  });
  return { root, runtime, quota, providers, handler };
}

const AVATAR_SECRETS = {
  OPENROUTER_API_KEY: "openrouter-secret",
  OPENAI_API_KEY: "openai-secret",
  DEEPGRAM_API_KEY: "deepgram-secret",
  ANAM_API_KEY: "anam-secret",
};

function avatarRequest(forwardedFor?: string): Request {
  return request(
    "/api/avatar/session",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    forwardedFor
  );
}

function request(
  path: string,
  init: RequestInit = {},
  forwardedFor: string | null = "198.51.100.8"
): Request {
  const headers = new Headers(init.headers);
  if (!headers.has("Origin")) headers.set("Origin", ORIGIN);
  if (forwardedFor) headers.set("X-Forwarded-For", forwardedFor);
  return new Request(`${ORIGIN}${path}`, { ...init, headers });
}

function chatRequest(model = "openai/gpt-4o-mini", forwardedFor?: string): Request {
  return request(
    "/api/chat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Olá, bom dia" }],
      }),
    },
    forwardedFor ?? "198.51.100.8"
  );
}

const VALID_SDP = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111";

describe("provider secret resolution", () => {
  test("environment values win and the protected file supplies missing provider keys", () => {
    const root = temporaryDirectory();
    const secretsPath = join(root, "zo-secrets");
    writeFileSync(
      secretsPath,
      'OPENROUTER_API_KEY="file-openrouter"\nOPENAI_API_KEY=file-openai\nDEEPGRAM_API_KEY=file-deepgram\nIGNORED_VALUE=ignored\n'
    );
    expect(
      loadProviderSecrets(secretsPath, { OPENROUTER_API_KEY: "environment-openrouter" })
    ).toEqual({
      OPENROUTER_API_KEY: "environment-openrouter",
      OPENAI_API_KEY: "file-openai",
      DEEPGRAM_API_KEY: "file-deepgram",
    });
  });
});

describe("provider API security", () => {
  test("SDP validation restores the terminal CRLF required by OpenAI", async () => {
    const input = new Request(`${ORIGIN}/api/realtime/session`, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: `${VALID_SDP}\n`,
    });
    expect(await readSdp(input, 64 * 1_024)).toBe(`${VALID_SDP}\r\n`);
  });

  test("Realtime answers canonicalize mixed line endings for WebRTC", () => {
    const mixed = "v=0\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\rt=0 0\n";
    const canonical = "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";
    expect(normalizeRealtimeAnswer(mixed)).toBe(canonical);
    expect(normalizeRealtimeSdp(mixed)).toBe(canonical);
  });

  test("Realtime multipart preserves the required SDP and fixed session fields", () => {
    const multipart = createRealtimeMultipart(VALID_SDP);
    expect(multipart.contentType).toStartWith("multipart/form-data; boundary=");
    expect(multipart.body).toContain('Content-Disposition: form-data; name="sdp"');
    expect(multipart.body).toContain("Content-Type: application/sdp");
    expect(multipart.body).toContain(VALID_SDP);
    expect(multipart.body).toContain('Content-Disposition: form-data; name="session"');
    expect(multipart.body).toContain("Content-Type: application/json");
    expect(multipart.body).toContain('{"type":"realtime","model":"gpt-realtime-2.1"}');
  });

  test("health returns readiness booleans without secret material", async () => {
    const app = createTestApplication();
    const response = await app.handler(request("/api/health", { method: "GET" }));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      openrouter: true,
      deepgram: true,
      openai: true,
      avatar: false,
    });
    expect(body).not.toContain("secret");
    app.quota.close();
  });

  test("missing provider configuration fails closed", async () => {
    const app = createTestApplication({
      OPENROUTER_API_KEY: "",
      OPENAI_API_KEY: "",
      DEEPGRAM_API_KEY: "",
    });
    const response = await app.handler(chatRequest());
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"error":"This provider is not configured."}');
    expect(app.providers.chatCalls).toBe(0);
    app.quota.close();
  });

  test("requests require the exact same origin", async () => {
    const app = createTestApplication();
    const forged = chatRequest();
    forged.headers.set("Origin", "https://example.com");
    const response = await app.handler(forged);
    expect(response.status).toBe(403);
    expect(app.providers.chatCalls).toBe(0);
    app.quota.close();
  });

  test("unsupported models and extra fields are rejected before upstream use", async () => {
    const app = createTestApplication();
    const unsupported = await app.handler(chatRequest("vendor/arbitrary-model"));
    expect(unsupported.status).toBe(400);
    const extraField = await app.handler(
      request("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: "Olá, bom dia" }],
          providerUrl: "https://example.com",
        }),
      })
    );
    expect(extraField.status).toBe(400);
    expect(app.providers.chatCalls).toBe(0);
    app.quota.close();
  });

  test("the four approved model IDs reach only the fixed chat gateway", async () => {
    const app = createTestApplication();
    const models = [
      "openai/gpt-4o-mini",
      "openai/gpt-4o",
      "google/gemini-2.5-flash",
      "anthropic/claude-sonnet-4",
    ];
    for (const [index, model] of models.entries()) {
      const response = await app.handler(chatRequest(model, `198.51.100.${index + 10}`));
      expect(response.status).toBe(200);
      expect(response.headers.get("X-Quota-Identity")).toBe("forwarded");
    }
    expect(app.providers.chatCalls).toBe(4);
    app.quota.close();
  });

  test("speech endpoints enforce media and Portuguese-text boundaries", async () => {
    const app = createTestApplication();
    const invalidAudio = await app.handler(
      request("/api/speech/transcribe", {
        method: "POST",
        headers: { "Content-Type": "audio/mpeg" },
        body: new Uint8Array([1]),
      })
    );
    expect(invalidAudio.status).toBe(415);
    const invalidText = await app.handler(
      request("/api/speech/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "123 !!" }),
      })
    );
    expect(invalidText.status).toBe(400);
    expect(app.providers.transcriptionCalls).toBe(0);
    expect(app.providers.synthesisCalls).toBe(0);
    app.quota.close();
  });

  test("provider failures are sanitized", async () => {
    const app = createTestApplication();
    app.providers.failRealtime = true;
    const response = await app.handler(
      request("/api/realtime/session", {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: VALID_SDP,
      })
    );
    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).toBe('{"error":"OpenAI is temporarily unavailable."}');
    expect(body).not.toContain("openai-secret");
    app.quota.close();
  });
});

describe("quota enforcement and privacy", () => {
  test("rightmost valid forwarded address wins and invalid input uses shared identity", () => {
    expect(extractClientAddress("203.0.113.7, invalid, 198.51.100.9")).toBe("198.51.100.9");
    expect(extractClientAddress("unknown, invalid")).toBeNull();
    expect(extractClientAddress(null)).toBeNull();
  });

  test("chat returns 429 with Retry-After after 20 requests per IP", async () => {
    const app = createTestApplication();
    for (let index = 0; index < QUOTA_LIMITS.chat.perIpAmount; index += 1) {
      expect((await app.handler(chatRequest())).status).toBe(200);
    }
    const blocked = await app.handler(chatRequest());
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(app.providers.chatCalls).toBe(20);
    app.quota.close();
  });

  test("realtime reserves bounded sessions and rolls back failed authorization", async () => {
    const app = createTestApplication();
    app.providers.failRealtime = true;
    const first = await app.handler(
      request("/api/realtime/session", {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: VALID_SDP,
      })
    );
    expect(first.status).toBe(502);
    app.providers.failRealtime = false;
    const allowedSessions = QUOTA_LIMITS.realtime.perIpAmount / REALTIME_SESSION_MINUTES;
    expect(Number.isInteger(allowedSessions)).toBeTrue();
    for (let index = 0; index < allowedSessions; index += 1) {
      const response = await app.handler(
        request("/api/realtime/session", {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: VALID_SDP,
        })
      );
      expect(response.status).toBe(201);
    }
    const blocked = await app.handler(
      request("/api/realtime/session", {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: VALID_SDP,
      })
    );
    expect(blocked.status).toBe(429);
    expect(app.providers.realtimeCalls).toBe(allowedSessions + 1);
    app.quota.close();
  });

  test("concurrent reservations cannot exceed a shared limit", async () => {
    const root = temporaryDirectory();
    const limits = Object.fromEntries(
      Object.entries(QUOTA_LIMITS).map(([operation, limit]) => [operation, { ...limit }])
    ) as Record<QuotaOperation, (typeof QUOTA_LIMITS)[QuotaOperation]>;
    limits.chat = {
      perIpAmount: 5,
      perIpWindowSeconds: 3_600,
      globalAmount: 5,
      globalWindowSeconds: 86_400,
    };
    const quota = new QuotaEngine(root, limits);
    const attempts = await Promise.all(
      Array.from({ length: 20 }, async () => {
        try {
          quota.reserve(request("/api/chat"), "chat");
          return "allowed";
        } catch {
          return "blocked";
        }
      })
    );
    expect(attempts.filter((result) => result === "allowed")).toHaveLength(5);
    expect(attempts.filter((result) => result === "blocked")).toHaveLength(15);
    quota.close();
  });

  test("expired counters are removed and no raw IP or content is stored", async () => {
    const app = createTestApplication();
    const rawIp = "203.0.113.77";
    const response = await app.handler(chatRequest("openai/gpt-4o-mini", rawIp));
    expect(response.status).toBe(200);
    app.quota.close();

    const databasePath = join(app.runtime, "quota.sqlite");
    const database = new Database(databasePath, { readonly: true });
    const columns = database.query("PRAGMA table_info(quota_counters)").all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toEqual([
      "bucket_hash",
      "operation",
      "window_start",
      "amount",
      "expires_at",
    ]);
    const rows = database.query("SELECT bucket_hash FROM quota_counters").all() as Array<{
      bucket_hash: string;
    }>;
    expect(rows.some((row) => row.bucket_hash === rawIp)).toBeFalse();
    database.close();
    expect(readFileSync(databasePath).includes(Buffer.from(rawIp))).toBeFalse();
    expect(readFileSync(databasePath).includes(Buffer.from("Olá, bom dia"))).toBeFalse();
  });

  test("missing forwarded identity uses the shared anonymous bucket", async () => {
    const app = createTestApplication();
    const response = await app.handler(chatRequest("openai/gpt-4o-mini", undefined));
    expect(response.status).toBe(200);
    const noForwarded = request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "Olá, bom dia" }],
      }),
    }, null);
    const sharedResponse = await app.handler(noForwarded);
    expect(sharedResponse.status).toBe(200);
    expect(sharedResponse.headers.get("X-Quota-Identity")).toBe("shared");
    app.quota.close();
  });
});

describe("static application", () => {
  test("root and SPA paths serve the built application without favicon noise", async () => {
    const app = createTestApplication();
    const root = await app.handler(new Request(`${ORIGIN}/`));
    const spa = await app.handler(new Request(`${ORIGIN}/learn`));
    const favicon = await app.handler(new Request(`${ORIGIN}/favicon.ico`));
    expect(root.status).toBe(200);
    expect(root.headers.get("Content-Security-Policy")).toContain("static.cloudflareinsights.com");
    expect(spa.status).toBe(200);
    expect(await spa.text()).toContain("Português Tutor");
    expect(favicon.status).toBe(204);
    app.quota.close();
  });
});

describe("avatar session route (ZOU-1136)", () => {
  test("stays absent when the key is present but the flag is off", async () => {
    const app = createTestApplication(AVATAR_SECRETS, false);
    const response = await app.handler(avatarRequest());
    expect(response.status).toBe(404);
    expect(app.providers.avatarCalls).toBe(0);
    const health = await (await app.handler(request("/api/health", { method: "GET" }))).json();
    expect(health.avatar).toBe(false);
    app.quota.close();
  });

  test("stays absent when the flag is on but no key is configured", async () => {
    const app = createTestApplication(
      { OPENROUTER_API_KEY: "a", OPENAI_API_KEY: "b", DEEPGRAM_API_KEY: "c" },
      true
    );
    const response = await app.handler(avatarRequest());
    expect(response.status).toBe(404);
    expect(app.providers.avatarCalls).toBe(0);
    app.quota.close();
  });

  test("mints a token and reports availability when enabled and keyed", async () => {
    const app = createTestApplication(AVATAR_SECRETS, true);
    const response = await app.handler(avatarRequest());
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { sessionToken?: string };
    expect(payload.sessionToken).toBe("fake.session.token");
    expect(app.providers.avatarCalls).toBe(1);
    const health = await (await app.handler(request("/api/health", { method: "GET" }))).json();
    expect(health.avatar).toBe(true);
    app.quota.close();
  });

  test("reserves avatar minutes and exhausts the per-user quota", async () => {
    const app = createTestApplication(AVATAR_SECRETS, true);
    const allowed = Math.floor(QUOTA_LIMITS.avatar.perIpAmount / AVATAR_SESSION_MINUTES);
    for (let index = 0; index < allowed; index += 1) {
      expect((await app.handler(avatarRequest())).status).toBe(201);
    }
    const exhausted = await app.handler(avatarRequest());
    expect(exhausted.status).toBe(429);
    app.quota.close();
  });

  test("rolls the reservation back when the provider fails", async () => {
    const app = createTestApplication(AVATAR_SECRETS, true);
    app.providers.failAvatar = true;
    expect((await app.handler(avatarRequest())).status).toBe(502);
    app.providers.failAvatar = false;
    const database = new Database(join(app.runtime, "quota.sqlite"));
    const row = database
      .query("SELECT COALESCE(SUM(amount), 0) AS amount FROM quota_counters WHERE operation = 'avatar'")
      .get() as { amount: number };
    database.close();
    expect(row.amount).toBe(0);
    app.quota.close();
  });

  test("migrates a database whose CHECK constraint predates the avatar operation", () => {
    const runtime = temporaryDirectory();
    const legacy = new Database(join(runtime, "quota.sqlite"), { create: true });
    legacy.run(`
      CREATE TABLE quota_counters (
        bucket_hash TEXT NOT NULL,
        operation TEXT NOT NULL CHECK (operation IN ('chat', 'speech', 'realtime')),
        window_start INTEGER NOT NULL,
        amount INTEGER NOT NULL CHECK (amount >= 0),
        expires_at INTEGER NOT NULL CHECK (expires_at > window_start),
        PRIMARY KEY (bucket_hash, operation, window_start)
      )
    `);
    legacy.run(
      "INSERT INTO quota_counters VALUES ('__global__', 'chat', 100, 5, 99999999999)"
    );
    legacy.close();

    const engine = new QuotaEngine(runtime);
    const reservation = engine.reserve(request("/api/avatar/session"), "avatar", 1);
    expect(reservation.identitySource).toBe("forwarded");

    const database = new Database(join(runtime, "quota.sqlite"));
    const preserved = database
      .query("SELECT amount FROM quota_counters WHERE operation = 'chat'")
      .get() as { amount: number } | null;
    database.close();
    expect(preserved?.amount).toBe(5);
    engine.close();
  });
});
