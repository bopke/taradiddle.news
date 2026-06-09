import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

export async function GET() {
  const { env } = await getCloudflareContext({ async: true });
  return NextResponse.json({
    ok: true,
    bindings: {
      db: !!env.DB,
      images: !!env.IMAGES,
      generationQueue: !!env.GENERATION_QUEUE,
      ai: !!env.AI,
    },
  });
}
