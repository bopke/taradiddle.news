import { count, desc, eq, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import { pageWindow } from "@/lib/admin/pagination";
import { getRequestContext } from "@/lib/request-context";
import { getSettings } from "@/lib/settings";
import { ArticlesScreen, type ArticleRow } from "./articles-screen";

export const metadata = { title: "Articles — Taradiddle Admin" };

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { db } = await getRequestContext();
  const [settings, [{ total }], query] = await Promise.all([
    getSettings(db),
    db.select({ total: count() }).from(schema.articles),
    searchParams,
  ]);
  const { page, pageCount, offset, limit } = pageWindow(query.page, total);

  const [articles, categories] = await Promise.all([
    db
      .select()
      .from(schema.articles)
      .orderBy(desc(schema.articles.generatedAt), desc(schema.articles.id))
      .limit(limit)
      .offset(offset),
    db
      .select()
      .from(schema.categoryTranslations)
      .where(eq(schema.categoryTranslations.locale, settings.default_locale)),
  ]);
  // One page of ids (≤ ADMIN_PAGE_SIZE) stays under D1's 100-bound-parameter limit.
  const translations = articles.length
    ? await db
        .select({
          articleId: schema.articleTranslations.articleId,
          locale: schema.articleTranslations.locale,
          title: schema.articleTranslations.title,
        })
        .from(schema.articleTranslations)
        .where(
          inArray(
            schema.articleTranslations.articleId,
            articles.map((a) => a.id),
          ),
        )
    : [];
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

  return <ArticlesScreen articles={rows} page={page} pageCount={pageCount} />;
}
