import { type AssistantAudioSink, type SinkMetrics, emptyMetrics } from "./contract";

/**
 * The unchanged default path: assistant audio played straight from the OpenAI
 * MediaStream. This is what `LiveSession` did inline before ZOU-1136, moved
 * behind the contract so an avatar provider can be layered over it.
 */
export class DirectAudioSink implements AssistantAudioSink {
  readonly id = "direct";
  private element: HTMLAudioElement | null = null;
  private metricsState: SinkMetrics = emptyMetrics("direct");
  private startedAt: number | null = null;

  private readonly createElement: () => HTMLAudioElement;

  constructor(createElement: () => HTMLAudioElement = () => new Audio()) {
    this.createElement = createElement;
  }

  async attach(stream: MediaStream): Promise<void> {
    if (!this.element) {
      this.element = this.createElement();
      this.element.autoplay = true;
    }
    this.element.srcObject = stream;
    this.startedAt = Date.now();
    this.metricsState = { ...this.metricsState, state: "rendering", mediaObserved: true };
  }

  /**
   * Silences direct playback while an avatar provider carries the audio, without
   * tearing the element down. Restoring is then synchronous, which is how the
   * 1-second fallback ceiling is met.
   */
  setMuted(muted: boolean): void {
    if (this.element) this.element.muted = muted;
  }

  get muted(): boolean {
    return this.element?.muted ?? false;
  }

  interrupt(): void {
    this.metricsState = { ...this.metricsState, interruptions: this.metricsState.interruptions + 1 };
  }

  endSequence(): void {
    this.metricsState = { ...this.metricsState, sequences: this.metricsState.sequences + 1 };
  }

  detach(): void {
    if (this.element) {
      try {
        this.element.srcObject = null;
      } catch {
        // Element may already be torn down by the host.
      }
      this.element = null;
    }
    this.metricsState = { ...this.metricsState, state: "stopped", billableMs: this.elapsed() };
    this.startedAt = null;
  }

  metrics(): SinkMetrics {
    return { ...this.metricsState, billableMs: this.elapsed() };
  }

  private elapsed(): number {
    if (this.startedAt === null) return this.metricsState.billableMs;
    return Date.now() - this.startedAt;
  }
}
