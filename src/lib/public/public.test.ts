import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import type { AuthDb } from "@/lib/auth";
import { renderArticleHtml } from "./markdown";
import {
  FIRST_PAGE_SIZE,
  getArticleBySlug,
  getFeedPage,
  getMostProcessed,
  PAGE_SIZE,
  searchArticles,
} from "./queries";

let db: TestDb;
const asDb = () => db as unknown as AuthDb;
const deps = (locale: string) => ({ db: asDb(), locale, primaryLocale: "en" });

let categoryId: number;

beforeEach(() => {
  ({ db } = createTestDb());
  const category = db.insert(schema.categories).values({}).returning().get();
  categoryId = category.id;
  db.insert(schema.categoryTranslations)
    .values([
      { categoryId, locale: "en", name: "Science", slug: "science" },
      { categoryId, locale: "pl", name: "Nauka", slug: "nauka" },
    ])
    .run();
});

function insertArticle(n: number, opts?: { pl?: boolean; views?: number; status?: "published" | "unpublished" }) {
  const article = db
    .insert(schema.articles)
    .values({
      categoryId,
      model: "m",
      status: opts?.status ?? "published",
      viewCount: opts?.views ?? 0,
      generatedAt: new Date(Date.UTC(2026, 0, 1 + n)),
    })
    .returning()
    .get();
  db.insert(schema.articleTranslations)
    .values({
      articleId: article.id,
      locale: "en",
      title: `Article ${n}`,
      slug: `article-${n}`,
      summary: `Summary ${n}`,
      metaDescription: `Meta ${n}`,
      bodyMd: `Body text number ${n}.`,
    })
    .run();
  if (opts?.pl) {
    db.insert(schema.articleTranslations)
      .values({
        articleId: article.id,
        locale: "pl",
        title: `Artykuł ${n}`,
        slug: `artykul-${n}`,
        summary: `Streszczenie ${n}`,
        metaDescription: `Meta pl ${n}`,
        bodyMd: `Treść numer ${n}.`,
      })
      .run();
  }
  return article;
}

describe("feed", () => {
  it("paginates 9-then-6 with correct page count, newest first", async () => {
    for (let i = 1; i <= 17; i++) insertArticle(i);

    const page1 = await getFeedPage(deps("en"), 1);
    expect(page1.articles).toHaveLength(FIRST_PAGE_SIZE);
    expect(page1.articles[0].title).toBe("Article 17");
    expect(page1.pageCount).toBe(1 + Math.ceil((17 - FIRST_PAGE_SIZE) / PAGE_SIZE)); // 3

    const page2 = await getFeedPage(deps("en"), 2);
    expect(page2.articles).toHaveLength(PAGE_SIZE);
    expect(page2.articles[0].title).toBe("Article 8");

    const page3 = await getFeedPage(deps("en"), 3);
    expect(page3.articles).toHaveLength(17 - FIRST_PAGE_SIZE - PAGE_SIZE); // 2
  });

  it("excludes unpublished articles", async () => {
    insertArticle(1);
    insertArticle(2, { status: "unpublished" });
    const { articles, total } = await getFeedPage(deps("en"), 1);
    expect(total).toBe(1);
    expect(articles.map((a) => a.title)).toEqual(["Article 1"]);
  });

  it("serves pl translations when present and falls back to en with a flag", async () => {
    insertArticle(1, { pl: true });
    insertArticle(2); // en only

    const { articles } = await getFeedPage(deps("pl"), 1);
    const translated = articles.find((a) => a.title === "Artykuł 1")!;
    const fallback = articles.find((a) => a.title === "Article 2")!;
    expect(translated.untranslated).toBe(false);
    expect(translated.category.name).toBe("Nauka");
    expect(fallback.untranslated).toBe(true);
  });
});

describe("article lookup", () => {
  it("resolves a pl URL with an en slug (switcher to untranslated article)", async () => {
    insertArticle(1); // en only → /pl/articles/article-1
    const article = await getArticleBySlug(deps("pl"), "article-1");
    expect(article).not.toBeNull();
    expect(article!.untranslated).toBe(true);
    expect(article!.title).toBe("Article 1");
  });

  it("returns null for unknown slugs", async () => {
    expect(await getArticleBySlug(deps("en"), "nope")).toBeNull();
  });
});

describe("most processed & search", () => {
  it("orders by view count", async () => {
    insertArticle(1, { views: 5 });
    insertArticle(2, { views: 50 });
    insertArticle(3, { views: 20 });
    const top = await getMostProcessed(deps("en"), 2);
    expect(top.map((a) => a.title)).toEqual(["Article 2", "Article 3"]);
  });

  it("matches title/summary/body in the active locale", async () => {
    insertArticle(1, { pl: true });
    insertArticle(2);
    const hits = await searchArticles(deps("pl"), "Treść numer 1");
    expect(hits.map((a) => a.title)).toEqual(["Artykuł 1"]);
    expect(await searchArticles(deps("en"), "number 2")).toHaveLength(1);
  });
});

describe("markdown rendering", () => {
  it("renders paragraphs and the pull-quote blockquote", () => {
    const html = renderArticleHtml("First paragraph.\n\n> A pull quote.\n\nSecond paragraph.");
    expect(html).toContain("<p>First paragraph.</p>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("A pull quote.");
  });

  it("escapes raw HTML instead of passing it through", () => {
    const html = renderArticleHtml('Hello <script>alert("x")</script> world.');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
