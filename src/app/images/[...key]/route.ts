import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Serves hero images from R2 (keys look like `articles/<slug>-<ts>.jpg`). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const { key } = await params;
  const objectKey = key.join("/");
  if (!objectKey.startsWith("articles/")) return new Response("Not found", { status: 404 });

  const { env } = await getCloudflareContext({ async: true });
  const object = await env.IMAGE_BUCKET.get(objectKey);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "image/jpeg",
      etag: object.httpEtag,
      // Keys are content-addressed-ish (slug + timestamp), safe to cache hard.
      "cache-control": "public, max-age=86400, immutable",
    },
  });
}
