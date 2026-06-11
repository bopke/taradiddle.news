import type Anthropic from "@anthropic-ai/sdk";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { createAnthropicClient, describeAnthropicError } from "@/lib/anthropic";
import type { AuthDb } from "@/lib/auth";
import { generateArticle, type GeneratedArticle } from "@/lib/generation";
import { generateHeroImage, type ImageBindings } from "@/lib/images";
import { getSettings } from "@/lib/settings";
import { slugify, uniqueSlug } from "@/lib/slugs";
import { translateArticle, type ArticleSource } from "@/lib/translation";
import type { GenerateArticleMessage, GenerationMessage, TranslateArticleMessage } from "./messages";

/**
 * Keep in sync with `max_retries: 3` in wrangler.jsonc: 1 initial delivery +
 * 3 retries. On the final failed attempt the topic/job are marked failed and
 * the message still goes to the DLQ for inspection.
 */
export const MAX_ATTEMPTS = 4;

export type ConsumerDeps = {
  db: AuthDb;
  anthropic: Anthropic;
  images: ImageBindings;
};

/** Worker entrypoint: builds deps from bindings and processes the batch. */
export async function handleGenerationBatch(
  batch: MessageBatch<GenerationMessage>,
  env: CloudflareEnv,
  _ctx: ExecutionContext,
): Promise<void> {
  const deps: ConsumerDeps = {
    db: getDb(env) as unknown as AuthDb,
    anthropic: createAnthropicClient(env),
    images: { ai: env.AI, bucket: env.IMAGE_BUCKET },
  };

  for (const message of batch.messages) {
    await consumeMessage(deps, message);
  }
}

/** Per-message wrapper: success → ack; failure → bookkeeping + retry/DLQ. */
export async function consumeMessage(
  deps: ConsumerDeps,
  message: Pick<Message<GenerationMessage>, "body" | "attempts" | "ack" | "retry">,
): Promise<void> {
  try {
    await processMessage(deps, message.body, message.attempts);
    message.ack();
  } catch (error) {
    const isFinal = message.attempts >= MAX_ATTEMPTS;
    await recordFailure(deps.db, message.body, error, message.attempts, isFinal).catch((e) =>
      console.error("failed to record generation failure", e),
    );
    // On the final attempt Queues routes the message to the DLQ.
    message.retry({ delaySeconds: 30 * message.attempts });
  }
}

export async function processMessage(
  deps: ConsumerDeps,
  body: GenerationMessage,
  attempt: number,
): Promise<void> {
  if (body.kind === "generate") return processGenerate(deps, body, attempt);
  return processTranslate(deps, body, attempt);
}

/* ---------------------------------------------------------------------------
 * Full generation (new article or in-place regeneration)
 * ------------------------------------------------------------------------- */

