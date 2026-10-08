import { desc, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { getRequestContext } from "@/lib/request-context";
import { getSettings } from "@/lib/settings";
import { ArticlesScreen, type ArticleRow } from "./articles-screen";

export const metadata = { title: "Articles — Taradiddle Admin" };

export default async function ArticlesPage() {
  const { db } = await getRequestContext();
  const settings = await getSettings(db);

  // Every article is listed, so load all translations rather than filtering
  // by id — an id list would hit D1's 100-bound-parameter limit.
  const [articles, categories, translations] = await Promise.all([
    db.select().from(schema.articles).orderBy(desc(schema.articles.generatedAt)),
    db
      .select()
      .from(schema.categoryTranslations)
      .where(eq(schema.categoryTranslations.locale, settings.default_locale)),
    db
      .select({
        articleId: schema.articleTranslations.articleId,
        locale: schema.articleTranslations.locale,
        title: schema.articleTranslations.title,
      })
      .from(schema.articleTranslations),
  ]);
  const byArticle = new Map<number, typeof translations>();
  for (const t of translations) {
    const group = byArticle.get(t.articleId) ?? [];
    group.push(t);
    byArticle.set(t.articleId, group);
  }

  const categoryNames = new Map(categories.map((c) => [c.categoryId, c.name]));
  const rows: ArticleRow[] = articles.map((a) => {
    const mine = byArticle.get(a.id) ?? [];
    const primary = mine.find((t) => t.locale === settings.default_locale);
    return {
      id: a.id,
      title: primary?.title ?? "(untitled)",
      generatedAt: a.generatedAt.toISOString(),
      model: a.model,
      edited: a.editedBy !== null,
      category: categoryNames.get(a.categoryId) ?? "—",
      status: a.status,
      locales: settings.locales.map((locale) => ({
        locale,
        ok: mine.some((t) => t.locale === locale),
      })),
    };
  });

  return <ArticlesScreen articles={rows} />;
}
