import { and, eq, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { AuthDb } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/db-errors";
import { normalizeTitle } from "@/lib/slugs";
import { enqueueGeneration, type GenerationQueue } from "@/queue/producer";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** suggested|failed → approved. Other statuses are left untouched. */
export async function approveTopics(db: AuthDb, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(schema.topics)
    .set({ status: "approved", updatedAt: new Date() })
    .where(
      and(inArray(schema.topics.id, ids), inArray(schema.topics.status, ["suggested", "failed"])),
    );
}

/** suggested|approved|failed → rejected. */
export async function rejectTopics(db: AuthDb, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(schema.topics)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(
      and(
        inArray(schema.topics.id, ids),
        inArray(schema.topics.status, ["suggested", "approved", "failed"]),
      ),
    );
}

/**
 * Enqueues generation for topics in a generatable state. Suggested topics are
 * treated as implicitly approved ("Generate now" *is* an approval), failed
 * ones as retries.
 */
export async function generateTopics(
  db: AuthDb,
  queue: GenerationQueue,
  ids: number[],
  requestedBy: string,
): Promise<{ enqueued: number }> {
  if (ids.length === 0) return { enqueued: 0 };
  const eligible = await db
    .select({ id: schema.topics.id })
    .from(schema.topics)
    .where(
      and(
        inArray(schema.topics.id, ids),
        inArray(schema.topics.status, ["suggested", "approved", "failed"]),
      ),
    );
  await enqueueGeneration(
    db,
    queue,
    eligible.map((t) => t.id),
    "batch",
    requestedBy,
  );
  return { enqueued: eligible.length };
}

export type TopicFields = {
  title: string;
  description: string | null;
  categoryId: number | null;
  priority: number;
  scheduledFor: Date | null;
  profileId: number | null;
};

/** Admin-added topic: skips moderation, lands as `suggested`. */
export async function addTopic(
  db: AuthDb,
  fields: TopicFields,
  submittedBy: string,
): Promise<ActionResult & { id?: number }> {
  const [row] = await db
    .insert(schema.topics)
    .values({
      ...fields,
      normalizedTitle: normalizeTitle(fields.title),
      source: "admin",
      submittedBy,
    })
    .onConflictDoNothing({ target: schema.topics.normalizedTitle })
    .returning();
  if (!row) return { ok: false, error: "A topic with this title already exists." };
  return { ok: true, id: row.id };
}

export async function updateTopic(
  db: AuthDb,
  id: number,
  fields: TopicFields,
): Promise<ActionResult> {
  const [existing] = await db.select().from(schema.topics).where(eq(schema.topics.id, id));
  if (!existing) return { ok: false, error: "Topic not found." };

  const normalizedTitle = normalizeTitle(fields.title);
  if (normalizedTitle !== existing.normalizedTitle) {
    const [clash] = await db
      .select({ id: schema.topics.id })
      .from(schema.topics)
      .where(eq(schema.topics.normalizedTitle, normalizedTitle));
    if (clash) return { ok: false, error: "A topic with this title already exists." };
  }

  try {
    await db
      .update(schema.topics)
      .set({ ...fields, normalizedTitle, updatedAt: new Date() })
      .where(eq(schema.topics.id, id));
  } catch (error) {
    // Race: a clashing topic landed between the pre-check and this update.
    if (isUniqueViolation(error, "normalized_title")) {
      return { ok: false, error: "A topic with this title already exists." };
    }
    throw error;
  }
  return { ok: true };
}

export async function addTopicNote(
  db: AuthDb,
  topicId: number,
  authorId: string,
  body: string,
): Promise<ActionResult> {
  if (!body.trim()) return { ok: false, error: "Note is empty." };
  await db.insert(schema.topicNotes).values({ topicId, authorId, body: body.trim() });
  return { ok: true };
}
