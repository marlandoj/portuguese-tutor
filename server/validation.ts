export const ALLOWED_MODELS = [
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
  "google/gemini-2.5-flash",
  "anthropic/claude-sonnet-4",
] as const;

export type AllowedModel = (typeof ALLOWED_MODELS)[number];
export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  model: AllowedModel;
  messages: ChatMessage[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfter?: number
  ) {
    super(message);
  }
}

const ALLOWED_MODEL_SET = new Set<string>(ALLOWED_MODELS);
const CHAT_ROLES = new Set<string>(["system", "user", "assistant"]);
const PORTUGUESE_LETTER = /[A-Za-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u00ff]/u;

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (
      (code >= 0 && code <= 8) ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127
    ) {
      return true;
    }
  }
  return false;
}

function contentLength(request: Request): number | null {
  const raw = request.headers.get("content-length");
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function assertWithinDeclaredSize(request: Request, maxBytes: number): void {
  const declared = contentLength(request);
  if (declared !== null && declared > maxBytes) {
    throw new ApiError(413, "Request body is too large.");
  }
}

export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new ApiError(415, "Content-Type must be application/json.");
  }
  assertWithinDeclaredSize(request, maxBytes);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new ApiError(413, "Request body is too large.");
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(400, "Request body must contain valid JSON.");
  }
}

export async function readAudio(request: Request, maxBytes: number): Promise<{
  bytes: Uint8Array;
  contentType: string;
}> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!/^audio\/webm(?:;\s*codecs=opus)?$/u.test(contentType)) {
    throw new ApiError(415, "Audio must be WebM or WebM/Opus.");
  }
  assertWithinDeclaredSize(request, maxBytes);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) throw new ApiError(400, "Audio body is empty.");
  if (bytes.byteLength > maxBytes) throw new ApiError(413, "Audio body is too large.");
  return { bytes, contentType };
}

export async function readSdp(request: Request, maxBytes: number): Promise<string> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/sdp")) {
    throw new ApiError(415, "Content-Type must be application/sdp.");
  }
  assertWithinDeclaredSize(request, maxBytes);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new ApiError(413, "SDP body is too large.");
  const sdp = `${new TextDecoder().decode(bytes).trim()}\r\n`;
  if (!sdp.startsWith("v=0") || !sdp.includes("m=audio")) {
    throw new ApiError(400, "SDP offer is invalid.");
  }
  return sdp;
}

export function validateChatRequest(value: unknown): ChatRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "Chat request must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (!Object.keys(record).every((key) => key === "model" || key === "messages")) {
    throw new ApiError(400, "Chat request contains unsupported fields.");
  }
  if (typeof record.model !== "string" || !ALLOWED_MODEL_SET.has(record.model)) {
    throw new ApiError(400, "Unsupported model.");
  }
  if (!Array.isArray(record.messages) || record.messages.length < 1 || record.messages.length > 21) {
    throw new ApiError(400, "Chat requires between 1 and 21 messages.");
  }

  let totalCharacters = 0;
  const messages = record.messages.map((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw new ApiError(400, "Each chat message must be an object.");
    }
    const item = message as Record<string, unknown>;
    if (!Object.keys(item).every((key) => key === "role" || key === "content")) {
      throw new ApiError(400, "Chat message contains unsupported fields.");
    }
    if (typeof item.role !== "string" || !CHAT_ROLES.has(item.role)) {
      throw new ApiError(400, "Chat message role is invalid.");
    }
    if (typeof item.content !== "string") {
      throw new ApiError(400, "Chat message content must be text.");
    }
    const content = item.content.trim();
    if (content.length < 1 || content.length > 2_000 || hasControlCharacters(content)) {
      throw new ApiError(400, "Chat message content is invalid.");
    }
    totalCharacters += content.length;
    return { role: item.role as ChatRole, content };
  });

  if (totalCharacters > 12_000) throw new ApiError(400, "Chat history is too long.");
  return { model: record.model as AllowedModel, messages };
}

export function validateSynthesisRequest(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "Speech request must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (!Object.keys(record).every((key) => key === "text") || typeof record.text !== "string") {
    throw new ApiError(400, "Speech request must contain only text.");
  }
  const text = record.text.trim();
  if (text.length < 1 || text.length > 800 || hasControlCharacters(text) || !PORTUGUESE_LETTER.test(text)) {
    throw new ApiError(400, "Speech text must be bounded Portuguese text.");
  }
  return text;
}

export function assertAllowedOrigin(request: Request, allowedOrigins: ReadonlySet<string>): void {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.has(origin)) {
    throw new ApiError(403, "Request origin is not allowed.");
  }
}
