import { afterEach, describe, expect, test } from "bun:test";
import { requestAvatarSessionToken } from "./api";
import { AvatarSinkError } from "./avatar/contract";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("requestAvatarSessionToken", () => {
  test("classifies a 429 response as avatar quota exhaustion", async () => {
    globalThis.fetch = Object.assign(
      async () =>
        new Response(JSON.stringify({ error: "Per-user quota exhausted." }), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "3600" },
        }),
      { preconnect: originalFetch.preconnect }
    );

    const error = await requestAvatarSessionToken().catch((value: unknown) => value);

    expect(error).toBeInstanceOf(AvatarSinkError);
    expect((error as AvatarSinkError).reason).toBe("quota");
    expect((error as Error).message).toContain("Try again after");
  });
});
