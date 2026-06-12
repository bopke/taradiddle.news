/**
 * Hero image generation: Workers AI (Flux schnell) → R2. Failures are
 * non-fatal by contract — callers publish the article without an image and a
 * category-colored placeholder renders instead.
 */

const FLUX_MODEL = "@cf/black-forest-labs/flux-1-schnell" as const;

export const NO_TEXT_SUFFIX =
  " Strictly textless photograph: no words, letters, numbers, captions, subtitles, watermarks, logos or typography anywhere in the frame; any signs, screens, labels, papers or displays that appear are completely blank.";

export type ImageBindings = {
  ai: Pick<Ai, "run">;
  bucket: Pick<R2Bucket, "put">;
};

export async function generateHeroImage(
  bindings: ImageBindings,
  opts: { prompt: string; key: string },
): Promise<string | null> {
  try {
    const result = await bindings.ai.run(FLUX_MODEL, {
      prompt: opts.prompt + NO_TEXT_SUFFIX,
      steps: 6,
    });

    const base64 = (result as { image?: string }).image;
    if (!base64) {
      console.warn("flux returned no image data");
      return null;
    }

    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    await bindings.bucket.put(opts.key, bytes, {
      httpMetadata: { contentType: "image/jpeg" },
    });
    return opts.key;
  } catch (error) {
    console.warn("hero image generation failed (non-fatal)", error);
    return null;
  }
}
