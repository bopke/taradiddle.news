import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "./schema";
import { createTestDb, type TestDb } from "./test-helpers";

let db: TestDb;

beforeEach(() => {
  ({ db } = createTestDb());
});

function insertCategory() {
  return db.insert(schema.categories).values({}).returning().get();
}

function insertArticle(categoryId: number) {
  return db
    .insert(schema.articles)
    .values({ categoryId, model: "claude-sonnet-4-6" })
    .returning()
    .get();
}

describe("schema", () => {
  it("stores an article with translations in both locales", () => {
    const category = insertCategory();
    const article = insertArticle(category.id);

    db.insert(schema.articleTranslations).values([
      {
        articleId: article.id,
        locale: "en",
        title: "Local Man Achieves Inbox Zero, Immediately Receives 41 Emails",
        slug: "local-man-achieves-inbox-zero",
        summary: "A fleeting triumph.",
        metaDescription: "Inbox zero lasted eleven seconds, experts confirm.",
        bodyMd: "It lasted eleven seconds.",
      },
      {
        articleId: article.id,
        locale: "pl",
        title: "Mężczyzna osiąga inbox zero, natychmiast dostaje 41 maili",
        slug: "mezczyzna-osiaga-inbox-zero",
        summary: "Ulotny triumf.",
        metaDescription: "Inbox zero trwało jedenaście sekund.",
        bodyMd: "Trwało jedenaście sekund.",
      },
    ]).run();

    const translations = db
      .select()
      .from(schema.articleTranslations)
      .where(eq(schema.articleTranslations.articleId, article.id))
      .all();
    expect(translations).toHaveLength(2);
  });

  it("rejects a duplicate slug within a locale but allows it across locales", () => {
    const category = insertCategory();
    const a = insertArticle(category.id);
    const b = insertArticle(category.id);

    const base = {
      title: "t",
      summary: "s",
      metaDescription: "m",
      bodyMd: "b",
      slug: "same-slug",
    };
    db.insert(schema.articleTranslations).values({ ...base, articleId: a.id, locale: "en" }).run();

    expect(() =>
      db.insert(schema.articleTranslations).values({ ...base, articleId: b.id, locale: "en" }).run(),
    ).toThrow(/UNIQUE/);

    // Same slug in another locale is fine.
    db.insert(schema.articleTranslations).values({ ...base, articleId: b.id, locale: "pl" }).run();
  });

  it("keeps the article when its topic is deleted", () => {
    const category = insertCategory();
    const topic = db
      .insert(schema.topics)
      .values({ title: "A topic", source: "api" })
      .returning()
      .get();
    const article = db
      .insert(schema.articles)
      .values({ categoryId: category.id, model: "m", topicId: topic.id })
      .returning()
      .get();

    db.delete(schema.topics).where(eq(schema.topics.id, topic.id)).run();

    const [kept] = db.select().from(schema.articles).where(eq(schema.articles.id, article.id)).all();
    expect(kept).toBeDefined();
    expect(kept.topicId).toBeNull();
  });

  it("cascades article deletion to translations and tag links", () => {
    const category = insertCategory();
    const article = insertArticle(category.id);
    const tag = db.insert(schema.tags).values({}).returning().get();
    db.insert(schema.tagTranslations)
      .values({ tagId: tag.id, locale: "en", name: "AI", slug: "ai" })
      .run();
    db.insert(schema.articleTags).values({ articleId: article.id, tagId: tag.id }).run();
    db.insert(schema.articleTranslations)
      .values({
        articleId: article.id,
        locale: "en",
        title: "t",
        slug: "s",
        summary: "s",
        metaDescription: "m",
        bodyMd: "b",
      })
      .run();

    db.delete(schema.articles).where(eq(schema.articles.id, article.id)).run();

    expect(db.select().from(schema.articleTranslations).all()).toHaveLength(0);
    expect(db.select().from(schema.articleTags).all()).toHaveLength(0);
    // The tag itself survives — only the link is removed.
    expect(db.select().from(schema.tags).all()).toHaveLength(1);
  });

  it("defaults topics to suggested status with priority 0", () => {
    const topic = db
      .insert(schema.topics)
      .values({ title: "Sejm przenosi obrady do Minecrafta", source: "api" })
      .returning()
      .get();
    expect(topic.status).toBe("suggested");
    expect(topic.priority).toBe(0);
  });

  it("rejects two topics with the same normalized title at the DB level", () => {
    db.insert(schema.topics)
      .values({
        title: "Moon Declares Independence!",
        normalizedTitle: "moon declares independence",
        source: "api",
      })
      .run();
    expect(() =>
      db
        .insert(schema.topics)
        .values({
          title: "MOON DECLARES INDEPENDENCE",
          normalizedTitle: "moon declares independence",
          source: "admin",
        })
        .run(),
    ).toThrow(/UNIQUE/);
  });
});
