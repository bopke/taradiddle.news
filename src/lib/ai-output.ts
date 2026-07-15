import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

/**
 * Generation and translation used to return the whole article as structured
 * output, but constrained decoding lets one stray ASCII '"' inside body_md
 * legally close the JSON string — the grammar then completes a "valid" stub
 * (seen repeatedly in production). Long prose therefore never travels inside
 * a JSON string anymore: responses are a small metadata JSON object, a
 * delimiter line, then the body as plain markdown where quotes are harmless.
 */
export const BODY_DELIMITER = "---BODY---";

/** Prompt fragment describing the response shape; `fields` names the metadata keys. */
export function formatInstructions(fields: string): string {
  return `Respond in exactly this format, with no commentary before or after:
1. A single JSON object containing only these fields: ${fields}. Keep every value short — the article body never goes in the JSON.
2. A line containing exactly ${BODY_DELIMITER}
3. The full article body as plain markdown.`;
}

/**
 * Concatenated text of the response, or a loud failure when the model
 * returned none or ran out of tokens (a max_tokens cut would otherwise
 * silently shorten the body, which is the exact bug this format exists
 * to avoid). `label` prefixes errors, e.g. "translation to pl".
 */
export function extractText(message: Anthropic.Message, label: string): string {
  if (message.stop_reason === "max_tokens") {
    throw new Error(`${label} hit the max_tokens limit — body would be truncated`);
  }
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  if (!text.trim()) {
    throw new Error(`${label} returned no text output (stop_reason: ${message.stop_reason})`);
  }
  return text;
}

/**
 * Splits a delimited response into validated metadata and the markdown body.
 * Tolerates a ```json fence around the metadata object.
 */
export function parseDelimitedResponse<Schema extends z.ZodTypeAny>(
  schema: Schema,
  text: string,
  label: string,
): { meta: z.infer<Schema>; body: string } {
  const at = text.indexOf(BODY_DELIMITER);
  if (at === -1) {
    throw new Error(`${label} response is missing the ${BODY_DELIMITER} delimiter`);
  }
  const head = text
    .slice(0, at)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const body = text.slice(at + BODY_DELIMITER.length).trim();
  if (!body) throw new Error(`${label} response has an empty body`);

  let raw: unknown;
  try {
    raw = JSON.parse(head);
  } catch {
    throw new Error(`${label} metadata is not valid JSON: ${head.slice(0, 120)}`);
  }
  return { meta: schema.parse(raw) as z.infer<Schema>, body };
}
