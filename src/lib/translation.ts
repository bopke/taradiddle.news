import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  BODY_DELIMITER,
  extractText,
  formatInstructions,
  parseDelimitedResponse,
  serializeFields,
} from "./ai-output";
import { slugify } from "./slugs";

/**
 * Metadata fields only — body_md arrives after the ---BODY--- delimiter as
 * plain markdown, outside the JSON (see ai-output.ts for why).
 */
export const translationMetaSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  meta_description: z.string().min(1),
  image_alt: z.string().nullable(),
  /** Translated tag names, same order as the input list. */
  tags: z.array(z.string().min(1).max(60)).max(10),
});

export type ArticleSource = {
  title: string;
  summary: string;
  metaDescription: string;
  bodyMd: string;
  imageAlt: string | null;
  tags: string[];
};

export type TranslatedArticle = z.infer<typeof translationMetaSchema> & {
  body_md: string;
  /** Derived locally from the translated title (deterministic). */
  slug: string;
};

export async function translateArticle(
  client: Anthropic,
  model: string,
  opts: {
    sourceLocale: string;
    targetLocale: string;
    article: ArticleSource;
  },
): Promise<TranslatedArticle> {
  const { sourceLocale, targetLocale, article } = opts;
  const label = `translation to ${targetLocale}`;

  // The source travels in the same shape the response must use: `key: value`
  // metadata lines, delimiter, then the body as plain markdown.
  const sourceMeta = serializeFields({
    title: article.title,
    summary: article.summary,
    meta_description: article.metaDescription,
    image_alt: article.imageAlt,
    tags: article.tags,
  });

  const message = await client.messages.create({
    model,
    max_tokens: 8192,
    system: `You translate satirical news articles for Taradiddle.news from "${sourceLocale}" to "${targetLocale}".
Translate faithfully but idiomatically — the deadpan newspaper register and the jokes must land in the target language; adapt wordplay rather than translating it literally. Translate the body in full — every paragraph, never a summary. Keep markdown structure (paragraphs, the "> " pull quote) intact. Keep fictional names as they are. meta_description stays ~155 characters. Translate image_alt when given, else return null.
Tags are short keywords (1-3 words each), never sentences: translate each input tag in order and return exactly as many tags as you were given - nothing else goes in the tags array.
Quotation marks: prefer the target language's typographic quotes (e.g. „ ” for Polish, “ ” for English).

The input uses the same format as your response.
${formatInstructions(`title: <translated headline>
summary: <translated, one line>
meta_description: <translated, ~155 characters, one line>
image_alt: <translated, or null when the input was null>
tags: <the translated tags separated by " | ", same count and order as the input>`)}`,
    messages: [
      {
        role: "user",
        content: `${sourceMeta}\n${BODY_DELIMITER}\n${article.bodyMd}`,
      },
    ],
  });

  const text = extractText(message, label);
  const { meta, body } = parseDelimitedResponse(translationMetaSchema, text, label);

  // Translations shrink a bit between languages, but never to a fraction —
  // fail loudly so the job retries instead of publishing a stub.
  if (body.length < article.bodyMd.length * 0.4) {
    throw new Error(
      `${label} is suspiciously short ` +
        `(${body.length} chars vs ${article.bodyMd.length} source) — likely truncated`,
    );
  }
  return { ...meta, body_md: body, slug: slugify(meta.title) };
}
