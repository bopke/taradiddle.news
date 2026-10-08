import type Anthropic from "@anthropic-ai/sdk";

/** A model id plus its line ("opus", "sonnet", "haiku", …); null when the model has none. */
export type ClaudeModel = { id: string; line: string | null };

/** Used when the Models API is unreachable (no key, network error, etc.). */
export const FALLBACK_MODELS: ClaudeModel[] = [
  { id: "claude-haiku-5-5", line: "haiku" },
  { id: "claude-sonnet-5-5", line: "sonnet" },
  { id: "claude-opus-5-5", line: "opus" },
];

const CACHE_TTL_MS = 60 * 60 * 1000;
let cache: { models: ClaudeModel[]; fetchedAt: number } | null = null;

/**
 * Models available to this API key, newest first. Cached per isolate for an
 * hour; falls back to FALLBACK_MODELS if the API call fails.
 */
export async function listClaudeModels(client: Anthropic): Promise<ClaudeModel[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.models;
  try {
    const infos: Anthropic.ModelInfo[] = [];
    for await (const info of client.models.list()) infos.push(info);
    const models = infos
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .map((info) => ({ id: info.id, line: readLine(info) }));
    if (models.length === 0) return FALLBACK_MODELS;
    cache = { models, fetchedAt: Date.now() };
    return models;
  } catch (error) {
    console.warn("listing Claude models failed, using fallback list", error);
    return FALLBACK_MODELS;
  }
}

/** Newest model of a line ("sonnet", "haiku", "opus") from a newest-first list. */
export function newestOfLine(models: ClaudeModel[], line: string): string | undefined {
  return models.find((m) => m.line === line)?.id;
}

// The API's `line` field isn't in the SDK types yet. Anthropic says to read
// `line` rather than parse the id; the id match is only for older responses.
function readLine(info: Anthropic.ModelInfo): string | null {
  const line = (info as { line?: unknown }).line;
  if (typeof line === "string") return line;
  if (line === null) return null;
  return info.id.match(/^claude-(opus|sonnet|haiku|fable)-/)?.[1] ?? null;
}
