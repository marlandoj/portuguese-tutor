import { describe, expect, test } from "bun:test";
import { PcmChunker, floatToPcm16Base64 } from "./pcm";

function decode(base64: string): Buffer {
  return Buffer.from(base64, "base64");
}

describe("PCM16 encoding", () => {
  test("clamps, scales, and writes signed little-endian samples", () => {
    const encoded = floatToPcm16Base64(new Float32Array([-2, -1, -0.5, 0, 0.5, 1, 2]));
    const bytes = decode(encoded.base64);

    expect(encoded.byteLength).toBe(14);
    expect(Array.from({ length: 7 }, (_, index) => bytes.readInt16LE(index * 2))).toEqual([
      -32768,
      -32768,
      -16384,
      0,
      16384,
      32767,
      32767,
    ]);
  });
});

describe("PcmChunker", () => {
  test("batches five 128-frame worklet quanta into one 40 ms message at 16 kHz", () => {
    const chunks: string[] = [];
    const chunker = new PcmChunker(16_000, 40, (chunk) => chunks.push(chunk));

    for (let index = 0; index < 5; index += 1) {
      chunker.push(new Float32Array(128).fill(0.25));
    }

    expect(chunks).toHaveLength(1);
    expect(decode(chunks[0])).toHaveLength(1_280);
    expect(chunker.diagnostics()).toEqual({
      sampleRateHz: 16_000,
      channels: 1,
      chunkDurationMs: 40,
      chunksSent: 1,
      pcmBytesSent: 1_280,
      inactiveFramesDropped: 0,
    });
  });

  test("preserves silence inside an active sequence", () => {
    const chunks: string[] = [];
    const chunker = new PcmChunker(16_000, 40, (chunk) => chunks.push(chunk));

    chunker.push(new Float32Array(640));

    expect(chunks).toHaveLength(1);
    expect(decode(chunks[0]).every((byte) => byte === 0)).toBe(true);
  });

  test("accounts for frames discarded outside provider sequences", () => {
    const chunker = new PcmChunker(24_000, 40, () => undefined);
    chunker.dropInactive(1_152);
    expect(chunker.diagnostics().inactiveFramesDropped).toBe(1_152);
    expect(chunker.diagnostics().chunksSent).toBe(0);
  });

  test("flushes an audible partial tail before the sequence boundary", () => {
    const chunks: string[] = [];
    const chunker = new PcmChunker(16_000, 40, (chunk) => chunks.push(chunk));
    const tail = new Float32Array(100);
    tail[0] = 0.5;

    chunker.push(tail);
    expect(chunks).toEqual([]);
    chunker.flush();

    expect(chunks).toHaveLength(1);
    expect(decode(chunks[0])).toHaveLength(200);
    expect(chunker.diagnostics().pcmBytesSent).toBe(200);
  });

  test("preserves sample order across worklet boundaries", () => {
    const chunks: string[] = [];
    const chunker = new PcmChunker(1_000, 4, (chunk) => chunks.push(chunk));

    chunker.push(new Float32Array([0.25, 0.5, 0.75]));
    chunker.push(new Float32Array([-0.25, -0.5]));

    expect(chunks).toHaveLength(1);
    const bytes = decode(chunks[0]);
    expect(Array.from({ length: 4 }, (_, index) => bytes.readInt16LE(index * 2))).toEqual([
      8192,
      16384,
      24575,
      -8192,
    ]);
  });
});
