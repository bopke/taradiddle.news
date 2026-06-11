import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import { hashApiKey } from "@/lib/api-keys";
import type { AuthDb } from "@/lib/auth";
import type { GenerationMessage } from "@/queue/messages";
import { setArticleStatus, saveArticleTranslation } from "./articles";
import {
  createApiKey,
  createProfile,
  deleteProfile,
  inviteAdmin,
  makeDefaultProfile,
  removeAdmin,
  revokeApiKey,
} from "./settings-admin";
import { addTopic, approveTopics, generateTopics, rejectTopics, updateTopic } from "./topics";

let db: TestDb;
const asDb = () => db as unknown as AuthDb;

beforeEach(() => {
  ({ db } = createTestDb());
});

function makeQueue() {
  const sent: GenerationMessage[] = [];
  return { sent, queue: { send: async (m: GenerationMessage) => void sent.push(m) } };
}

/** FK-satisfying user row for createdBy/editedBy references. */
function insertUserRow(email = "admin@example.com", isAdmin = false) {
  return db
    .insert(schema.user)
    .values({ id: email, name: email, email, isAdmin })
    .returning()
    .get();
}

function insertTopic(status: schema.TopicStatus, title = `T ${Math.random()}`) {
  return db
    .insert(schema.topics)
    .values({ title, normalizedTitle: title.toLowerCase(), status, source: "admin" })
    .returning()
    .get();
}

describe("topic batch operations", () => {
  it("approve only flips suggested/failed topics", async () => {
    const s = insertTopic("suggested");
    const f = insertTopic("failed");
    const d = insertTopic("done");
    await approveTopics(asDb(), [s.id, f.id, d.id]);
    const byId = new Map(db.select().from(schema.topics).all().map((t) => [t.id, t.status]));
    expect(byId.get(s.id)).toBe("approved");
    expect(byId.get(f.id)).toBe("approved");
    expect(byId.get(d.id)).toBe("done");
  });

  it("reject flips suggested/approved/failed but not done", async () => {
    const a = insertTopic("approved");
    const d = insertTopic("done");
    await rejectTopics(asDb(), [a.id, d.id]);
    const byId = new Map(db.select().from(schema.topics).all().map((t) => [t.id, t.status]));
    expect(byId.get(a.id)).toBe("rejected");
    expect(byId.get(d.id)).toBe("done");
  });

  it("generate enqueues only eligible topics, treating it as approval", async () => {
    const s = insertTopic("suggested");
    const done = insertTopic("done");
    const { queue, sent } = makeQueue();
    const result = await generateTopics(asDb(), queue, [s.id, done.id], "admin@x");
    expect(result.enqueued).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: "generate", topicId: s.id, trigger: "batch" });
  });
});

describe("topic editing", () => {
  it("addTopic maintains normalized_title and rejects duplicates", async () => {
    const fields = {
      title: "Moon Declares Independence",
      description: null,
      categoryId: null,
      priority: 0,
      scheduledFor: null,
      profileId: null,
    };
    const first = await addTopic(asDb(), fields, "admin@x");
    expect(first.ok).toBe(true);
    const dup = await addTopic(asDb(), { ...fields, title: "  MOON declares INDEPENDENCE!" }, "x");
    expect(dup.ok).toBe(false);
  });

  it("updateTopic re-normalizes the title and blocks clashes", async () => {
    const a = insertTopic("suggested", "Original A");
    const b = insertTopic("suggested", "Original B");
    const fields = {
      title: "Original B!!",
      description: null,
      categoryId: null,
      priority: 1,
      scheduledFor: null,
      profileId: null,
    };
    const clash = await updateTopic(asDb(), a.id, fields);
    expect(clash.ok).toBe(false);

    const ok = await updateTopic(asDb(), a.id, { ...fields, title: "Fresh Title" });
    expect(ok.ok).toBe(true);
    const updated = db.select().from(schema.topics).where(eq(schema.topics.id, a.id)).get();
    expect(updated!.normalizedTitle).toBe("fresh title");
    expect(b.id).not.toBe(a.id);
  });
});

