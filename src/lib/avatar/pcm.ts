/**
 * MediaStream -> base64 PCM16 pump.
 *
 * The ZOU-1136 seam analysis listed `ontrack` as the integration point but did
 * not account for the representation gap: OpenAI Realtime delivers assistant
 * audio as a WebRTC MediaStream, while Anam's passthrough API consumes base64
 * PCM16 frames. That conversion is provider-specific, so it lives here rather
 * than in any host.
 *
 * The worklet is loaded from an inline blob URL so no extra Vite build entry or
 * public asset is required.
 */

const WORKLET_SOURCE = `
class PcmTapProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor('pcm-tap', PcmTapProcessor);
`;

export interface PcmPumpOptions {
  /** Preferred capture rate. The real context rate is reported back via `sampleRate`. */
  targetSampleRate?: number;
  /** Duration of each provider chunk. Larger than an AudioWorklet render quantum. */
  chunkDurationMs?: number;
  onChunk(base64: string): void;
  onError(message: string): void;
}

export interface PcmTransportDiagnostics {
  sampleRateHz: number;
  channels: 1;
  chunkDurationMs: number;
  chunksSent: number;
  pcmBytesSent: number;
  silentChunksDropped: number;
}

export const DEFAULT_PCM_CHUNK_DURATION_MS = 40;

export function floatToPcm16Base64(samples: Float32Array): {
  base64: string;
  byteLength: number;
  silent: boolean;
} {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  let silent = true;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const value = Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
    if (value !== 0) silent = false;
    view.setInt16(i * 2, value, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const STRIDE = 0x8000;
  for (let i = 0; i < bytes.length; i += STRIDE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + STRIDE));
  }
  return { base64: btoa(binary), byteLength: bytes.byteLength, silent };
}

export class PcmChunker {
  private readonly pending: Float32Array;
  private readonly onChunkCallback: (base64: string) => void;
  private pendingLength = 0;
  private diagnosticsState: PcmTransportDiagnostics;

  constructor(
    sampleRateHz: number,
    chunkDurationMs: number,
    onChunk: (base64: string) => void
  ) {
    this.onChunkCallback = onChunk;
    const framesPerChunk = Math.max(1, Math.round((sampleRateHz * chunkDurationMs) / 1_000));
    this.pending = new Float32Array(framesPerChunk);
    this.diagnosticsState = {
      sampleRateHz,
      channels: 1,
      chunkDurationMs: (framesPerChunk / sampleRateHz) * 1_000,
      chunksSent: 0,
      pcmBytesSent: 0,
      silentChunksDropped: 0,
    };
  }

  push(samples: Float32Array): void {
    let offset = 0;
    while (offset < samples.length) {
      const count = Math.min(samples.length - offset, this.pending.length - this.pendingLength);
      this.pending.set(samples.subarray(offset, offset + count), this.pendingLength);
      this.pendingLength += count;
      offset += count;
      if (this.pendingLength === this.pending.length) this.emit(this.pending);
    }
  }

  flush(): void {
    if (this.pendingLength === 0) return;
    this.emit(this.pending.slice(0, this.pendingLength));
  }

  diagnostics(): PcmTransportDiagnostics {
    return { ...this.diagnosticsState };
  }

  private emit(samples: Float32Array): void {
    const encoded = floatToPcm16Base64(samples);
    this.pendingLength = 0;
    if (encoded.silent) {
      this.diagnosticsState.silentChunksDropped += 1;
      return;
    }
    this.onChunkCallback(encoded.base64);
    this.diagnosticsState.chunksSent += 1;
    this.diagnosticsState.pcmBytesSent += encoded.byteLength;
  }
}

export class PcmPump {
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private moduleUrl: string | null = null;
  private chunker: PcmChunker | null = null;
  private stopped = false;

  private readonly options: PcmPumpOptions;

  private constructor(options: PcmPumpOptions) {
    this.options = options;
  }

  static async start(stream: MediaStream, options: PcmPumpOptions): Promise<PcmPump> {
    const pump = new PcmPump(options);
    await pump.begin(stream);
    return pump;
  }

  /** The rate actually negotiated by the AudioContext; pass this to the provider. */
  get sampleRate(): number {
    return this.context?.sampleRate ?? 0;
  }

  private async begin(stream: MediaStream): Promise<void> {
    const AudioContextCtor: typeof AudioContext | undefined =
      globalThis.AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) throw new Error("Web Audio is unavailable in this browser.");

    const requested = this.options.targetSampleRate ?? 16_000;
    let context: AudioContext;
    try {
      context = new AudioContextCtor({ sampleRate: requested });
    } catch {
      context = new AudioContextCtor();
    }
    this.context = context;
    if (context.state === "suspended") await context.resume();

    const blob = new Blob([WORKLET_SOURCE], { type: "application/javascript" });
    this.moduleUrl = URL.createObjectURL(blob);
    await context.audioWorklet.addModule(this.moduleUrl);

    this.source = context.createMediaStreamSource(stream);
    this.node = new AudioWorkletNode(context, "pcm-tap");
    this.chunker = new PcmChunker(
      context.sampleRate,
      this.options.chunkDurationMs ?? DEFAULT_PCM_CHUNK_DURATION_MS,
      this.options.onChunk
    );
    this.node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (this.stopped) return;
      try {
        this.chunker?.push(event.data);
      } catch (error) {
        this.options.onError(error instanceof Error ? error.message : String(error));
      }
    };

    this.source.connect(this.node);
    // The tap must be pulled to run, but its output must stay silent: the avatar
    // provider plays this audio back, so routing it to the speakers too would
    // double it. A zero-gain sink keeps the graph active without any output.
    const mute = context.createGain();
    mute.gain.value = 0;
    this.node.connect(mute);
    mute.connect(context.destination);
  }

  flush(): void {
    this.chunker?.flush();
  }

  diagnostics(): PcmTransportDiagnostics | null {
    return this.chunker?.diagnostics() ?? null;
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    try {
      this.node?.port.close();
      this.node?.disconnect();
      this.source?.disconnect();
    } catch {
      // Graph may already be torn down.
    }
    void this.context?.close().catch(() => undefined);
    if (this.moduleUrl) URL.revokeObjectURL(this.moduleUrl);
    this.context = null;
    this.source = null;
    this.node = null;
    this.chunker = null;
    this.moduleUrl = null;
  }
}
