import {
  DEFAULT_CONNECT_TIMEOUT_MS,
  type AssistantAudioSink,
  AvatarSinkError,
  type AvatarProvider,
  type AvatarSinkOptions,
  type SinkFailureReason,
  type SinkMetrics,
  emptyMetrics,
} from "./contract";
import { PcmPump } from "./pcm";

/**
 * Pinned CDN build. The pilot is gated to internal evaluation (ToS 2.4), so a
 * runtime import keeps the SDK out of the default bundle entirely. Promote to a
 * package.json dependency before any non-evaluation deployment.
 */
export const ANAM_SDK_URL = "https://esm.sh/@anam-ai/js-sdk@4";

/** Structural view of the Anam SDK surface this provider uses. */
export interface AnamAgentAudioStream {
  sendAudioChunk(base64: string): void;
  endSequence(): void;
}

export interface AnamClient {
  streamToVideoElement(elementId: string): Promise<void>;
  createAgentAudioInputStream(config: {
    encoding: string;
    sampleRate: number;
    channels: number;
  }): AnamAgentAudioStream;
  interruptPersona(): void;
  stopStreaming(): void;
}

export interface AnamSdk {
  createClient(sessionToken: string, options: { disableInputAudio: boolean }): AnamClient;
}

/**
 * A rendered avatar reports real dimensions. A negotiated-but-frameless session
 * reports 2x2, which is what an environment that cannot complete ICE gathering
 * produces — treating that as success would report a blank tile as working.
 */
const MIN_RENDERED_DIMENSION = 16;

export interface AnamProviderConfig {
  loadSdk?: () => Promise<AnamSdk>;
  /** Capture rate requested from Web Audio; the real rate is what reaches Anam. */
  sampleRate?: number;
}

export const DEFAULT_ANAM_SAMPLE_RATE = 24_000;

export function createAnamProvider(config: AnamProviderConfig = {}): AvatarProvider {
  const loadSdk =
    config.loadSdk ??
    (() => import(/* @vite-ignore */ ANAM_SDK_URL) as Promise<unknown> as Promise<AnamSdk>);
  return {
    id: "anam",
    requiresVideoSurface: true,
    create: (options) =>
      new AnamAudioSink(options, loadSdk, config.sampleRate ?? DEFAULT_ANAM_SAMPLE_RATE),
  };
}

class AnamAudioSink implements AssistantAudioSink {
  readonly id = "anam";
  private client: AnamClient | null = null;
  private audioStream: AnamAgentAudioStream | null = null;
  private pump: PcmPump | null = null;
  private metricsState: SinkMetrics = emptyMetrics("anam");
  private startedAt: number | null = null;
  private abort = new AbortController();
  private done = false;
  private sequenceActive = false;
  private frameWatch: ReturnType<typeof setInterval> | null = null;

  private readonly options: AvatarSinkOptions;
  private readonly loadSdk: () => Promise<AnamSdk>;
  private readonly requestedSampleRate: number;

  constructor(
    options: AvatarSinkOptions,
    loadSdk: () => Promise<AnamSdk>,
    requestedSampleRate: number
  ) {
    this.options = options;
    this.loadSdk = loadSdk;
    this.requestedSampleRate = requestedSampleRate;
  }

