import { requestRealtimeAnswer } from "./api";
import { DirectAudioSink, type AssistantAudioSink } from "./avatar";

export type LiveState = "idle" | "connecting" | "listening" | "speaking";

export interface LiveCallbacks {
  onState?: (state: LiveState) => void;
  onUserTranscript?: (text: string) => void;
  onAssistantDelta?: (delta: string) => void;
  onAssistantDone?: (text: string) => void;
  onError?: (message: string) => void;
  onEnded?: () => void;
}

export interface LiveOptions {
  /**
   * Where assistant audio is delivered. Defaults to direct playback, which is
   * the unchanged behaviour. An avatar renderer is layered in by passing a
   * FallbackAudioSink; see src/lib/avatar.
   */
  audioSink?: AssistantAudioSink;
}

const MAX_CALL_MILLISECONDS = 10 * 60 * 1_000;

export class LiveSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private audioSink: AssistantAudioSink | null = null;
  private hardStopTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  async connect(
    instructions: string,
    callbacks: LiveCallbacks,
    options: LiveOptions = {}
  ): Promise<void> {
    callbacks.onState?.("connecting");
    const connection = new RTCPeerConnection();
    this.pc = connection;
    this.audioSink = options.audioSink ?? new DirectAudioSink();
    connection.ontrack = (event) => {
      // Only the assistant's remote stream reaches the sink. The learner's
      // microphone track lives on `this.stream` and is never passed here.
      void this.audioSink?.attach(event.streams[0]);
    };
    connection.onconnectionstatechange = () => {
      if (this.closed) return;
      if (connection.connectionState === "failed" || connection.connectionState === "closed") {
        callbacks.onError?.("The live call disconnected.");
        this.disconnect();
        callbacks.onEnded?.();
      }
    };

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const stream = this.stream;
    stream.getTracks().forEach((track) => connection.addTrack(track, stream));

    this.dc = connection.createDataChannel("oai-events");
    this.dc.onopen = () => {
      this.dc?.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            instructions,
            audio: {
              input: {
                transcription: { model: "gpt-4o-mini-transcribe" },
                turn_detection: {
                  type: "server_vad",
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 600,
                },
              },
              output: { voice: "marin" },
            },
          },
        })
      );
      if (!this.closed) callbacks.onState?.("listening");
    };
    this.dc.onmessage = (event) => this.handleEvent(event.data, callbacks);

    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    const answer = await requestRealtimeAnswer(offer.sdp ?? "");
    await connection.setRemoteDescription({ type: "answer", sdp: answer });

    this.hardStopTimer = setTimeout(() => {
      if (this.closed) return;
      callbacks.onError?.("The live call ended at the 10-minute usage limit.");
      this.disconnect();
      callbacks.onState?.("idle");
      callbacks.onEnded?.();
    }, MAX_CALL_MILLISECONDS);
  }

  /**
   * Audio delivery must never decide whether the conversation advances.
   *
   * Both sink control points sit in the same switch arm as a state callback, so
   * a provider that throws on interrupt or endSequence would skip the state
   * transition and strand the UI mid-turn — a failure the learner would see
   * only when the avatar is enabled. ZOU-799 requires behaviour to be identical
   * with the renderer on and off, so the boundary is enforced here rather than
   * trusted to every sink implementation.
   */
  private driveSink(action: (sink: AssistantAudioSink) => void): void {
    const sink = this.audioSink;
    if (!sink) return;
    try {
      action(sink);
    } catch {
      // Deliberately swallowed: the sink's own failure path handles recovery.
    }
  }

  private handleEvent(raw: string, callbacks: LiveCallbacks): void {
    if (this.closed) return;
    let event: { type?: string; transcript?: string; delta?: string; error?: { message?: string } };
    try {
      event = JSON.parse(raw) as typeof event;
    } catch {
      return;
    }
    switch (event.type) {
      case "input_audio_buffer.speech_started":
        this.driveSink((sink) => sink.interrupt());
        callbacks.onState?.("listening");
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (event.transcript) callbacks.onUserTranscript?.(event.transcript);
        break;
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
        callbacks.onState?.("speaking");
        if (event.delta) callbacks.onAssistantDelta?.(event.delta);
        break;
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done":
        if (event.transcript) callbacks.onAssistantDone?.(event.transcript);
        break;
      case "response.done":
        this.driveSink((sink) => sink.endSequence());
        callbacks.onState?.("listening");
        break;
      case "error":
        callbacks.onError?.(event.error?.message ?? "Realtime API error");
        break;
    }
  }

  disconnect(): void {
    this.closed = true;
    if (this.hardStopTimer) {
      clearTimeout(this.hardStopTimer);
      this.hardStopTimer = null;
    }
    try {
      this.dc?.close();
    } catch {
      // Ignore an already-closed data channel.
    }
    try {
      this.pc?.close();
    } catch {
      // Ignore an already-closed peer connection.
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    try {
      this.audioSink?.detach();
    } catch {
      // Teardown must not surface sink errors.
    }
    this.audioSink = null;
    this.pc = null;
    this.dc = null;
    this.stream = null;
  }
}
