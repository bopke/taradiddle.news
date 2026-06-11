import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { slugify } from "./slugs";

const translationSchema = z.object({
  title: z.string(),
  summary: z.string(),
  meta_description: z.string(),
  body_md: z.string(),
  image_alt: z.string().nullable(),
  /** Translated tag names, same order as the input list. */
  tags: z.array(z.string()),
});

export type ArticleSource = {
  title: string;
  summary: string;
  metaDescription: string;
  bodyMd: string;
  imageAlt: string | null;
  tags: string[];
};

export type TranslatedArticle = z.infer<typeof translationSchema> & {
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

  const message = await client.messages.parse({
    model,
    max_tokens: 8192,
    system: `You translate satirical news articles for Taradiddle.news from "${sourceLocale}" to "${targetLocale}".
Translate faithfully but idiomatically — the deadpan newspaper register and the jokes must land in the target language; adapt wordplay rather than translating it literally. Keep markdown structure (paragraphs, the "> " pull quote) intact. Keep fictional names as they are. meta_description stays ~155 characters. Translate each tag in order. Translate image_alt when given, else return null.`,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          title: article.title,
          summary: article.summary,
          meta_description: article.metaDescription,
          body_md: article.bodyMd,
          image_alt: article.imageAlt,
          tags: article.tags,
        }),
      },
    ],
    output_config: { format: zodOutputFormat(translationSchema) },
  });

  if (!message.parsed_output) {
    throw new Error(
      `translation to ${targetLocale} returned no parseable output (stop_reason: ${message.stop_reason})`,
    );
  }
  return { ...message.parsed_output, slug: slugify(message.parsed_output.title) };
}
