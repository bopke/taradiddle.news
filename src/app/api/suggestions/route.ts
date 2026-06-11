import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/db";
import { createAnthropicClient } from "@/lib/anthropic";
import type { AuthDb } from "@/lib/auth";
import { handleSuggestionRequest } from "@/lib/suggest-topic";

export async function POST(request: Request): Promise<Response> {
  const { env } = await getCloudflareContext({ async: true });
  return handleSuggestionRequest(
    {
      db: getDb(env) as unknown as AuthDb,
      anthropic: createAnthropicClient(env),
    },
    request,
  );
}
