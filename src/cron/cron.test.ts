import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import type { AuthDb } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import { mockAnthropicClient } from "@/lib/test-utils";
import type { GenerationMessage } from "@/queue/messages";
import { runAutoGenerate } from "./auto-generate";
import { runSelfSuggest } from "./self-suggest";

let db: TestDb;
const asDb = () => db as unknown as AuthDb;

beforeEach(() => {
  ({ db } = createTestDb());
});

function makeQueue() {
  const sent: GenerationMessage[] = [];
  return { sent, queue: { send: async (m: GenerationMessage) => void sent.push(m) } };
}

function insertTopic(overrides: Partial<typeof schema.topics.$inferInsert> = {}) {
  return db
    .insert(schema.topics)
    .values({
      title: `Topic ${Math.random()}`,
      normalizedTitle: `topic ${Math.random()}`,
      status: "approved",
      source: "admin",
      ...overrides,
    })
    .returning()
    .get();
}

const NOW = new Date("2026-06-11T12:00:00Z");

describe("runAutoGenerate", () => {
  it("does nothing while disabled (default)", async () => {
    insertTopic();
    const { queue, sent } = makeQueue();
    const result = await runAutoGenerate({ db: asDb(), queue }, NOW);
    expect(result.enqueued).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("enqueues only due approved topics", async () => {
    await setSetting(asDb(), "auto_generate_enabled", true);
    const due = insertTopic();
    const futureDate = new Date("2026-06-12T00:00:00Z");
    insertTopic({ scheduledFor: futureDate }); // not due yet
    insertTopic({ status: "suggested" });
    insertTopic({ status: "done" });
    const scheduledPast = insertTopic({ scheduledFor: new Date("2026-06-10T00:00:00Z") });

    const { queue, sent } = makeQueue();
    const result = await runAutoGenerate({ db: asDb(), queue }, NOW);

    expect(result.enqueued).toBe(2);
    const ids = sent.map((m) => (m.kind === "generate" ? m.topicId : -1)).sort();
    expect(ids).toEqual([due.id, scheduledPast.id].sort());
    expect(sent.every((m) => m.kind === "generate" && m.trigger === "cron")).toBe(true);

    // Topics moved to queued with job rows.
    const topics = db.select().from(schema.topics).all();
    expect(topics.filter((t) => t.status === "queued")).toHaveLength(2);
    expect(db.select().from(schema.generationJobs).all()).toHaveLength(2);
  });

  it("respects the batch cap, ordering by priority then age", async () => {
    await setSetting(asDb(), "auto_generate_enabled", true);
    await setSetting(asDb(), "auto_generate_batch_size", 2);

    const old = new Date("2026-06-01T00:00:00Z");
    const newer = new Date("2026-06-05T00:00:00Z");
    insertTopic({ priority: 0, createdAt: old }); // lowest priority — cut by cap
    const highPriority = insertTopic({ priority: 10, createdAt: newer });
    const oldMedium = insertTopic({ priority: 5, createdAt: old });
    insertTopic({ priority: 5, createdAt: newer }); // same priority, younger — cut

    const { queue, sent } = makeQueue();
    const result = await runAutoGenerate({ db: asDb(), queue }, NOW);

    expect(result.enqueued).toBe(2);
    const ids = sent.map((m) => (m.kind === "generate" ? m.topicId : -1));
    expect(ids).toEqual([highPriority.id, oldMedium.id]);
  });
});

describe("runSelfSuggest", () => {
  const SUGGESTIONS = {
    topics: [
      { title: "Area Printer Achieves Sentience", description: "still jams" },
      { title: "Nation's Plants Unionize", description: null },
      { title: "Something Cruel", description: null },
    ],
  };

  const ALLOW = {
    allow: true,
    reason: null,
    detected_locale: "en",
    title_primary: null,
    description_primary: null,
  };

  function makeClient() {
    return mockAnthropicClient((call) => {
      if (call.system.includes("brainstorming")) return SUGGESTIONS;
      // Moderation: flag the cruel one.
      const input = JSON.parse(call.messages[0].content) as { title: string };
      return input.title === "Something Cruel"
        ? { ...ALLOW, allow: false, reason: "cruel" }
        : ALLOW;
    });
  }

  function seedProfile() {
    db.insert(schema.generationProfiles)
      .values({
        name: "House style",
        model: "claude-sonnet-4-6",
        maxOutputTokens: 4096,
        instructions: "",
        isDefault: true,
      })
      .run();
  }

  it("does nothing while disabled (default)", async () => {
    seedProfile();
    const { client, parseMock } = makeClient();
    const result = await runSelfSuggest({ db: asDb(), anthropic: client });
    expect(result).toEqual({ inserted: 0, flagged: 0, duplicates: 0 });
    expect(parseMock).not.toHaveBeenCalled();
  });

  it("inserts allowed suggestions as ai-sourced topics, dropping flagged ones", async () => {
    seedProfile();
    await setSetting(asDb(), "self_suggest_enabled", true);
    await setSetting(asDb(), "self_suggest_count", 3);
    await setSetting(asDb(), "self_suggest_hints", "more tech");

    const { client, parseMock } = makeClient();
    const result = await runSelfSuggest({ db: asDb(), anthropic: client });

    expect(result).toEqual({ inserted: 2, flagged: 1, duplicates: 0 });
    const topics = db.select().from(schema.topics).all();
    expect(topics).toHaveLength(2);
    expect(topics.every((t) => t.source === "ai" && t.status === "suggested")).toBe(true);
    expect(topics.every((t) => t.normalizedTitle.length > 0)).toBe(true);

    // The brainstorm call used the default profile's model and the settings.
    const brainstorm = parseMock.mock.calls
      .map((c) => c[0])
      .find((c) => c.system.includes("brainstorming"))!;
    expect(brainstorm.model).toBe("claude-sonnet-4-6");
    expect(brainstorm.system).toContain("exactly 3");
    expect(brainstorm.system).toContain("more tech");
  });

  it("steers away from recent titles and skips duplicates via the constraint", async () => {
    seedProfile();
    await setSetting(asDb(), "self_suggest_enabled", true);
    insertTopic({
      title: "Nation's Plants Unionize",
      normalizedTitle: "nations plants unionize",
      status: "done",
    });

    const { client, parseMock } = makeClient();
    const result = await runSelfSuggest({ db: asDb(), anthropic: client });

    expect(result).toEqual({ inserted: 1, flagged: 1, duplicates: 1 });
    const brainstorm = parseMock.mock.calls
      .map((c) => c[0])
      .find((c) => c.system.includes("brainstorming"))!;
    expect(brainstorm.messages[0].content).toContain("Nation's Plants Unionize");
  });
});
