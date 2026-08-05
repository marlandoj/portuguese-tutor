import { randomUUID } from "node:crypto";
import type { ChatMessage, ChatRequest } from "./validation";

export interface SpeechAlternative {
  transcript: string;
  confidence: number;
}

export interface AudioResult {
  bytes: Uint8Array;
  contentType: string;
}

export interface ProviderGateway {
  chat(apiKey: string, request: ChatRequest): Promise<string>;
  transcribe(apiKey: string, audio: Uint8Array, contentType: string): Promise<SpeechAlternative[]>;
  synthesize(apiKey: string, text: string): Promise<AudioResult>;
  createRealtimeCall(apiKey: string, sdp: string): Promise<string>;
  createAvatarSession(apiKey: string, avatarId: string): Promise<string>;
}

export class ProviderError extends Error {
  constructor(readonly provider: "OpenRouter" | "Deepgram" | "OpenAI" | "Anam") {
    super(`${provider} request failed.`);
  }
}

/**
 * Stock avatar. ZOU-797 fixed the pilot to stock IDs: zero-data-retention does
 * not cover one-shot persona source images, so no uploaded likeness is used.
 */
export const DEFAULT_AVATAR_ID = "6cc28442-cccd-42a8-b6e4-24b7210a09c5";
export const AVATAR_MODEL = "cara-4";

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

interface DeepgramResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{ transcript?: string; confidence?: number }>;
    }>;
  };
}

async function fetchWithTimeout(
  fetchImplementation: typeof fetch,
  input: string,
  init: RequestInit,
  timeoutMilliseconds: number
): Promise<Response> {
  try {
    return await fetchImplementation(input, {
      ...init,
      signal: AbortSignal.timeout(timeoutMilliseconds),
    });
  } catch {
    throw new Error("Upstream request timed out.");
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error("Upstream returned invalid JSON.");
  }
}

export function createRealtimeMultipart(sdp: string): { body: string; contentType: string } {
  const boundary = `----portuguese-tutor-${randomUUID()}`;
  const session = JSON.stringify({ type: "realtime", model: "gpt-realtime-2.1" });
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="sdp"',
    "Content-Type: application/sdp",
    "",
    sdp,
    `--${boundary}`,
    'Content-Disposition: form-data; name="session"',
    "Content-Type: application/json",
    "",
    session,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

export function normalizeRealtimeAnswer(answer: string): string {
  const normalized = answer.replace(/\r\n?/g, "\n").trim();
  return normalized ? `${normalized.replace(/\n/g, "\r\n")}\r\n` : "";
}

export class RemoteProviderGateway implements ProviderGateway {
  constructor(
    private readonly publicOrigin: string,
    private readonly fetchImplementation: typeof fetch = fetch
  ) {}

  async chat(apiKey: string, request: ChatRequest): Promise<string> {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        this.fetchImplementation,
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": this.publicOrigin,
            "X-Title": "Português Tutor",
          },
          body: JSON.stringify({
            model: request.model,
            messages: request.messages satisfies ChatMessage[],
            temperature: 0.7,
            max_tokens: 400,
          }),
        },
        30_000
      );
    } catch {
      throw new ProviderError("OpenRouter");
    }
    if (!response.ok) throw new ProviderError("OpenRouter");
    const payload = await parseJson<OpenRouterResponse>(response).catch(() => {
      throw new ProviderError("OpenRouter");
    });
    const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) throw new ProviderError("OpenRouter");
    return content;
  }

  async transcribe(
    apiKey: string,
    audio: Uint8Array,
    contentType: string
  ): Promise<SpeechAlternative[]> {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        this.fetchImplementation,
        "https://api.deepgram.com/v1/listen?model=nova-2&language=pt-PT&smart_format=true&punctuate=true",
        {
          method: "POST",
          headers: {
            Authorization: `Token ${apiKey}`,
            "Content-Type": contentType,
          },
          body: audio.slice().buffer as ArrayBuffer,
        },
        25_000
      );
    } catch {
      throw new ProviderError("Deepgram");
    }
    if (!response.ok) throw new ProviderError("Deepgram");
    const payload = await parseJson<DeepgramResponse>(response).catch(() => {
      throw new ProviderError("Deepgram");
    });
    return (payload.results?.channels?.[0]?.alternatives ?? [])
      .filter((item): item is { transcript: string; confidence?: number } => Boolean(item.transcript))
      .map((item) => ({ transcript: item.transcript, confidence: item.confidence ?? 0.9 }));
  }

  async synthesize(apiKey: string, text: string): Promise<AudioResult> {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        this.fetchImplementation,
        "https://api.openai.com/v1/audio/speech",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "nova", input: text }),
        },
        25_000
      );
    } catch {
      throw new ProviderError("OpenAI");
    }
    if (!response.ok) throw new ProviderError("OpenAI");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) throw new ProviderError("Deepgram");
    return {
      bytes,
      contentType: response.headers.get("content-type") ?? "audio/mpeg",
    };
  }

  async createRealtimeCall(apiKey: string, sdp: string): Promise<string> {
    const multipart = createRealtimeMultipart(sdp);
    let response: Response;
    try {
      response = await fetchWithTimeout(
        this.fetchImplementation,
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": multipart.contentType,
          },
          body: multipart.body,
        },
        30_000
      );
    } catch {
      throw new ProviderError("OpenAI");
    }
    if (!response.ok) throw new ProviderError("OpenAI");
    const answer = normalizeRealtimeAnswer(await response.text());
    if (!answer.startsWith("v=0")) throw new ProviderError("OpenAI");
    return answer;
  }

  /**
   * Mints a short-lived Anam session token. The API key stays server-side; only
   * the token reaches the browser.
   *
   * `showAIAvatarDisclosure` defaults to false for SDK sessions and can only be
   * set here, at token creation — it is not settable later from the client.
   */
  async createAvatarSession(apiKey: string, avatarId: string): Promise<string> {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        this.fetchImplementation,
        "https://api.anam.ai/v1/auth/session-token",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personaConfig: {
              name: "tutor-embodied-partner",
              avatarId,
              avatarModel: AVATAR_MODEL,
              enableAudioPassthrough: true,
            },
            sessionOptions: { showAIAvatarDisclosure: true },
          }),
        },
        30_000
      );
    } catch {
      throw new ProviderError("Anam");
    }
    if (!response.ok) throw new ProviderError("Anam");
    let payload: { sessionToken?: unknown };
    try {
      payload = (await response.json()) as { sessionToken?: unknown };
    } catch {
      throw new ProviderError("Anam");
    }
    const token = typeof payload.sessionToken === "string" ? payload.sessionToken.trim() : "";
    if (!token) throw new ProviderError("Anam");
    return token;
  }
}
