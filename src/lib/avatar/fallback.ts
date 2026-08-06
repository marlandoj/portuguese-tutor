import {
  type AssistantAudioSink,
  type AvatarBudgetMs,
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
  private sequenceActive = false;
  private failure: SinkFailure | null = null;

  private budgetTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly provider: AvatarProvider | null;
  private readonly options: {
    mintSessionToken(signal?: AbortSignal): Promise<string>;
    videoElement: HTMLVideoElement | null;
    connectTimeoutMs?: number;
    maxAvatarMs?: AvatarBudgetMs;
  };
  private readonly events: FallbackEvents;

  constructor(
    provider: AvatarProvider | null,
    options: {
      mintSessionToken(signal?: AbortSignal): Promise<string>;
      videoElement: HTMLVideoElement | null;
      connectTimeoutMs?: number;
      maxAvatarMs?: AvatarBudgetMs;
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

    // Armed before the provider session opens, not on first frame: the vendor
    // bills from session start, so the ceiling must bound the billable window
    // including negotiation, not just the part the learner can see.
    this.armBudget();

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
    if (this.sequenceActive) safely(() => sink.beginSequence());

    try {
      await sink.attach(stream);
    } catch (error) {
      this.demote({ reason: "connect", message: describe(error) });
    }
  }

  beginSequence(): void {
    if (this.sequenceActive) return;
    this.sequenceActive = true;
    this.direct.beginSequence();
    if (this.avatar) safely(() => this.avatar?.beginSequence());
  }

  interrupt(): void {
    this.sequenceActive = false;
    this.direct.interrupt();
    if (this.avatar) safely(() => this.avatar?.interrupt());
  }

  endSequence(): void {
    if (!this.sequenceActive) return;
    this.sequenceActive = false;
    this.direct.endSequence();
    if (this.avatar) safely(() => this.avatar?.endSequence());
  }

  detach(): void {
    this.disarmBudget();
    safely(() => this.avatar?.detach());
    this.avatar = null;
    this.avatarLive = false;
    this.sequenceActive = false;
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
    this.disarmBudget();
    this.failure = failure;
    this.avatarLive = false;
    this.direct.setMuted(false);
    safely(() => this.avatar?.detach());
    this.avatar = null;
    this.events.onFallback?.(failure);
  }

  private armBudget(): void {
    const budget = this.options.maxAvatarMs;
    if (!budget || budget <= 0) return;
    this.budgetTimer = setTimeout(() => {
      this.budgetTimer = null;
      this.demote({
        reason: "budget",
        message: `Avatar session reached its ${Math.round(budget / 60_000)} minute budget.`,
      });
    }, budget);
  }

  private disarmBudget(): void {
    if (this.budgetTimer === null) return;
    clearTimeout(this.budgetTimer);
    this.budgetTimer = null;
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