describe("generation profiles", () => {
  const FIELDS = {
    name: "House style",
    model: "claude-sonnet-4-6",
    temperature: null,
    maxOutputTokens: 4096,
    instructions: "",
  };

  it("first profile becomes default; default can't be deleted", async () => {
    const created = await createProfile(asDb(), FIELDS);
    expect(created.ok).toBe(true);
    const [profile] = db.select().from(schema.generationProfiles).all();
    expect(profile.isDefault).toBe(true);

    const deletion = await deleteProfile(asDb(), profile.id);
    expect(deletion.ok).toBe(false);
  });

  it("makeDefault keeps exactly one default", async () => {
    await createProfile(asDb(), FIELDS);
    const second = await createProfile(asDb(), { ...FIELDS, name: "Opinion" });
    await makeDefaultProfile(asDb(), second.id!);

    const profiles = db.select().from(schema.generationProfiles).all();
    expect(profiles.filter((p) => p.isDefault)).toHaveLength(1);
    expect(profiles.find((p) => p.isDefault)!.name).toBe("Opinion");
  });

  it("deleting a non-default profile nulls topic references", async () => {
    await createProfile(asDb(), FIELDS);
    const extra = await createProfile(asDb(), { ...FIELDS, name: "Extra" });
    const topic = insertTopic("suggested");
    db.update(schema.topics)
      .set({ profileId: extra.id! })
      .where(eq(schema.topics.id, topic.id))
      .run();

    const result = await deleteProfile(asDb(), extra.id!);
    expect(result.ok).toBe(true);
    expect(db.select().from(schema.topics).where(eq(schema.topics.id, topic.id)).get()!.profileId).toBeNull();
  });
});

describe("api keys", () => {
  it("creates a key whose hash matches and revokes it", async () => {
    const creator = insertUserRow();
    const result = await createApiKey(asDb(), "reddit-trawler", creator.id);
    expect(result.ok).toBe(true);
    const plain = (result as { plainKey: string }).plainKey;
    const [row] = db.select().from(schema.apiKeys).all();
    expect(row.keyHash).toBe(await hashApiKey(plain));
    expect(plain.startsWith("td_")).toBe(true);

    await revokeApiKey(asDb(), row.id);
    expect(db.select().from(schema.apiKeys).all()[0].revokedAt).not.toBeNull();
  });

  it("rejects duplicate key names", async () => {
    const creator = insertUserRow();
    await createApiKey(asDb(), "bot", creator.id);
    const dup = await createApiKey(asDb(), "bot", creator.id);
    expect(dup.ok).toBe(false);
  });
});

describe("admin allowlist", () => {
  it("invite promotes an existing account immediately, case-insensitively", async () => {
    const inviter = insertUserRow("inviter@example.com", true);
    insertUserRow("Boss@Example.com");
    const result = await inviteAdmin(asDb(), "boss@example.com", inviter.id);
    expect(result.ok).toBe(true);
    const boss = db.select().from(schema.user).all().find((u) => u.email === "Boss@Example.com");
    expect(boss!.isAdmin).toBe(true);
  });

  it("rejects junk emails and blocks self-removal", async () => {
    const inviter = insertUserRow("inviter2@example.com", true);
    expect((await inviteAdmin(asDb(), "not-an-email", inviter.id)).ok).toBe(false);
    expect((await removeAdmin(asDb(), "me@x.com", "ME@x.com")).ok).toBe(false);
  });

  it("remove demotes the account and clears the allowlist row", async () => {
    const inviter = insertUserRow("inviter3@example.com", true);
    insertUserRow("out@example.com", true);
    await inviteAdmin(asDb(), "out@example.com", inviter.id);
    const result = await removeAdmin(asDb(), "out@example.com", "boss@example.com");
    expect(result.ok).toBe(true);
    expect(db.select().from(schema.adminAllowlist).all()).toHaveLength(0);
    const out = db.select().from(schema.user).all().find((u) => u.email === "out@example.com");
    expect(out!.isAdmin).toBe(false);
  });
});

describe("articles", () => {
  function insertArticle() {
    const category = db.insert(schema.categories).values({}).returning().get();
    const article = db
      .insert(schema.articles)
      .values({ categoryId: category.id, model: "m" })
      .returning()
      .get();
    db.insert(schema.articleTranslations)
      .values({
        articleId: article.id,
        locale: "en",
        title: "T",
        slug: `t-${article.id}`,
        summary: "s",
        metaDescription: "m",
        bodyMd: "b",
      })
      .run();
    return article;
  }

  it("unpublish records the editor", async () => {
    const editor = insertUserRow("editor@example.com", true);
    const article = insertArticle();
    await setArticleStatus(asDb(), article.id, "unpublished", editor.id);
    const updated = db.select().from(schema.articles).all()[0];
    expect(updated.status).toBe("unpublished");
    expect(updated.editedBy).toBe(editor.id);
  });

  it("saveArticleTranslation blocks slug collisions in the same locale", async () => {
    const a = insertArticle();
    const b = insertArticle();
    db.update(schema.articleTranslations)
      .set({ slug: "taken" })
      .where(eq(schema.articleTranslations.articleId, b.id))
      .run();

    const editor = insertUserRow("editor2@example.com", true);
    const result = await saveArticleTranslation(
      asDb(),
      a.id,
      "en",
      { title: "T", slug: "taken", summary: "s", metaDescription: "m", bodyMd: "b", imageAlt: null },
      editor.id,
    );
    expect(result.ok).toBe(false);
  });
});
