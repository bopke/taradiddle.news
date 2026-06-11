import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { BASE_GENERATION_PROMPT } from "./generation";

const suggestionsSchema = z.object({
  topics: z.array(
    z.object({
      title: z.string(),
      description: z.string().nullable(),
    }),
  ),
});

export type SuggestedTopic = z.infer<typeof suggestionsSchema>["topics"][number];

/**
 * Daily self-suggestion: ask Claude for fresh topic ideas, steering away from
 * what's already been covered. Output is in the primary locale; suggestions
 * still pass moderation + dedup before insertion (cron's job).
 */
export async function suggestTopics(
  client: Anthropic,
  opts: {
    model: string;
    count: number;
    hints: string;
    recentTitles: string[];
    primaryLocale: string;
  },
): Promise<SuggestedTopic[]> {
  const message = await client.messages.parse({
    model: opts.model,
    max_tokens: 4096,
    system: `${BASE_GENERATION_PROMPT}

You are brainstorming, not writing articles. Propose exactly ${opts.count} fresh topic ideas for future Taradiddle.news pieces, in the "${opts.primaryLocale}" locale. Each is a headline-ready title plus an optional one-sentence description of the angle. Avoid anything resembling the recent topics provided.${opts.hints ? `\n\nEditorial steering from the admins: ${opts.hints}` : ""}`,
    messages: [
      {
        role: "user",
        content: JSON.stringify({ recent_topics: opts.recentTitles }),
      },
    ],
    output_config: { format: zodOutputFormat(suggestionsSchema) },
  });

  if (!message.parsed_output) {
    throw new Error(
      `self-suggestion returned no parseable output (stop_reason: ${message.stop_reason})`,
    );
  }
  return message.parsed_output.topics;
}
