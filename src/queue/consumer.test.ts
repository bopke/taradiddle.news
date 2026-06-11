import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import type { AuthDb } from "@/lib/auth";
import type { ImageBindings } from "@/lib/images";
import { mockAnthropicClient, type ParseCall } from "@/lib/test-utils";
import { consumeMessage, MAX_ATTEMPTS, type ConsumerDeps } from "./consumer";
import type { GenerationMessage } from "./messages";
import { enqueueGeneration, enqueueRegeneration, enqueueTranslation } from "./producer";

const ARTICLE = {
  title: "Moon Declares Independence",
  summary: "Lunar authorities cite unpaid gravitational labor.",
  meta_description: "The Moon has declared independence.",
  body_md: "THE SEA OF TRANQUILITY — In a stunning move...",
  tags: ["moon", "trade"],
  category_slug: "science",
  image_prompt: "podium on the moon",
  image_alt: "A podium on the lunar surface",
};

const TRANSLATED = {
  title: "Księżyc ogłasza niepodległość",
  summary: "Władze lunarne...",
  meta_description: "Księżyc ogłosił niepodległość.",
  body_md: "MORZE SPOKOJU — ...",
  image_alt: "Mównica na Księżycu",
  tags: ["księżyc", "handel"],
};

let db: TestDb;
const asDb = () => db as unknown as AuthDb;

/** Routes mock responses: translation calls are recognizable by their system prompt. */
function makeDeps(opts?: {
  generate?: (call: ParseCall) => unknown;
  translate?: (call: ParseCall) => unknown;
  imageFails?: boolean;
}) {
  const { client, parseMock } = mockAnthropicClient((call) =>
    call.system.includes("You translate")
      ? (opts?.translate ?? (() => TRANSLATED))(call)
      : (opts?.generate ?? (() => ARTICLE))(call),
  );
  const put = vi.fn(async (..._args: unknown[]) => ({}));
  const run = vi.fn(async () =>
    opts?.imageFails ? {} : { image: btoa("img") },
  );
  const deps: ConsumerDeps = {
    db: asDb(),
    anthropic: client,
    images: { ai: { run }, bucket: { put } } as unknown as ImageBindings,
  };
  return { deps, parseMock, put, run };
}

function makeQueue() {
  const sent: GenerationMessage[] = [];
  return { sent, queue: { send: async (m: GenerationMessage) => void sent.push(m) } };
}

function makeMessage(body: GenerationMessage, attempts = 1) {
  return { body, attempts, ack: vi.fn(), retry: vi.fn() };
}

function seedBase() {
  const category = db.insert(schema.categories).values({}).returning().get();
  db.insert(schema.categoryTranslations)
    .values([
      { categoryId: category.id, locale: "en", name: "Science", slug: "science" },
      { categoryId: category.id, locale: "pl", name: "Nauka", slug: "nauka" },
    ])
    .run();
  const profile = db
    .insert(schema.generationProfiles)
    .values({
      name: "House style",
      model: "claude-sonnet-4-6",
      maxOutputTokens: 4096,
      instructions: "",
      isDefault: true,
    })
    .returning()
    .get();
  return { category, profile };
}

function insertTopic(overrides: Partial<typeof schema.topics.$inferInsert> = {}) {
  return db
    .insert(schema.topics)
    .values({ title: "Moon stuff", status: "approved", source: "admin", ...overrides })
    .returning()
    .get();
}

beforeEach(() => {
  ({ db } = createTestDb());
});

describe("producer", () => {
  it("queues topics with job rows and jobIds in messages", async () => {
    seedBase();
    const topic = insertTopic();
    const { queue, sent } = makeQueue();

    await enqueueGeneration(asDb(), queue, [topic.id], "batch", "admin@x");

    const refreshed = db.select().from(schema.topics).where(eq(schema.topics.id, topic.id)).get();
    expect(refreshed!.status).toBe("queued");
    const jobs = db.select().from(schema.generationJobs).all();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].trigger).toBe("batch");
    expect(sent).toEqual([
      { kind: "generate", topicId: topic.id, jobId: jobs[0].id, trigger: "batch", requestedBy: "admin@x" },
    ]);
  });
});

