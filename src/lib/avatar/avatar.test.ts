import { beforeEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DirectAudioSink } from "./direct";
import { FallbackAudioSink } from "./fallback";
import {
  FALLBACK_DEADLINE_MS,
  emptyMetrics,
  type AvatarProvider,
  type SinkFailure,
} from "./contract";

class FakeAudioElement {
  srcObject: unknown = null;
  muted = false;
  autoplay = false;
}

const stream = { id: "assistant-stream" } as unknown as MediaStream;

beforeEach(() => {
  (globalThis as { Audio?: unknown }).Audio = FakeAudioElement;
});

function workingProvider(events: { onCreate?: () => void } = {}): AvatarProvider {
  return {
    id: "fake",
    requiresVideoSurface: true,
    create: (options) => {
      events.onCreate?.();
      return {
        id: "fake",
        attach: async () => {
          options.onMediaObserved?.();
        },
        beginSequence: () => undefined,
        interrupt: () => undefined,
        endSequence: () => undefined,
        detach: () => undefined,
        metrics: () => ({
          provider: "fake",
          state: "rendering",
          billableMs: 0,
          mediaObserved: true,
          sequences: 0,
          interruptions: 0,
          failure: null,
        }),
      };
    },
  };
}

function failingProvider(reason: SinkFailure): AvatarProvider {
  return {
    id: "fake-failing",
    requiresVideoSurface: true,
    create: (options) => ({
      id: "fake-failing",
      attach: async () => {
        options.onFailure(reason);
      },
      beginSequence: () => undefined,
      interrupt: () => undefined,
      endSequence: () => undefined,
      detach: () => undefined,
      metrics: () => ({
        provider: "fake-failing",
        state: "failed",
        billableMs: 0,
        mediaObserved: false,
        sequences: 0,
        interruptions: 0,
        failure: reason,
      }),
    }),
  };
}

const sinkOptions = {
  mintSessionToken: async () => "token",
  videoElement: null,
};

describe("DirectAudioSink", () => {
  test("routes the stream to its element and reports media", async () => {
    const element = new FakeAudioElement();
    const sink = new DirectAudioSink(() => element as unknown as HTMLAudioElement);
    await sink.attach(stream);
    expect(element.srcObject).toBe(stream);
    expect(sink.metrics().mediaObserved).toBe(true);
    sink.detach();
    expect(element.srcObject).toBe(null);
  });
});

describe("FallbackAudioSink", () => {
  test("plays direct audio unmuted when no provider is configured", async () => {
    const sink = new FallbackAudioSink(null, sinkOptions);
    await sink.attach(stream);
    expect(sink.avatarActive).toBe(false);
    sink.detach();
  });

  test("mutes direct audio only once the avatar reports media", async () => {
    let active = false;
    const sink = new FallbackAudioSink(workingProvider(), sinkOptions, {
      onAvatarActive: () => {
        active = true;
      },
    });
    await sink.attach(stream);
    expect(active).toBe(true);
    expect(sink.avatarActive).toBe(true);
    sink.detach();
  });

  test("replays an audio start that arrives while the provider is negotiating", async () => {
    let releaseAttach: (() => void) | undefined;
    let starts = 0;
    const provider: AvatarProvider = {
      id: "slow",
      requiresVideoSurface: true,
      create: (options) => ({
        id: "slow",
        attach: () =>
          new Promise<void>((resolve) => {
            releaseAttach = () => {
              options.onMediaObserved?.();
              resolve();
            };
          }),
        beginSequence: () => {
          starts += 1;
        },
        interrupt: () => undefined,
        endSequence: () => undefined,
        detach: () => undefined,
        metrics: () => emptyMetrics("slow"),
      }),
    };
    const sink = new FallbackAudioSink(provider, sinkOptions);

    const attaching = sink.attach(stream);
    sink.beginSequence();
    await Bun.sleep(0);
    expect(starts).toBe(1);

    releaseAttach?.();
    await attaching;
    sink.detach();
  });

  test("restores direct playback well inside the fallback deadline", async () => {
    let failure: SinkFailure | null = null;
    const sink = new FallbackAudioSink(
      failingProvider({ reason: "token", message: "no token" }),
      sinkOptions,
      {
        onFallback: (value) => {
          failure = value;
        },
      }
    );
    const started = Date.now();
    await sink.attach(stream);
    const elapsed = Date.now() - started;
    expect(failure).not.toBeNull();
    expect(failure!.reason).toBe("token");
    expect(sink.avatarActive).toBe(false);
    expect(elapsed).toBeLessThan(FALLBACK_DEADLINE_MS);
    sink.detach();
  });

  test("a provider that throws is demoted rather than surfaced to the host", async () => {
    const exploding: AvatarProvider = {
      id: "boom",
      requiresVideoSurface: true,
      create: () => ({
        id: "boom",
        attach: async () => {
          throw new Error("connect refused");
        },
        beginSequence: () => undefined,
        interrupt: () => undefined,
        endSequence: () => undefined,
        detach: () => undefined,
        metrics: () => ({
          provider: "boom",
          state: "failed",
          billableMs: 0,
          mediaObserved: false,
          sequences: 0,
          interruptions: 0,
          failure: null,
        }),
      }),
    };
    let failure: SinkFailure | null = null;
    const sink = new FallbackAudioSink(exploding, sinkOptions, {
      onFallback: (value) => {
        failure = value;
      },
    });
    await sink.attach(stream);
    expect(failure!.reason).toBe("connect");
    expect(failure!.message).toContain("connect refused");
    sink.detach();
  });

  test("only reports one failure even if the provider fails repeatedly", async () => {
    let count = 0;
    const sink = new FallbackAudioSink(
      failingProvider({ reason: "stream", message: "dropped" }),
      sinkOptions,
      {
        onFallback: () => {
          count += 1;
        },
      }
    );
    await sink.attach(stream);
    sink.interrupt();
    sink.endSequence();
    expect(count).toBe(1);
    sink.detach();
  });
});

