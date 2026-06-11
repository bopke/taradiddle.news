import Anthropic from "@anthropic-ai/sdk";

export function createAnthropicClient(env: { ANTHROPIC_API_KEY?: string }): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is required — set it in .dev.vars (dev) or via `wrangler secret put` (production)",
    );
  }
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

/**
 * Short, human-readable error description for generation_jobs.error — typed
 * Anthropic errors get a recognizable prefix so the admin jobs screen reads well.
 */
export function describeAnthropicError(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) return "Anthropic rate limit (429)";
  if (error instanceof Anthropic.AuthenticationError) return "Anthropic auth failed (401) — check ANTHROPIC_API_KEY";
  if (error instanceof Anthropic.APIError) {
    return `Anthropic API error (${error.status ?? "?"}): ${truncate(error.message, 300)}`;
  }
  if (error instanceof Error) return truncate(`${error.name}: ${error.message}`, 400);
  return truncate(String(error), 400);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
