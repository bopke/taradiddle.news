import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

export async function GET() {
  const { env } = await getCloudflareContext({ async: true });
  return NextResponse.json({
    ok: true,
    bindings: {
      db: !!env.DB,
      images: !!env.IMAGE_BUCKET,
      generationQueue: !!env.GENERATION_QUEUE,
      ai: !!env.AI,
    },
  });
}