describe("consumer — generate", () => {
  async function runGeneration(depsOpts?: Parameters<typeof makeDeps>[0]) {
    seedBase();
    const topic = insertTopic();
    const { queue, sent } = makeQueue();
    await enqueueGeneration(asDb(), queue, [topic.id], "manual");
    const { deps, ...rest } = makeDeps(depsOpts);
    const message = makeMessage(sent[0]);
    await consumeMessage(deps, message);
    return { topic, message, deps, ...rest };
  }

  it("produces a published article with both locales, tags and image", async () => {
    const { topic, message } = await runGeneration();

    expect(message.ack).toHaveBeenCalled();
    expect(message.retry).not.toHaveBeenCalled();

    const article = db.select().from(schema.articles).all()[0];
    expect(article.status).toBe("published");
    expect(article.imageKey).toMatch(/^articles\/moon-declares-independence-/);
    expect(article.model).toBe("claude-sonnet-4-6");

    const translations = db.select().from(schema.articleTranslations).all();
    expect(translations.map((t) => t.locale).sort()).toEqual(["en", "pl"]);
    expect(translations.find((t) => t.locale === "en")!.slug).toBe("moon-declares-independence");
    expect(translations.find((t) => t.locale === "pl")!.slug).toBe("ksiezyc-oglasza-niepodleglosc");

    const tagTr = db.select().from(schema.tagTranslations).all();
    expect(tagTr.filter((t) => t.locale === "en").map((t) => t.name).sort()).toEqual(["moon", "trade"]);
    expect(tagTr.filter((t) => t.locale === "pl").map((t) => t.name).sort()).toEqual(["handel", "księżyc"]);

    const refreshedTopic = db.select().from(schema.topics).where(eq(schema.topics.id, topic.id)).get();
    expect(refreshedTopic!.status).toBe("done");

    const job = db.select().from(schema.generationJobs).all()[0];
    expect(job.status).toBe("succeeded");
    expect(job.articleId).toBe(article.id);
    expect(job.error).toBeNull();
  });

  it("publishes without an image when image generation fails (non-fatal)", async () => {
    await runGeneration({ imageFails: true });

    const article = db.select().from(schema.articles).all()[0];
    expect(article.imageKey).toBeNull();
    const en = db.select().from(schema.articleTranslations).all().find((t) => t.locale === "en");
    expect(en!.imageAlt).toBeNull();

    const job = db.select().from(schema.generationJobs).all()[0];
    expect(job.status).toBe("succeeded");
    expect(job.error).toContain("hero image");
  });

  it("publishes the primary locale when translation fails (non-fatal)", async () => {
    await runGeneration({
      translate: () => {
        throw new Error("529 overloaded");
      },
    });

    const translations = db.select().from(schema.articleTranslations).all();
    expect(translations.map((t) => t.locale)).toEqual(["en"]);

    const job = db.select().from(schema.generationJobs).all()[0];
    expect(job.status).toBe("succeeded");
    expect(job.error).toContain("translation to pl failed");
  });

  it("retries on generation failure and requeues the topic", async () => {
    seedBase();
    const topic = insertTopic();
    const { queue, sent } = makeQueue();
    await enqueueGeneration(asDb(), queue, [topic.id], "manual");
    const { deps } = makeDeps({
      generate: () => {
        throw new Error("boom");
      },
    });

    const message = makeMessage(sent[0], 1);
    await consumeMessage(deps, message);

    expect(message.ack).not.toHaveBeenCalled();
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
    const job = db.select().from(schema.generationJobs).all()[0];
    expect(job.status).toBe("queued");
    expect(job.error).toContain("boom");
    expect(db.select().from(schema.topics).all()[0].status).toBe("queued");
  });

  it("marks topic and job failed on the final attempt", async () => {
    seedBase();
    const topic = insertTopic();
    const { queue, sent } = makeQueue();
    await enqueueGeneration(asDb(), queue, [topic.id], "manual");
    const { deps } = makeDeps({
      generate: () => {
        throw new Error("permanent");
      },
    });

    const message = makeMessage(sent[0], MAX_ATTEMPTS);
    await consumeMessage(deps, message);

    expect(db.select().from(schema.generationJobs).all()[0].status).toBe("failed");
    expect(db.select().from(schema.topics).all()[0].status).toBe("failed");
    // Still retried so Queues can move it to the DLQ.
    expect(message.retry).toHaveBeenCalled();
  });

  it("skips duplicate delivery for a done topic (idempotency)", async () => {
    const { topic, deps } = await runGeneration();
    const countBefore = db.select().from(schema.articles).all().length;

    const job = db
      .insert(schema.generationJobs)
      .values({ topicId: topic.id, trigger: "manual", status: "queued" })
      .returning()
      .get();
    const dup = makeMessage({ kind: "generate", topicId: topic.id, jobId: job.id, trigger: "manual" });
    await consumeMessage(deps, dup);

    expect(dup.ack).toHaveBeenCalled();
    expect(db.select().from(schema.articles).all().length).toBe(countBefore);
  });

  it("respects a pre-assigned category and skips category selection", async () => {
    seedBase();
    const second = db.insert(schema.categories).values({}).returning().get();
    db.insert(schema.categoryTranslations)
      .values({ categoryId: second.id, locale: "en", name: "World", slug: "world" })
      .run();
    const topic = insertTopic({ categoryId: second.id });
    const { queue, sent } = makeQueue();
    await enqueueGeneration(asDb(), queue, [topic.id], "manual");
    const { deps, parseMock } = makeDeps();
    await consumeMessage(deps, makeMessage(sent[0]));

    expect(db.select().from(schema.articles).all()[0].categoryId).toBe(second.id);
    const generationCall = parseMock.mock.calls
      .map((c) => c[0] as ParseCall)
      .find((c) => !c.system.includes("You translate"))!;
    expect(generationCall.system).toContain("already assigned");
  });
});