async function processGenerate(
  deps: ConsumerDeps,
  body: GenerateArticleMessage,
  attempt: number,
): Promise<void> {
  const { db } = deps;

  const [topic] = await db.select().from(schema.topics).where(eq(schema.topics.id, body.topicId));
  if (!topic) {
    console.warn(`topic ${body.topicId} gone — acking message`);
    return;
  }
  // Idempotency: Queues is at-least-once. A topic already done (and not being
  // regenerated) means a duplicate delivery — skip.
  if (topic.status === "done" && !body.replaceArticleId) return;

  await db
    .update(schema.generationJobs)
    .set({ status: "running", attempt, startedAt: new Date() })
    .where(eq(schema.generationJobs.id, body.jobId));
  await db
    .update(schema.topics)
    .set({ status: "generating", updatedAt: new Date() })
    .where(eq(schema.topics.id, topic.id));

  // A previous attempt may have crashed after inserting the article but
  // before finishing — clean up so retries start fresh.
  if (!body.replaceArticleId) {
    await db.delete(schema.articles).where(eq(schema.articles.topicId, topic.id));
  }

  const settings = await getSettings(db);
  const profile = await resolveProfile(db, topic.profileId);
  const categories = await loadCategories(db, settings.default_locale);

  const generated = await generateArticle(deps.anthropic, profile, {
    topic: { title: topic.title, description: topic.description },
    categories: topic.categoryId === null ? categories.map(({ slug, name }) => ({ slug, name })) : [],
    categoryAssigned: topic.categoryId !== null,
    primaryLocale: settings.default_locale,
  });

  const categoryId = resolveCategoryId(topic.categoryId, generated, categories);
  const partialFailures: string[] = [];

  // Hero image — non-fatal.
  const primarySlugBase = slugify(generated.title);
  const imageKey = await generateHeroImage(deps.images, {
    prompt: generated.image_prompt,
    key: `articles/${primarySlugBase}-${Date.now()}.jpg`,
  });
  if (!imageKey) partialFailures.push("hero image generation failed");

  // Insert or replace the article core.
  let articleId: number;
  if (body.replaceArticleId) {
    articleId = body.replaceArticleId;
    await db
      .update(schema.articles)
      .set({
        categoryId,
        model: profile.model,
        profileId: profile.id,
        imageKey,
        generatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.articles.id, articleId));
    await db
      .delete(schema.articleTranslations)
      .where(eq(schema.articleTranslations.articleId, articleId));
    await db.delete(schema.articleTags).where(eq(schema.articleTags.articleId, articleId));
  } else {
    const [article] = await db
      .insert(schema.articles)
      .values({
        topicId: topic.id,
        categoryId,
        model: profile.model,
        profileId: profile.id,
        imageKey,
      })
      .returning();
    articleId = article.id;
  }

  // Primary translation + tags.
  const primarySlug = await freeSlug(db, settings.default_locale, primarySlugBase, articleId);
  await db.insert(schema.articleTranslations).values({
    articleId,
    locale: settings.default_locale,
    title: generated.title,
    slug: primarySlug,
    summary: generated.summary,
    metaDescription: generated.meta_description,
    bodyMd: generated.body_md,
    imageAlt: imageKey ? generated.image_alt : null,
  });
  const tagIds = await upsertTags(db, settings.default_locale, generated.tags);
  for (const tagId of tagIds) {
    await db.insert(schema.articleTags).values({ articleId, tagId }).onConflictDoNothing();
  }

  // Secondary locales — each non-fatal.
  const source: ArticleSource = {
    title: generated.title,
    summary: generated.summary,
    metaDescription: generated.meta_description,
    bodyMd: generated.body_md,
    imageAlt: imageKey ? generated.image_alt : null,
    tags: generated.tags,
  };
  for (const locale of settings.locales.filter((l) => l !== settings.default_locale)) {
    try {
      await addTranslation(deps, articleId, settings.default_locale, locale, source, tagIds, profile.model);
    } catch (error) {
      console.warn(`translation to ${locale} failed (non-fatal)`, error);
      partialFailures.push(`translation to ${locale} failed: ${describeAnthropicError(error)}`);
    }
  }

  await db
    .update(schema.topics)
    .set({ status: "done", updatedAt: new Date() })
    .where(eq(schema.topics.id, topic.id));
  await db
    .update(schema.generationJobs)
    .set({
      status: "succeeded",
      articleId,
      error: partialFailures.length ? `partial: ${partialFailures.join("; ")}` : null,
      finishedAt: new Date(),
    })
    .where(eq(schema.generationJobs.id, body.jobId));
}

/* ---------------------------------------------------------------------------
 * Single-locale translation retry
 * ------------------------------------------------------------------------- */

async function processTranslate(
  deps: ConsumerDeps,
  body: TranslateArticleMessage,
  attempt: number,
): Promise<void> {
  const { db } = deps;

  const [article] = await db
    .select()
    .from(schema.articles)
    .where(eq(schema.articles.id, body.articleId));
  if (!article) {
    console.warn(`article ${body.articleId} gone — acking translate message`);
    return;
  }

  await db
    .update(schema.generationJobs)
    .set({ status: "running", attempt, startedAt: new Date() })
    .where(eq(schema.generationJobs.id, body.jobId));

  const settings = await getSettings(db);
  const [primary] = await db
    .select()
    .from(schema.articleTranslations)
    .where(
      and(
        eq(schema.articleTranslations.articleId, article.id),
        eq(schema.articleTranslations.locale, settings.default_locale),
      ),
    );
  if (!primary) throw new Error(`article ${article.id} has no primary translation`);

  const tagRows = await db
    .select({ tagId: schema.articleTags.tagId, name: schema.tagTranslations.name })
    .from(schema.articleTags)
    .innerJoin(
      schema.tagTranslations,
      and(
        eq(schema.tagTranslations.tagId, schema.articleTags.tagId),
        eq(schema.tagTranslations.locale, settings.default_locale),
      ),
    )
    .where(eq(schema.articleTags.articleId, article.id));

  await addTranslation(
    deps,
    article.id,
    settings.default_locale,
    body.locale,
    {
      title: primary.title,
      summary: primary.summary,
      metaDescription: primary.metaDescription,
      bodyMd: primary.bodyMd,
      imageAlt: primary.imageAlt,
      tags: tagRows.map((t) => t.name),
    },
    tagRows.map((t) => t.tagId),
    article.model,
  );

  await db
    .update(schema.generationJobs)
    .set({ status: "succeeded", finishedAt: new Date() })
    .where(eq(schema.generationJobs.id, body.jobId));
}

/* ---------------------------------------------------------------------------
 * Shared helpers
 * ------------------------------------------------------------------------- */

