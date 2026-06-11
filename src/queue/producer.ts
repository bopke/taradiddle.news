import { eq, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { AuthDb } from "@/lib/auth";
import type { GenerationMessage } from "./messages";

/** Structural subset of Queue<GenerationMessage> — easy to fake in tests. */
export type GenerationQueue = {
  send: (message: GenerationMessage) => Promise<unknown>;
};

/**
 * Enqueues full article generation for the given topics: topic → `queued`,
 * one generation_jobs row and one queue message per topic. Used by the admin
 * Generate button, the batch toolbar and the cron sweep — they only differ in
 * `trigger`.
 */
export async function enqueueGeneration(
  db: AuthDb,
  queue: GenerationQueue,
  topicIds: number[],
  trigger: "manual" | "cron" | "batch",
  requestedBy?: string,
): Promise<void> {
  if (topicIds.length === 0) return;

  await db
    .update(schema.topics)
    .set({ status: "queued", updatedAt: new Date() })
    .where(inArray(schema.topics.id, topicIds));

  for (const topicId of topicIds) {
    const [job] = await db
      .insert(schema.generationJobs)
      .values({ topicId, trigger, status: "queued" })
      .returning();
    await queue.send({ kind: "generate", topicId, jobId: job.id, trigger, requestedBy });
  }
}

/**
 * Re-runs generation for an existing article (admin "Regenerate", after
 * confirmation). The new content replaces the old in place.
 */
export async function enqueueRegeneration(
  db: AuthDb,
  queue: GenerationQueue,
  articleId: number,
  requestedBy?: string,
): Promise<void> {
  const [article] = await db
    .select()
    .from(schema.articles)
    .where(eq(schema.articles.id, articleId));
  if (!article) throw new Error(`article ${articleId} not found`);
  if (article.topicId === null) {
    throw new Error(`article ${articleId} has no topic (topic deleted) — cannot regenerate`);
  }

  await db
    .update(schema.topics)
    .set({ status: "queued", updatedAt: new Date() })
    .where(eq(schema.topics.id, article.topicId));
  const [job] = await db
    .insert(schema.generationJobs)
    .values({ topicId: article.topicId, articleId, trigger: "manual", status: "queued" })
    .returning();
  await queue.send({
    kind: "generate",
    topicId: article.topicId,
    jobId: job.id,
    trigger: "manual",
    requestedBy,
    replaceArticleId: articleId,
  });
}

/** Retries a single missing/poor translation (admin article editor). */
export async function enqueueTranslation(
  db: AuthDb,
  queue: GenerationQueue,
  articleId: number,
  locale: string,
): Promise<void> {
  const [job] = await db
    .insert(schema.generationJobs)
    .values({ articleId, trigger: "translate", status: "queued" })
    .returning();
  await queue.send({ kind: "translate", articleId, jobId: job.id, locale });
}
