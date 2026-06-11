import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/db";
import { createAnthropicClient } from "@/lib/anthropic";
import { handleSuggestionRequest } from "@/lib/suggest-topic";

export async function POST(request: Request): Promise<Response> {
  // Any failure — init (e.g. missing ANTHROPIC_API_KEY) or runtime (e.g. a D1
  // hiccup) — becomes structured JSON rather than Next's default error page:
  // this endpoint serves bots that parse the body.
  try {
    const { env } = await getCloudflareContext({ async: true });
    const deps = { db: getDb(env), anthropic: createAnthropicClient(env) };
    return await handleSuggestionRequest(deps, request);
  } catch (error) {
    console.error("suggestion API failed", error);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
