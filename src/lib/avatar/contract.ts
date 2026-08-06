/**
 * ZOU-798 — provider-neutral, host-neutral avatar renderer contract.
 *
 * Nothing in this directory may import host state, routing, or UI. The only
 * host coupling permitted is what the caller passes into `AvatarSinkOptions`.
 * See Projects/zouroboros-realtime-avatar-renderer/CONTRACT.md.
 *
 * The contract is MediaStream-in by design. Every consumer so far (the tutor's
 * /chat, Skills/ai-assistant-voice) obtains assistant audio as a WebRTC
 * MediaStream from OpenAI Realtime. Providers that need another representation
 * — Anam needs base64 PCM16 frames — convert internally, so hosts never carry
 * provider encoding details.
 */

export type SinkState = "idle" | "connecting" | "ready" | "rendering" | "failed" | "stopped";

/** Reason codes are stable across providers so hosts can branch without string matching. */
export type SinkFailureReason =
  | "token"
  | "quota"
  | "connect"
  | "stream"
  | "timeout"
  | "unsupported"
  | "runtime"
  | "budget";

export interface SinkFailure {
  reason: SinkFailureReason;
  message: string;
}

export class AvatarSinkError extends Error {
  readonly reason: SinkFailureReason;

  constructor(reason: SinkFailureReason, message: string) {
    super(message);
    this.name = "AvatarSinkError";
    this.reason = reason;
  }
}

export interface SinkMetrics {
  provider: string;
  state: SinkState;
  /** Wall-clock milliseconds the provider session was open. Anam bills on this. */
  billableMs: number;
  /** True once the provider reported media actually flowing, not merely negotiated. */
  mediaObserved: boolean;
  sequences: number;
  interruptions: number;
  failure: SinkFailure | null;
  /** Non-content metadata for diagnosing provider audio transport quality. */
  audioTransport?: {
    sampleRateHz: number;
    channels: number;
    chunkDurationMs: number;
    chunksSent: number;
    pcmBytesSent: number;
    inactiveFramesDropped: number;
  };
}

/**
 * Where assistant audio is delivered. `DirectAudioSink` is the unchanged default
 * path; an avatar provider is an optional enhancement layered over it.
 */
export interface AssistantAudioSink {
  readonly id: string;
  /** Called once per session with the assistant's remote MediaStream. */
  attach(stream: MediaStream): Promise<void>;
  /** Assistant audio began playing. Maps to `output_audio_buffer.started`. */
  beginSequence(): void;
  /** Barge-in. Maps to `input_audio_buffer.speech_started`. */
  interrupt(): void;
  /** Drained audio boundary. Maps to `output_audio_buffer.stopped`. */
  endSequence(): void;
  /** Idempotent teardown. Must not throw. */
  detach(): void;
  metrics(): SinkMetrics;
}

export interface AvatarSinkOptions {
  /**
   * Host-supplied token minter. The host owns the server route; the renderer
   * never sees a provider API key and never learns the route's shape.
   */
  mintSessionToken(signal?: AbortSignal): Promise<string>;
  /** Video surface for providers that render one. Audio-only providers ignore it. */
  videoElement: HTMLVideoElement | null;
  /** Fired on any failure so the host can restore direct playback. */
  onFailure(failure: SinkFailure): void;
  /** Fired when media is first observed, so hosts can reveal the surface. */
  onMediaObserved?(): void;
  /** Budget for reaching `ready`. Contract default is 8000 ms. */
  connectTimeoutMs?: number;
}

/**
 * Wall-clock ceiling on a single avatar session, in milliseconds.
 *
 * Vendors that bill on session wall-clock (Anam) make an unbounded session a
 * direct spend risk, and a metered plan may offer no vendor-side spend cap at
 * all. The host supplies the ceiling it reserved quota for; on expiry the
 * renderer demotes to direct playback with reason `budget`. This is a normal
 * degradation, not an error — audio continues uninterrupted.
 */
export type AvatarBudgetMs = number;

export interface AvatarProvider {
  readonly id: string;
  readonly requiresVideoSurface: boolean;
  create(options: AvatarSinkOptions): AssistantAudioSink;
}

export const DEFAULT_CONNECT_TIMEOUT_MS = 8_000;
/** Contract ceiling for restoring direct playback after a failure (AC: within 1 s). */
export const FALLBACK_DEADLINE_MS = 1_000;

export function emptyMetrics(provider: string): SinkMetrics {
  return {
    provider,
    state: "idle",
    billableMs: 0,
    mediaObserved: false,
    sequences: 0,
    interruptions: 0,
    failure: null,
  };
}
