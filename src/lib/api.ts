export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface SpeechAlternative {
  transcript: string;
  confidence: number;
}

interface ApiErrorBody {
  error?: string;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorBody;
    if (payload.error) return payload.error;
  } catch {
    // The server deliberately returns only sanitized errors.
  }
  return `Request failed (${response.status}).`;
}

async function assertOk(response: Response): Promise<Response> {
  if (!response.ok) throw new Error(await errorMessage(response));
  return response;
}

export async function requestChat(model: string, messages: ChatMessage[]): Promise<string> {
  const response = await assertOk(
    await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages }),
    })
  );
  const payload = (await response.json()) as { content?: string };
  const content = payload.content?.trim() ?? "";
  if (!content) throw new Error("The coach returned an empty response.");
  return content;
}

export async function requestTranscription(
  audio: Blob,
  contentType: string
): Promise<SpeechAlternative[]> {
  const response = await assertOk(
    await fetch("/api/speech/transcribe", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: audio,
    })
  );
  const payload = (await response.json()) as { alternatives?: SpeechAlternative[] };
  return Array.isArray(payload.alternatives) ? payload.alternatives : [];
}

export async function requestSpeech(text: string): Promise<Blob> {
  const response = await assertOk(
    await fetch("/api/speech/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
  );
  return await response.blob();
}

export interface HealthStatus {
  openrouter: boolean;
  deepgram: boolean;
  openai: boolean;
  avatar: boolean;
}

export async function requestHealth(): Promise<HealthStatus> {
  const response = await assertOk(await fetch("/api/health"));
  const payload = (await response.json()) as Partial<HealthStatus>;
  return {
    openrouter: Boolean(payload.openrouter),
    deepgram: Boolean(payload.deepgram),
    openai: Boolean(payload.openai),
    avatar: Boolean(payload.avatar),
  };
}

/**
 * Mints an avatar session token. The provider API key never reaches the browser;
 * this returns only the short-lived token.
 */
export async function requestAvatarSessionToken(signal?: AbortSignal): Promise<string> {
  const response = await assertOk(
    await fetch("/api/avatar/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal,
    })
  );
  const payload = (await response.json()) as { sessionToken?: string };
  const token = payload.sessionToken?.trim() ?? "";
  if (!token) throw new Error("The avatar session token was empty.");
  return token;
}

export function normalizeRealtimeSdp(answer: string): string {
  const normalized = answer.replace(/\r\n?/g, "\n").trim();
  return normalized ? `${normalized.replace(/\n/g, "\r\n")}\r\n` : "";
}

export async function requestRealtimeAnswer(sdp: string): Promise<string> {
  const response = await assertOk(
    await fetch("/api/realtime/session", {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: sdp,
    })
  );
  const answer = normalizeRealtimeSdp(await response.text());
  if (!answer.startsWith("v=0")) throw new Error("The live-call answer was invalid.");
  return answer;
}
