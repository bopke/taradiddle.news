import type Anthropic from "@anthropic-ai/sdk";
import { desc, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { AuthDb } from "@/lib/auth";
import { moderateTopic } from "@/lib/moderation";
import { getSettings } from "@/lib/settings";
import { normalizeTitle } from "@/lib/slugs";
import { suggestTopics } from "@/lib/suggestion";

/** How many recent topic titles steer the model away from repeats. */
const RECENT_TITLES = 25;

/**
 * Daily self-suggestion: ask Claude for fresh topics, screen each through
 * moderation, dedup (the unique index on normalized_title is the backstop),
 * insert the survivors as `suggested` with source "ai".
 */
export async function runSelfSuggest(deps: {
  db: AuthDb;
  anthropic: Anthropic;
}): Promise<{ inserted: number; flagged: number; duplicates: number }> {
  const { db, anthropic } = deps;
  const settings = await getSettings(db);
  if (!settings.self_suggest_enabled) return { inserted: 0, flagged: 0, duplicates: 0 };

  const [defaultProfile] = await db
    .select()
    .from(schema.generationProfiles)
    .where(eq(schema.generationProfiles.isDefault, true));
  if (!defaultProfile) throw new Error("no default generation profile configured");

  const recent = await db
    .select({ title: schema.topics.title })
    .from(schema.topics)
    .orderBy(desc(schema.topics.createdAt))
    .limit(RECENT_TITLES);

  const suggestions = await suggestTopics(anthropic, {
    model: defaultProfile.model,
    count: settings.self_suggest_count,
    hints: settings.self_suggest_hints,
    recentTitles: recent.map((t) => t.title),
    primaryLocale: settings.default_locale,
  });

  let inserted = 0;
  let flagged = 0;
  let duplicates = 0;

  for (const suggestion of suggestions) {
    const moderation = await moderateTopic(anthropic, settings, suggestion);
    if (moderation.kind === "flagged") {
      flagged++;
      continue;
    }
    const title = moderation.kind === "allowed" ? moderation.title : suggestion.title;
    const description =
      moderation.kind === "allowed" ? moderation.description : (suggestion.description ?? null);

    const [row] = await db
      .insert(schema.topics)
      .values({
        title,
        normalizedTitle: normalizeTitle(title),
        description,
        source: "ai",
      })
      .onConflictDoNothing({ target: schema.topics.normalizedTitle })
      .returning();
    if (row) inserted++;
    else duplicates++;
  }

  console.log(
    `self-suggest: ${inserted} inserted, ${flagged} filtered by moderation, ${duplicates} duplicates skipped`,
  );
  return { inserted, flagged, duplicates };
}
