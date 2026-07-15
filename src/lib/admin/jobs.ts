import { and, count, desc, eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { AuthDb } from "@/lib/auth";

/**
 * A failed job is *resolved* when a later job for the same topic succeeded —
 * the retry did its work, so the old row is history, not an open problem.
 * Failed jobs whose topic was deleted stay unresolved (nothing can rerun them).
 */
const RERUN_SUCCEEDED = sql<number>`EXISTS (
  SELECT 1 FROM ${schema.generationJobs} AS rerun
  WHERE rerun.topic_id = ${schema.generationJobs.topicId}
    AND rerun.status = 'succeeded'
    AND rerun.id > ${schema.generationJobs.id}
)`;

/** Failed jobs still needing attention — resolved ones don't count. */
export async function countUnresolvedFailedJobs(db: AuthDb): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(schema.generationJobs)
    .where(and(eq(schema.generationJobs.status, "failed"), sql`NOT ${RERUN_SUCCEEDED}`));
  return row.total;
}

export type JobRow = {
  job: typeof schema.generationJobs.$inferSelect;
  topicTitle: string | null;
  /** True on failed jobs a later successful run has resolved. */
  resolved: boolean;
};

/** Newest-first job log with topic titles and per-row resolution. */
export async function listJobs(db: AuthDb, limit: number): Promise<JobRow[]> {
  const rows = await db
    .select({
      job: schema.generationJobs,
      topicTitle: schema.topics.title,
      resolved: RERUN_SUCCEEDED,
    })
    .from(schema.generationJobs)
    .leftJoin(schema.topics, eq(schema.generationJobs.topicId, schema.topics.id))
    .orderBy(desc(schema.generationJobs.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    resolved: row.job.status === "failed" && Boolean(row.resolved),
  }));
}
