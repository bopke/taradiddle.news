import { and, asc, desc, eq, isNull, lte, or } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { AuthDb } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { enqueueGeneration, type GenerationQueue } from "@/queue/producer";

/**
 * Auto-generate: when enabled, picks due approved
 * topics — highest priority first, oldest first within a priority — up to the
 * per-run cap and enqueues them
 * for generation.
 */
export async function runAutoGenerate(
  deps: { db: AuthDb; queue: GenerationQueue },
  now: Date = new Date(),
): Promise<{ enqueued: number }> {
  const settings = await getSettings(deps.db);
  if (!settings.auto_generate_enabled) return { enqueued: 0 };

  const due = await deps.db
    .select({ id: schema.topics.id })
    .from(schema.topics)
    .where(
      and(
        eq(schema.topics.status, "approved"),
        or(isNull(schema.topics.scheduledFor), lte(schema.topics.scheduledFor, now)),
      ),
    )
    .orderBy(desc(schema.topics.priority), asc(schema.topics.createdAt))
    .limit(settings.auto_generate_batch_size);

  await enqueueGeneration(
    deps.db,
    deps.queue,
    due.map((t) => t.id),
    "cron",
  );
  if (due.length > 0) console.log(`auto-generate: enqueued ${due.length} topic(s)`);
  return { enqueued: due.length };
}
