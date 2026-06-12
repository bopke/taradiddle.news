import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const articleSchema = z.object({
  title: z.string(),
  /** Human-facing lede, 1–2 sentences. */
  summary: z.string(),
  /** ~155-char search-optimized description (distinct from the lede). */
  meta_description: z.string(),
  tags: z.array(z.string().min(1).max(60)).max(10),
  /** Chosen from the provided list; null when the topic came pre-categorized. */
  category_slug: z.string().nullable(),
  /** Prompt for the hero-image model (Flux). */
  image_prompt: z.string(),
  image_alt: z.string(),
  body_md: z.string(),
});

export type GeneratedArticle = z.infer<typeof articleSchema>;

/** The subset of a generation_profiles row the generator needs. */
export type GenerationProfileInput = {
  model: string;
  temperature: number | null;
  maxOutputTokens: number;
  instructions: string;
};

export type GenerationContext = {
  topic: { title: string; description: string | null };
  /** Slug+name pairs the model may pick from; empty when pre-assigned. */
  categories: { slug: string; name: string }[];
  /** When the topic was pre-categorized the model must not pick one. */
  categoryAssigned: boolean;
  primaryLocale: string;
};

/**
 * The site's voice. Profile instructions are appended, so profiles can narrow
 * (length, register, beat) but the satire ground rules always apply.
 */
export const BASE_GENERATION_PROMPT = `You are the staff writer for Taradiddle.news, a satirical news site. Tagline: "tar·a·did·dle — a petty lie; pretentious nonsense."

Write one deadpan satirical news article about the topic provided. Ground rules:
- The humor is The Onion's school: a straight-faced, classic-newspaper register wrapped around a premise that is obviously, checkably untrue. The chrome plays it straight; the absurdity does the work.
- Obviously untrue means obviously: never write plausible misinformation. A reader skimming the headline alone must be in on the joke.
- Punch up or sideways: institutions, industries, technology, public figures in their public roles, everyday absurdity. Never mock private individuals, tragedies, or vulnerable groups.
- Quote at least one fictional source. Fictional names must be clearly invented; fictional experts get absurdly specific affiliations.
- body_md is plain markdown: short paragraphs, no headings, no images. You may include exactly one pull quote as a markdown blockquote ("> ...") if the piece earns it.
- The dateline city, if any, is plain text at the start of the first paragraph.
- Quotation marks: use typographic curly quotes (“ ” and ‘ ’) everywhere — never straight ASCII double quotes (") in any text field.
- image_prompt describes a photorealistic news photo for the story (no text in image, no real people's likenesses); image_alt describes it for screen readers.
- meta_description is for search results: ~155 characters, factual-sounding, still funny.`;

export function buildGenerationMessages(ctx: GenerationContext): {
  system: string;
  user: string;
} {
  const categoryRule = ctx.categoryAssigned
    ? `The article's category is already assigned — return null for category_slug.`
    : `Pick the best-fitting category_slug from: ${ctx.categories
        .map((c) => `"${c.slug}" (${c.name})`)
        .join(", ")}.`;

  const system = `${BASE_GENERATION_PROMPT}

Write in the "${ctx.primaryLocale}" locale. ${categoryRule}
Provide 2-5 short topical tags (lowercase, 1-3 words each, in "${ctx.primaryLocale}") - keywords only, never sentences.`;

  const user = JSON.stringify({
    topic: ctx.topic.title,
    context: ctx.topic.description,
  });

  return { system, user };
}

export async function generateArticle(
  client: Anthropic,
  profile: GenerationProfileInput,
  ctx: GenerationContext,
): Promise<GeneratedArticle> {
  const { system, user } = buildGenerationMessages(ctx);

  const message = await client.messages.parse({
    model: profile.model,
    max_tokens: profile.maxOutputTokens,
    // Omitted when null: profiles default to the model's own sampling, and
    // newer Opus models (4.7+) reject the parameter outright.
    ...(profile.temperature !== null ? { temperature: profile.temperature } : {}),
    system: profile.instructions ? `${system}\n\n${profile.instructions}` : system,
    messages: [{ role: "user", content: user }],
    output_config: { format: zodOutputFormat(articleSchema) },
  });

  if (!message.parsed_output) {
    throw new Error(
      `generation returned no parseable article (stop_reason: ${message.stop_reason})`,
    );
  }

  // Truncation guard: a bare '"' inside body_md legally closes the JSON
  // string under constrained decoding, yielding a "valid" stub article (seen
  // in production at 284 chars). No real profile writes this little — fail
  // loudly so the job retries instead of publishing the stub.
  if (message.parsed_output.body_md.length < 500) {
    throw new Error(
      `generated body is suspiciously short (${message.parsed_output.body_md.length} chars) — likely truncated by an unescaped quote`,
    );
  }
  return message.parsed_output;
}
