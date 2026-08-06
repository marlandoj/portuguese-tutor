import { describe, expect, test } from "bun:test";
import { createAnamProvider, type AnamSdk } from "./anam";
import { AvatarSinkError, type SinkFailure } from "./contract";

describe("AnamAudioSink failures", () => {
  test("preserves a host token-minter quota failure", async () => {
    const failures: SinkFailure[] = [];
    const sdk: AnamSdk = {
      createClient: () => {
        throw new Error("createClient must not run when token minting fails");
      },
    };
    const provider = createAnamProvider({ loadSdk: async () => sdk });
    const sink = provider.create({
      mintSessionToken: async () => {
        throw new AvatarSinkError("quota", "Avatar quota is exhausted.");
      },
      videoElement: { id: "avatar-test" } as HTMLVideoElement,
      onFailure: (failure) => failures.push(failure),
    });

    await sink.attach({} as MediaStream);

    expect(failures).toEqual([
      { reason: "quota", message: "Avatar quota is exhausted." },
    ]);
  });
});
