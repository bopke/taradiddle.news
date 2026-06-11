import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import { generateApiKey, hashApiKey } from "./api-keys";
import type { AuthDb } from "./auth";
import { handleSuggestionRequest, RATE_LIMIT_PER_HOUR, type SuggestDeps } from "./suggest-topic";
import { mockAnthropicClient } from "./test-utils";

let db: TestDb;
let apiKey: string;
const asDb = () => db as unknown as AuthDb;

const ALLOW_VERDICT = {
  allow: true,
  reason: null,
  detected_locale: "en",
  title_primary: null,
  description_primary: null,
};

beforeEach(async () => {
  ({ db } = createTestDb());
  apiKey = generateApiKey();
  db.insert(schema.apiKeys)
    .values({ name: "test-bot", keyHash: await hashApiKey(apiKey) })
    .run();
});

function makeDeps(verdict: unknown = ALLOW_VERDICT, now?: () => Date): SuggestDeps {
  const { client } = mockAnthropicClient(() => verdict);
  return { db: asDb(), anthropic: client, now };
}

function makeRequest(body: unknown, key: string | null = apiKey): Request {
  return new Request("http://test/api/suggestions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("suggestion API", () => {
  it("rejects missing and unknown keys with 401", async () => {
    const deps = makeDeps();
    expect((await handleSuggestionRequest(deps, makeRequest({ title: "Hello world" }, null))).status).toBe(401);
    expect(
      (await handleSuggestionRequest(deps, makeRequest({ title: "Hello world" }, "td_wrong"))).status,
    ).toBe(401);
  });

  it("rejects a revoked key with 401", async () => {
    db.update(schema.apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(schema.apiKeys.name, "test-bot"))
      .run();
    const response = await handleSuggestionRequest(makeDeps(), makeRequest({ title: "Hello world" }));
    expect(response.status).toBe(401);
  });

  it("rejects malformed bodies with 422", async () => {
    const deps = makeDeps();
    const response = await handleSuggestionRequest(deps, makeRequest({ title: "x" }));
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  it("rejects an unknown category with 422", async () => {
    const response = await handleSuggestionRequest(
      makeDeps(),
      makeRequest({ title: "Valid title here", category: "nonexistent" }),
    );
    expect(response.status).toBe(422);
    expect(await response.text()).toContain("unknown category");
  });

  it("accepts a known category by slug in any locale", async () => {
    const category = db.insert(schema.categories).values({}).returning().get();
    db.insert(schema.categoryTranslations)
      .values({ categoryId: category.id, locale: "pl", name: "Nauka", slug: "nauka" })
      .run();

    const response = await handleSuggestionRequest(
      makeDeps(),
      makeRequest({ title: "Valid title here", category: "nauka" }),
    );
    expect(response.status).toBe(201);
    expect(db.select().from(schema.topics).all()[0].categoryId).toBe(category.id);
  });

  it("returns 409 for a near-duplicate title", async () => {
    db.insert(schema.topics)
      .values({ title: "Moon Declares Independence!", source: "admin" })
      .run();
    const response = await handleSuggestionRequest(
      makeDeps(),
      makeRequest({ title: "  moon DECLARES independence " }),
    );
    expect(response.status).toBe(409);
  });

  it("returns 422 with the model's reason when moderation flags the topic, storing nothing", async () => {
    const response = await handleSuggestionRequest(
      makeDeps({ ...ALLOW_VERDICT, allow: false, reason: "Punches down." }),
      makeRequest({ title: "Something cruel" }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "rejected_by_moderation", reason: "Punches down." });
    expect(db.select().from(schema.topics).all()).toHaveLength(0);
  });

  it("creates a suggested topic on the happy path", async () => {
    const response = await handleSuggestionRequest(
      makeDeps(),
      makeRequest({ title: "Moon Declares Independence", description: "tides", priority: 5 }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { topic: { id: number; status: string } };
    expect(body.topic.status).toBe("suggested");

    const topic = db.select().from(schema.topics).all()[0];
    expect(topic.source).toBe("api");
    expect(topic.submittedBy).toBe("test-bot");
    expect(topic.priority).toBe(5);
    expect(topic.originalTitle).toBeNull();
  });

  it("normalizes a Polish submission and keeps the original text", async () => {
    const response = await handleSuggestionRequest(
      makeDeps({
        ...ALLOW_VERDICT,
        detected_locale: "pl",
        title_primary: "Sejm Moves Sessions to Minecraft",
        description_primary: "daily server crashes",
      }),
      makeRequest({ title: "Sejm przenosi obrady do Minecrafta", description: "serwery padają" }),
    );
    expect(response.status).toBe(201);

    const topic = db.select().from(schema.topics).all()[0];
    expect(topic.title).toBe("Sejm Moves Sessions to Minecraft");
    expect(topic.description).toBe("daily server crashes");
    expect(topic.originalTitle).toBe("Sejm przenosi obrady do Minecrafta");
    expect(topic.originalLocale).toBe("pl");
  });

  it("catches duplicates that only collide after normalization to the primary locale", async () => {
    db.insert(schema.topics)
      .values({ title: "Sejm Moves Sessions to Minecraft", source: "api" })
      .run();
    const response = await handleSuggestionRequest(
      makeDeps({
        ...ALLOW_VERDICT,
        detected_locale: "pl",
        title_primary: "Sejm Moves Sessions to Minecraft",
        description_primary: null,
      }),
      makeRequest({ title: "Sejm przenosi obrady do Minecrafta" }),
    );
    expect(response.status).toBe(409);
  });

  it("returns 409 via the DB constraint when a duplicate lands between read-check and insert", async () => {
    // Simulates the race: this row appeared "after" our pre-read — its title
    // text wouldn't match the read-based check, but its normalized_title does.
    db.insert(schema.topics)
      .values({
        title: "(concurrently inserted row)",
        normalizedTitle: "moon declares independence",
        source: "api",
      })
      .run();

    const response = await handleSuggestionRequest(
      makeDeps(),
      makeRequest({ title: "Moon Declares Independence!" }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "duplicate_topic" });
    // Nothing extra stored.
    expect(db.select().from(schema.topics).all()).toHaveLength(1);
  });

  it("stores the raw submission when moderation fails open", async () => {
    const deps: SuggestDeps = {
      db: asDb(),
      anthropic: mockAnthropicClient(() => {
        throw new Error("529");
      }).client,
    };
    const response = await handleSuggestionRequest(deps, makeRequest({ title: "Fail-open topic" }));
    expect(response.status).toBe(201);
    expect(db.select().from(schema.topics).all()[0].title).toBe("Fail-open topic");
  });

  it("returns 429 above the hourly limit and resets in the next window", async () => {
    const base = new Date("2026-06-11T12:30:00Z");
    const deps = makeDeps(ALLOW_VERDICT, () => base);

    const [keyRow] = db.select().from(schema.apiKeys).all();
    const windowStart = Math.floor(base.getTime() / 1000 / 3600) * 3600;
    db.insert(schema.apiKeyUsage)
      .values({ apiKeyId: keyRow.id, windowStart, count: RATE_LIMIT_PER_HOUR })
      .run();

    const limited = await handleSuggestionRequest(deps, makeRequest({ title: "One too many" }));
    expect(limited.status).toBe(429);
    const body = (await limited.json()) as { retry_after_seconds: number };
    expect(body.retry_after_seconds).toBe(1800);

    // Next hour window: allowed again.
    const nextHour = makeDeps(ALLOW_VERDICT, () => new Date("2026-06-11T13:00:01Z"));
    const ok = await handleSuggestionRequest(nextHour, makeRequest({ title: "One too many" }));
    expect(ok.status).toBe(201);
  });
});
