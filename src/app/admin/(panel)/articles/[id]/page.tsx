import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { getRequestContext } from "@/lib/request-context";
import { getSettings } from "@/lib/settings";
import { EditorScreen } from "./editor-screen";

export const metadata = { title: "Edit article — Taradiddle Admin" };

export default async function ArticleEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id)) notFound();

  const { db } = await getRequestContext();
  const settings = await getSettings(db);

  const [article] = await db.select().from(schema.articles).where(eq(schema.articles.id, id));
  if (!article) notFound();

  const [translations, tagRows, categories] = await Promise.all([
    db
      .select()
      .from(schema.articleTranslations)
      .where(eq(schema.articleTranslations.articleId, id)),
    db
      .select({ name: schema.tagTranslations.name })
      .from(schema.articleTags)
      .innerJoin(
        schema.tagTranslations,
        and(
          eq(schema.tagTranslations.tagId, schema.articleTags.tagId),
          eq(schema.tagTranslations.locale, settings.default_locale),
        ),
      )
      .where(eq(schema.articleTags.articleId, id)),
    db
      .select()
      .from(schema.categoryTranslations)
      .where(eq(schema.categoryTranslations.locale, settings.default_locale)),
  ]);

  return (
    <EditorScreen
      article={{
        id: article.id,
        status: article.status,
        model: article.model,
        generatedAt: article.generatedAt.toISOString(),
        categoryId: article.categoryId,
        imageKey: article.imageKey,
        tags: tagRows.map((t) => t.name),
      }}
      locales={settings.locales.map((locale) => {
        const t = translations.find((x) => x.locale === locale);
        return t
          ? {
              locale,
              ok: true as const,
              fields: {
                title: t.title,
                slug: t.slug,
                summary: t.summary,
                metaDescription: t.metaDescription,
                bodyMd: t.bodyMd,
                imageAlt: t.imageAlt,
                translatedAt: t.translatedAt.toISOString(),
              },
            }
          : { locale, ok: false as const, fields: null };
      })}
      categories={categories.map((c) => ({ id: c.categoryId, name: c.name }))}
      primaryLocale={settings.default_locale}
    />
  );
}