  async attach(stream: MediaStream): Promise<void> {
    const element = this.options.videoElement;
    if (!element) return this.fail("unsupported", "No video surface was provided.");
    if (!element.id) element.id = `anam-surface-${Math.random().toString(36).slice(2, 10)}`;

    this.metricsState = { ...this.metricsState, state: "connecting" };
    const timeout = setTimeout(
      () => this.fail("timeout", "Avatar did not become ready in time."),
      this.options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS
    );

    try {
      const sdk = await this.loadSdk();
      if (this.done) return;

      const token = await this.options.mintSessionToken(this.abort.signal);
      if (this.done) return;
      if (!token) return this.fail("token", "Session token was empty.");

      const client = sdk.createClient(token, { disableInputAudio: true });
      this.client = client;
      this.startedAt = Date.now();

      // Ordering is a hard vendor constraint: createAgentAudioInputStream is only
      // valid once streamToVideoElement has resolved (ZOU-797 preflight, AC-1).
      await client.streamToVideoElement(element.id);
      if (this.done) return;

      const queuedChunks: string[] = [];
      this.pump = await PcmPump.start(stream, {
        targetSampleRate: this.requestedSampleRate,
        onChunk: (base64) => {
          if (this.audioStream) this.audioStream.sendAudioChunk(base64);
          else queuedChunks.push(base64);
        },
        onError: (message) => this.fail("stream", message),
      });
      if (this.done) return this.pump.stop();
      if (this.sequenceActive) this.pump.beginSequence();

      this.audioStream = client.createAgentAudioInputStream({
        encoding: "pcm_s16le",
        sampleRate: this.pump.sampleRate,
        channels: 1,
      });
      for (const chunk of queuedChunks) this.audioStream.sendAudioChunk(chunk);
      this.metricsState = { ...this.metricsState, state: "ready" };
      this.watchForFrames(element);
    } catch (error) {
      this.fail(
        error instanceof AvatarSinkError ? error.reason : "connect",
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  beginSequence(): void {
    if (this.done || this.sequenceActive) return;
    this.sequenceActive = true;
    this.pump?.beginSequence();
  }

  interrupt(): void {
    if (this.done) return;
    this.metricsState = {
      ...this.metricsState,
      interruptions: this.metricsState.interruptions + 1,
    };
    // Both calls are required. endSequence alone leaves buffered audio playing.
    try {
      this.sequenceActive = false;
      this.pump?.endSequence();
      this.client?.interruptPersona();
      this.audioStream?.endSequence();
    } catch (error) {
      this.fail("runtime", error instanceof Error ? error.message : String(error));
    }
  }

  endSequence(): void {
    if (this.done || !this.sequenceActive) return;
    this.sequenceActive = false;
    this.metricsState = { ...this.metricsState, sequences: this.metricsState.sequences + 1 };
    try {
      this.pump?.endSequence();
      this.audioStream?.endSequence();
    } catch (error) {
      this.fail("runtime", error instanceof Error ? error.message : String(error));
    }
  }

  detach(): void {
    this.done = true;
    this.stopFrameWatch();
    this.abort.abort();
    const audioTransport = this.pump?.diagnostics();
    this.pump?.stop();
    try {
      this.client?.stopStreaming();
    } catch {
      // Session may already be closed by the provider.
    }
    this.metricsState = {
      ...this.metricsState,
      state: this.metricsState.state === "failed" ? "failed" : "stopped",
      billableMs: this.elapsed(),
      ...(audioTransport ? { audioTransport } : {}),
    };
    this.pump = null;
    this.client = null;
    this.audioStream = null;
  }

  metrics(): SinkMetrics {
    const audioTransport = this.pump?.diagnostics() ?? this.metricsState.audioTransport;
    return {
      ...this.metricsState,
      billableMs: this.elapsed(),
      ...(audioTransport ? { audioTransport } : {}),
    };
  }

  private watchForFrames(element: HTMLVideoElement): void {
    this.frameWatch = setInterval(() => {
      if (this.done) return this.stopFrameWatch();
      if (element.videoWidth > MIN_RENDERED_DIMENSION) {
        this.stopFrameWatch();
        this.metricsState = { ...this.metricsState, state: "rendering", mediaObserved: true };
        this.options.onMediaObserved?.();
      }
    }, 250);
  }

  private stopFrameWatch(): void {
    if (this.frameWatch) clearInterval(this.frameWatch);
    this.frameWatch = null;
  }

  private fail(reason: SinkFailureReason, message: string): void {
    if (this.done) return;
    const failure = { reason, message };
    this.metricsState = { ...this.metricsState, state: "failed", failure };
    this.detach();
    this.metricsState = { ...this.metricsState, state: "failed", failure };
    this.options.onFailure(failure);
  }

  private elapsed(): number {
    if (this.startedAt === null) return this.metricsState.billableMs;
    return Date.now() - this.startedAt;
  }
}
