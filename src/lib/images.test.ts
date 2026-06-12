import { describe, expect, it, vi } from "vitest";
import { generateHeroImage, type ImageBindings } from "./images";

function mockBindings(runImpl: () => Promise<unknown>) {
  const run = vi.fn(runImpl);
  const put = vi.fn(async (..._args: unknown[]) => ({}));
  return {
    bindings: { ai: { run }, bucket: { put } } as unknown as ImageBindings,
    run,
    put,
  };
}

describe("generateHeroImage", () => {
  it("decodes the base64 image, stores it in R2 and returns the key", async () => {
    const pngish = btoa("fake-image-bytes");
    const { bindings, put } = mockBindings(async () => ({ image: pngish }));

    const key = await generateHeroImage(bindings, {
      prompt: "a podium on the moon",
      key: "articles/1-moon.jpg",
    });

    expect(key).toBe("articles/1-moon.jpg");
    const [storedKey, body, options] = put.mock.calls[0];
    expect(storedKey).toBe("articles/1-moon.jpg");
    expect(new TextDecoder().decode(body as Uint8Array)).toBe("fake-image-bytes");
    expect(options).toEqual({ httpMetadata: { contentType: "image/jpeg" } });
  });

  it("returns null when the model returns no image", async () => {
    const { bindings, put } = mockBindings(async () => ({}));
    expect(await generateHeroImage(bindings, { prompt: "p", key: "k" })).toBeNull();
    expect(put).not.toHaveBeenCalled();
  });

  it("returns null when the AI call throws (non-fatal contract)", async () => {
    const { bindings } = mockBindings(async () => {
      throw new Error("model timeout");
    });
    expect(await generateHeroImage(bindings, { prompt: "p", key: "k" })).toBeNull();
  });

  it("returns null when the R2 put throws", async () => {
    const { bindings, put } = mockBindings(async () => ({ image: btoa("x") }));
    put.mockRejectedValueOnce(new Error("r2 unavailable"));
    expect(await generateHeroImage(bindings, { prompt: "p", key: "k" })).toBeNull();
  });
});

describe("no-text enforcement", () => {
  it("appends the textless suffix to every Flux prompt", async () => {
    const { NO_TEXT_SUFFIX } = await import("./images");
    const { bindings, run } = mockBindings(async () => ({ image: btoa("x") }));
    await generateHeroImage(bindings, { prompt: "a podium on the moon", key: "k" });
    const [, input] = run.mock.calls[0] as unknown as [string, { prompt: string }];
    expect(input.prompt).toBe("a podium on the moon" + NO_TEXT_SUFFIX);
  });
});
