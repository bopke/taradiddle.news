import { desc, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { getRequestContext } from "@/lib/request-context";
import { getSettings } from "@/lib/settings";
import { ArticlesScreen, type ArticleRow } from "./articles-screen";

export const metadata = { title: "Articles — Taradiddle Admin" };

export default async function ArticlesPage() {
  const { db } = await getRequestContext();
  const settings = await getSettings(db);

  const [articles, translations, categories] = await Promise.all([
    db.select().from(schema.articles).orderBy(desc(schema.articles.generatedAt)),
    db.select().from(schema.articleTranslations),
    db
      .select()
      .from(schema.categoryTranslations)
      .where(eq(schema.categoryTranslations.locale, settings.default_locale)),
  ]);

  const categoryNames = new Map(categories.map((c) => [c.categoryId, c.name]));
  const rows: ArticleRow[] = articles.map((a) => {
    const mine = translations.filter((t) => t.articleId === a.id);
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
