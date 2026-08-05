import { afterEach, describe, expect, test } from "bun:test";
import { LiveSession } from "./realtime";
import type { AssistantAudioSink, SinkMetrics } from "./avatar";

const REMOTE_STREAM = { id: "assistant-remote" } as unknown as MediaStream;
const MIC_TRACK = { kind: "audio", stop: () => undefined };
const MIC_STREAM = {
  id: "learner-microphone",
  getTracks: () => [MIC_TRACK],
} as unknown as MediaStream;

const ANSWER_SDP = "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";

class RecordingSink implements AssistantAudioSink {
  readonly id = "recording";
  attached: MediaStream[] = [];
  interrupts = 0;
  sequences = 0;
  detached = false;

  async attach(stream: MediaStream): Promise<void> {
    this.attached.push(stream);
  }
  interrupt(): void {
    this.interrupts += 1;
  }
  endSequence(): void {
    this.sequences += 1;
  }
  detach(): void {
    this.detached = true;
  }
  metrics(): SinkMetrics {
    return {
      provider: "recording",
      state: "rendering",
      billableMs: 0,
      mediaObserved: true,
      sequences: this.sequences,
      interruptions: this.interrupts,
      failure: null,
    };
  }
}

interface FakeConnection {
  ontrack: ((event: { streams: MediaStream[] }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  addedStreams: MediaStream[];
  dataChannel: { onopen: (() => void) | null; onmessage: ((e: { data: string }) => void) | null };
}

let connection: FakeConnection;
const originals = {
  RTCPeerConnection: globalThis.RTCPeerConnection,
  fetch: globalThis.fetch,
  navigator: globalThis.navigator,
};

function installFakes(): void {
  const channel = { onopen: null, onmessage: null, send: () => undefined, close: () => undefined };
  const fake: FakeConnection & Record<string, unknown> = {
    ontrack: null,
    onconnectionstatechange: null,
    addedStreams: [],
    dataChannel: channel,
    connectionState: "connected",
    addTrack: (_track: unknown, stream: MediaStream) => fake.addedStreams.push(stream),
    createDataChannel: () => channel,
    createOffer: async () => ({ type: "offer", sdp: "v=0\r\n" }),
    setLocalDescription: async () => undefined,
    setRemoteDescription: async () => undefined,
    close: () => undefined,
  };
  connection = fake;
  (globalThis as Record<string, unknown>).RTCPeerConnection = function () {
    return fake;
  };
  (globalThis as Record<string, unknown>).navigator = {
    mediaDevices: { getUserMedia: async () => MIC_STREAM },
  };
  (globalThis as Record<string, unknown>).fetch = async () =>
    new Response(ANSWER_SDP, { status: 201, headers: { "Content-Type": "application/sdp" } });
}

afterEach(() => {
  (globalThis as Record<string, unknown>).RTCPeerConnection = originals.RTCPeerConnection;
  (globalThis as Record<string, unknown>).fetch = originals.fetch;
  (globalThis as Record<string, unknown>).navigator = originals.navigator;
});

describe("LiveSession audio routing", () => {
  test("only the assistant's remote stream reaches the sink", async () => {
    installFakes();
    const sink = new RecordingSink();
    const session = new LiveSession();
    await session.connect("instructions", {}, { audioSink: sink });

    connection.ontrack?.({ streams: [REMOTE_STREAM] });

    expect(sink.attached).toEqual([REMOTE_STREAM]);
    // The learner's microphone is added to the peer connection for OpenAI, and
    // must never be handed to a renderer that forwards audio to a third party.
    expect(connection.addedStreams).toContain(MIC_STREAM);
    expect(sink.attached).not.toContain(MIC_STREAM);
    session.disconnect();
  });

  test("barge-in and sequence boundaries drive the sink", async () => {
    installFakes();
    const sink = new RecordingSink();
    const session = new LiveSession();
    await session.connect("instructions", {}, { audioSink: sink });

    connection.dataChannel.onmessage?.({
      data: JSON.stringify({ type: "input_audio_buffer.speech_started" }),
    });
    connection.dataChannel.onmessage?.({ data: JSON.stringify({ type: "response.done" }) });

    expect(sink.interrupts).toBe(1);
    expect(sink.sequences).toBe(1);
    session.disconnect();
  });

  test("a throwing sink cannot stall the conversation (ZOU-799 parity)", async () => {
    installFakes();
    const throwingSink: AssistantAudioSink = {
      id: "throwing",
      attach: async () => undefined,
      interrupt: () => {
        throw new Error("provider exploded");
      },
      endSequence: () => {
        throw new Error("provider exploded");
      },
      detach: () => undefined,
      metrics: () => ({
        provider: "throwing",
        state: "failed",
        billableMs: 0,
        mediaObserved: false,
        sequences: 0,
        interruptions: 0,
        failure: { reason: "runtime", message: "provider exploded" },
      }),
    };

    const states: string[] = [];
    const transcripts: string[] = [];
    const session = new LiveSession();
    await session.connect(
      "instructions",
      {
        onState: (state) => states.push(state),
        onAssistantDone: (text) => transcripts.push(text),
      },
      { audioSink: throwingSink }
    );

    connection.dataChannel.onmessage?.({
      data: JSON.stringify({ type: "input_audio_buffer.speech_started" }),
    });
    connection.dataChannel.onmessage?.({
      data: JSON.stringify({ type: "response.audio_transcript.done", transcript: "Olá!" }),
    });
    connection.dataChannel.onmessage?.({ data: JSON.stringify({ type: "response.done" }) });

    // Identical to the avatar-off path: both sink control points threw, and the
    // state machine and transcripts advanced anyway.
    expect(states).toContain("listening");
    expect(states.filter((state) => state === "listening").length).toBe(2);
    expect(transcripts).toEqual(["Olá!"]);
    session.disconnect();
  });

  test("disconnect tears the sink down", async () => {
    installFakes();
    const sink = new RecordingSink();
    const session = new LiveSession();
    await session.connect("instructions", {}, { audioSink: sink });
    session.disconnect();
    expect(sink.detached).toBe(true);
  });
});
