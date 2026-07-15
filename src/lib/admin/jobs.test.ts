import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import type { AuthDb } from "@/lib/auth";
import { countUnresolvedFailedJobs, listJobs } from "./jobs";

let db: TestDb;
const asDb = () => db as unknown as AuthDb;

beforeEach(() => {
  ({ db } = createTestDb());
});

function insertTopic(title = `T ${Math.random()}`) {
  return db
    .insert(schema.topics)
    .values({ title, normalizedTitle: title.toLowerCase(), status: "approved", source: "admin" })
    .returning()
    .get();
}

function insertJob(topicId: number | null, status: schema.JobStatus) {
  return db
    .insert(schema.generationJobs)
    .values({ topicId, status, trigger: "manual" })
    .returning()
    .get();
}

describe("failed-job resolution", () => {
  it("stops counting a failure once a later run for the same topic succeeds", async () => {
    const topic = insertTopic();
    const failed = insertJob(topic.id, "failed");
    expect(await countUnresolvedFailedJobs(asDb())).toBe(1);

    insertJob(topic.id, "succeeded");
    expect(await countUnresolvedFailedJobs(asDb())).toBe(0);

    const rows = await listJobs(asDb(), 10);
    expect(rows.find((r) => r.job.id === failed.id)?.resolved).toBe(true);
  });

  it("keeps counting failures with no successful rerun", async () => {
    const topic = insertTopic();
    const other = insertTopic();
    insertJob(topic.id, "failed");
    // Success on a *different* topic resolves nothing; earlier successes don't either.
    insertJob(other.id, "succeeded");
    const lateFail = insertJob(other.id, "failed");
    expect(await countUnresolvedFailedJobs(asDb())).toBe(2);

    const rows = await listJobs(asDb(), 10);
    expect(rows.find((r) => r.job.id === lateFail.id)?.resolved).toBe(false);
    // Non-failed rows are never marked resolved.
    expect(rows.filter((r) => r.job.status === "succeeded").every((r) => !r.resolved)).toBe(true);
  });

  it("a failure whose topic was deleted stays unresolved", async () => {
    insertJob(null, "failed");
    insertJob(insertTopic().id, "succeeded");
    expect(await countUnresolvedFailedJobs(asDb())).toBe(1);
  });
});