describe("session budget ceiling", () => {
  test("demotes to direct playback when the budget expires, without stopping audio", async () => {
    const audio = new FakeAudioElement();
    (globalThis as { Audio?: unknown }).Audio = function () {
      return audio;
    };
    const failures: SinkFailure[] = [];
    const sink = new FallbackAudioSink(
      workingProvider(),
      { mintSessionToken: async () => "token", videoElement: null, maxAvatarMs: 20 },
      { onFallback: (failure) => failures.push(failure) }
    );

    await sink.attach(stream);
    expect(sink.avatarActive).toBe(true);
    expect(audio.muted).toBe(true);

    await Bun.sleep(60);

    expect(failures.map((failure) => failure.reason)).toEqual(["budget"]);
    expect(sink.avatarActive).toBe(false);
    // The conversation must survive the avatar: direct playback is unmuted and
    // still holds the assistant stream.
    expect(audio.muted).toBe(false);
    expect(audio.srcObject).toBe(stream);
    sink.detach();
  });

  test("does not arm a ceiling when the host advertises none", async () => {
    const failures: SinkFailure[] = [];
    const sink = new FallbackAudioSink(
      workingProvider(),
      { mintSessionToken: async () => "token", videoElement: null, maxAvatarMs: 0 },
      { onFallback: (failure) => failures.push(failure) }
    );
    await sink.attach(stream);
    await Bun.sleep(40);
    expect(failures).toEqual([]);
    expect(sink.avatarActive).toBe(true);
    sink.detach();
  });

  test("detaching cancels the pending ceiling", async () => {
    const failures: SinkFailure[] = [];
    const sink = new FallbackAudioSink(
      workingProvider(),
      { mintSessionToken: async () => "token", videoElement: null, maxAvatarMs: 20 },
      { onFallback: (failure) => failures.push(failure) }
    );
    await sink.attach(stream);
    sink.detach();
    await Bun.sleep(60);
    // A timer that outlives teardown would fire onFallback after the call ended
    // and surface a spurious error banner on an idle page.
    expect(failures).toEqual([]);
  });
});

describe("host neutrality (ZOU-798 / ZOU-1136 acceptance criterion)", () => {
  test("no module in the renderer imports host state, routing, or UI", () => {
    const directory = import.meta.dir;
    const offenders: string[] = [];
    for (const file of readdirSync(directory)) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      const source = readFileSync(join(directory, file), "utf8");
      for (const match of source.matchAll(/from\s+"([^"]+)"/gu)) {
        const specifier = match[1];
        const isRelativeWithinRenderer = specifier.startsWith("./");
        const isNodeOrBuiltin = !specifier.startsWith(".") && !specifier.startsWith("@/");
        if (!isRelativeWithinRenderer && !isNodeOrBuiltin) {
          offenders.push(`${file} -> ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
