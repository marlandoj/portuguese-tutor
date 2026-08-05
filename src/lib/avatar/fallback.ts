import {
  type AssistantAudioSink,
  type AvatarProvider,
  type SinkFailure,
  type SinkMetrics,
} from "./contract";
import { DirectAudioSink } from "./direct";

export interface FallbackEvents {
  onAvatarActive?(): void;
  onFallback?(failure: SinkFailure): void;
}

/**
 * Composes an optional avatar provider over the always-present direct path.
 *
 * Ordering matters for the "no user-visible break" acceptance criterion: direct
 * playback is attached and audible immediately, and the avatar is negotiated in
 * parallel. Direct audio is muted only once the avatar reports media actually
 * flowing, and unmuting on failure is synchronous — so restoring playback costs
 * no network round trip and cannot exceed the 1-second ceiling.
 */
export class FallbackAudioSink implements AssistantAudioSink {
  readonly id = "fallback";
  private readonly direct = new DirectAudioSink();
  private avatar: AssistantAudioSink | null = null;
  private avatarLive = false;
  private failure: SinkFailure | null = null;

  private readonly provider: AvatarProvider | null;
  private readonly options: {
    mintSessionToken(signal?: AbortSignal): Promise<string>;
    videoElement: HTMLVideoElement | null;
    connectTimeoutMs?: number;
  };
  private readonly events: FallbackEvents;

  constructor(
    provider: AvatarProvider | null,
    options: {
      mintSessionToken(signal?: AbortSignal): Promise<string>;
      videoElement: HTMLVideoElement | null;
      connectTimeoutMs?: number;
    },
    events: FallbackEvents = {}
  ) {
    this.provider = provider;
    this.options = options;
    this.events = events;
  }

  async attach(stream: MediaStream): Promise<void> {
    await this.direct.attach(stream);
    if (!this.provider) return;

    const sink = this.provider.create({
      mintSessionToken: this.options.mintSessionToken,
      videoElement: this.options.videoElement,
      connectTimeoutMs: this.options.connectTimeoutMs,
      onFailure: (failure) => this.demote(failure),
      onMediaObserved: () => {
        if (this.failure) return;
        this.avatarLive = true;
        this.direct.setMuted(true);
        this.events.onAvatarActive?.();
      },
    });
    this.avatar = sink;

    try {
      await sink.attach(stream);
    } catch (error) {
      this.demote({ reason: "connect", message: describe(error) });
    }
  }

  interrupt(): void {
    this.direct.interrupt();
    if (this.avatarLive) safely(() => this.avatar?.interrupt());
  }

  endSequence(): void {
    this.direct.endSequence();
    if (this.avatarLive) safely(() => this.avatar?.endSequence());
  }

  detach(): void {
    safely(() => this.avatar?.detach());
    this.avatar = null;
    this.avatarLive = false;
    this.direct.detach();
  }

  metrics(): SinkMetrics {
    const base = this.avatar ? this.avatar.metrics() : this.direct.metrics();
    return { ...base, failure: this.failure ?? base.failure };
  }

  /** True while the avatar is carrying audio. Hosts use this to show the surface. */
  get avatarActive(): boolean {
    return this.avatarLive && !this.failure;
  }

  private demote(failure: SinkFailure): void {
    if (this.failure) return;
    this.failure = failure;
    this.avatarLive = false;
    this.direct.setMuted(false);
    safely(() => this.avatar?.detach());
    this.avatar = null;
    this.events.onFallback?.(failure);
  }
}

function safely(action: () => void): void {
  try {
    action();
  } catch {
    // Teardown and control paths must never surface provider errors to the host.
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