describe("consumer — regenerate", () => {
  it("replaces content in place, keeping the article id and slug", async () => {
    seedBase();
    const topic = insertTopic();
    const { queue, sent } = makeQueue();
    await enqueueGeneration(asDb(), queue, [topic.id], "manual");
    const { deps } = makeDeps();
    await consumeMessage(deps, makeMessage(sent[0]));
    const article = db.select().from(schema.articles).all()[0];

    const { queue: queue2, sent: sent2 } = makeQueue();
    await enqueueRegeneration(asDb(), queue2, article.id, "admin@x");
    expect(sent2[0]).toMatchObject({ kind: "generate", replaceArticleId: article.id });

    const { deps: deps2 } = makeDeps({
      generate: () => ({ ...ARTICLE, summary: "Updated summary." }),
    });
    await consumeMessage(deps2, makeMessage(sent2[0]));

    const articles = db.select().from(schema.articles).all();
    expect(articles).toHaveLength(1);
    expect(articles[0].id).toBe(article.id);
    const en = db
      .select()
      .from(schema.articleTranslations)
      .all()
      .find((t) => t.locale === "en")!;
    expect(en.summary).toBe("Updated summary.");
    // Same title → same slug, no -2 suffix.
    expect(en.slug).toBe("moon-declares-independence");
  });
});

describe("consumer — translate retry", () => {
  it("adds the missing locale to an existing article", async () => {
    seedBase();
    const topic = insertTopic();
    const { queue, sent } = makeQueue();
    await enqueueGeneration(asDb(), queue, [topic.id], "manual");
    // First pass: translation fails, article ends up en-only.
    const { deps } = makeDeps({
      translate: () => {
        throw new Error("529");
      },
    });
    await consumeMessage(deps, makeMessage(sent[0]));
    const article = db.select().from(schema.articles).all()[0];
    expect(db.select().from(schema.articleTranslations).all()).toHaveLength(1);

    // Retry just the translation.
    const { queue: queue2, sent: sent2 } = makeQueue();
    await enqueueTranslation(asDb(), queue2, article.id, "pl");
    const { deps: deps2 } = makeDeps();
    const message = makeMessage(sent2[0]);
    await consumeMessage(deps2, message);

    expect(message.ack).toHaveBeenCalled();
    const locales = db.select().from(schema.articleTranslations).all().map((t) => t.locale).sort();
    expect(locales).toEqual(["en", "pl"]);
    const job = db
      .select()
      .from(schema.generationJobs)
      .all()
      .find((j) => j.trigger === "translate")!;
    expect(job.status).toBe("succeeded");
  });
});