async function addTranslation(
  deps: ConsumerDeps,
  articleId: number,
  sourceLocale: string,
  targetLocale: string,
  source: ArticleSource,
  tagIds: number[],
  model: string,
): Promise<void> {
  const translated = await translateArticle(deps.anthropic, model, {
    sourceLocale,
    targetLocale,
    article: source,
  });

  const slug = await freeSlug(deps.db, targetLocale, translated.slug, articleId);
  await deps.db
    .insert(schema.articleTranslations)
    .values({
      articleId,
      locale: targetLocale,
      title: translated.title,
      slug,
      summary: translated.summary,
      metaDescription: translated.meta_description,
      bodyMd: translated.body_md,
      imageAlt: translated.image_alt,
    })
    .onConflictDoUpdate({
      target: [schema.articleTranslations.articleId, schema.articleTranslations.locale],
      set: {
        title: translated.title,
        slug,
        summary: translated.summary,
        metaDescription: translated.meta_description,
        bodyMd: translated.body_md,
        imageAlt: translated.image_alt,
        translatedAt: new Date(),
      },
    });

  // Tag names come back translated in input order; tolerate dropped items.
  for (let i = 0; i < tagIds.length && i < translated.tags.length; i++) {
    await deps.db
      .insert(schema.tagTranslations)
      .values({
        tagId: tagIds[i],
        locale: targetLocale,
        name: translated.tags[i],
        slug: await freeTagSlug(deps.db, targetLocale, slugify(translated.tags[i]), tagIds[i]),
      })
      .onConflictDoNothing();
  }
}

async function resolveProfile(db: AuthDb, profileId: number | null) {
  const [profile] = profileId
    ? await db
        .select()
        .from(schema.generationProfiles)
        .where(eq(schema.generationProfiles.id, profileId))
    : [];
  if (profile) return profile;

  const [fallback] = await db
    .select()
    .from(schema.generationProfiles)
    .where(eq(schema.generationProfiles.isDefault, true));
  if (!fallback) throw new Error("no default generation profile configured");
  return fallback;
}

type CategoryRow = { id: number; slug: string; name: string };

async function loadCategories(db: AuthDb, locale: string): Promise<CategoryRow[]> {
  return db
    .select({
      id: schema.categoryTranslations.categoryId,
      slug: schema.categoryTranslations.slug,
      name: schema.categoryTranslations.name,
    })
    .from(schema.categoryTranslations)
    .where(eq(schema.categoryTranslations.locale, locale));
}

function resolveCategoryId(
  assigned: number | null,
  generated: GeneratedArticle,
  categories: CategoryRow[],
): number {
  if (assigned !== null) return assigned;
  const match = categories.find((c) => c.slug === generated.category_slug);
  if (match) return match.id;
  if (categories.length === 0) throw new Error("no categories exist — seed the database");
  console.warn(
    `model picked unknown category "${generated.category_slug}" — falling back to "${categories[0].slug}"`,
  );
  return categories[0].id;
}

/** First free slug in a locale, ignoring the article's own row (for upserts). */
async function freeSlug(
  db: AuthDb,
  locale: string,
  base: string,
  articleId: number,
): Promise<string> {
  return uniqueSlug(base, async (candidate) => {
    const rows = await db
      .select({ articleId: schema.articleTranslations.articleId })
      .from(schema.articleTranslations)
      .where(
        and(
          eq(schema.articleTranslations.locale, locale),
          eq(schema.articleTranslations.slug, candidate),
          ne(schema.articleTranslations.articleId, articleId),
        ),
      );
    return rows.length > 0;
  });
}

async function freeTagSlug(
  db: AuthDb,
  locale: string,
  base: string,
  tagId: number,
): Promise<string> {
  return uniqueSlug(base, async (candidate) => {
    const rows = await db
      .select({ tagId: schema.tagTranslations.tagId })
      .from(schema.tagTranslations)
      .where(
        and(
          eq(schema.tagTranslations.locale, locale),
          eq(schema.tagTranslations.slug, candidate),
          ne(schema.tagTranslations.tagId, tagId),
        ),
      );
    return rows.length > 0;
  });
}

/** Tags by primary-locale slug: reuse existing, create missing; returns ids in input order. */
async function upsertTags(db: AuthDb, locale: string, names: string[]): Promise<number[]> {
  const ids: number[] = [];
  for (const name of names) {
    const slug = slugify(name);
    const [existing] = await db
      .select({ tagId: schema.tagTranslations.tagId })
      .from(schema.tagTranslations)
      .where(and(eq(schema.tagTranslations.locale, locale), eq(schema.tagTranslations.slug, slug)));
    if (existing) {
      ids.push(existing.tagId);
      continue;
    }
    const [tag] = await db.insert(schema.tags).values({}).returning();
    await db.insert(schema.tagTranslations).values({ tagId: tag.id, locale, name, slug });
    ids.push(tag.id);
  }
  return ids;
}

async function recordFailure(
  db: AuthDb,
  body: GenerationMessage,
  error: unknown,
  attempt: number,
  isFinal: boolean,
): Promise<void> {
  await db
    .update(schema.generationJobs)
    .set({
      status: isFinal ? "failed" : "queued",
      attempt,
      error: describeAnthropicError(error),
      finishedAt: isFinal ? new Date() : null,
    })
    .where(eq(schema.generationJobs.id, body.jobId));

  if (body.kind === "generate") {
    await db
      .update(schema.topics)
      .set({ status: isFinal ? "failed" : "queued", updatedAt: new Date() })
      .where(eq(schema.topics.id, body.topicId));
  }
}
