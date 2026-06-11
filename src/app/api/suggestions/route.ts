import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/db";
import { createAnthropicClient } from "@/lib/anthropic";
import { handleSuggestionRequest } from "@/lib/suggest-topic";

export async function POST(request: Request): Promise<Response> {
  // Init failures (e.g. missing ANTHROPIC_API_KEY) become structured JSON
  // rather than Next's default error page — this endpoint serves bots.
  let deps;
  try {
    const { env } = await getCloudflareContext({ async: true });
    deps = { db: getDb(env), anthropic: createAnthropicClient(env) };
  } catch (error) {
    console.error("suggestion API init failed", error);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
  return handleSuggestionRequest(deps, request);
}
