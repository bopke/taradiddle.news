import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

/**
 * Generation and translation responses avoid JSON entirely, after two
 * production failure modes with the same root cause — models emitting a
 * straight '"' where JSON needs an escape:
 *
 * 1. Structured outputs: under constrained decoding a bare '"' inside
 *    body_md legally closed the string, yielding a "valid" stub article.
 * 2. Metadata-as-JSON: an unescaped quote inside a Polish title broke
 *    JSON.parse on the whole metadata object.
 *
 * So nothing travels inside a JSON string: responses are plain
 * `key: value` lines, a delimiter, then the body as markdown. Nothing
 * needs escaping anywhere.
 */
export const BODY_DELIMITER = "---BODY---";

/** Separator between tags on the single `tags:` line. */
export const TAG_SEPARATOR = " | ";

/** Prompt fragment describing the response shape; `fieldLines` shows one `key: <hint>` per line. */
export function formatInstructions(fieldLines: string): string {
  return `Respond in exactly this format — one "key: value" line per field, no JSON, no code fences, no commentary before or after:
${fieldLines}
${BODY_DELIMITER}
<the full article body as plain markdown — everything after the delimiter line is the body, nothing else goes there>`;
}

/** Renders an object as the same `key: value` line format the responses use. */
export function serializeFields(fields: Record<string, string | string[] | null>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(TAG_SEPARATOR) : (value ?? "null")}`)
    .join("\n");
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
 * Only keys present in the schema are read; a non-key line folds into the
 * previous field (wrapped value), `tags` splits on "|", and an empty or
 * literal "null" value becomes null for the schema to judge.
 */
export function parseDelimitedResponse<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape>,
  text: string,
  label: string,
): { meta: z.infer<z.ZodObject<Shape>>; body: string } {
  const at = text.indexOf(BODY_DELIMITER);
  if (at === -1) {
    throw new Error(`${label} response is missing the ${BODY_DELIMITER} delimiter`);
  }
  const body = text.slice(at + BODY_DELIMITER.length).trim();
  if (!body) throw new Error(`${label} response has an empty body`);

  const known = new Set(Object.keys(schema.shape));
  const record: Record<string, unknown> = {};
  let lastKey: string | null = null;
  for (const line of text.slice(0, at).split("\n")) {
    if (/^\s*`{3,}/.test(line)) continue;
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    const key = match?.[1].toLowerCase();
    if (match && key && known.has(key)) {
      record[key] = match[2].trim();
      lastKey = key;
    } else if (lastKey && line.trim()) {
      record[lastKey] = `${record[lastKey]} ${line.trim()}`;
    }
  }
  for (const key of known) {
    const value = record[key];
    if (typeof value !== "string") continue;
    if (key === "tags") {
      record[key] = value
        .split("|")
        .map((tag) => tag.trim())
        .filter(Boolean);
    } else if (value === "" || value.toLowerCase() === "null") {
      record[key] = null;
    }
  }

  const parsed = schema.safeParse(record);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`${label} metadata failed validation: ${issues}`);
  }
  return { meta: parsed.data, body };
}
