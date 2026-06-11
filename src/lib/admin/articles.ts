import { and, eq, ne } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { AuthDb } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/db-errors";
import { slugify } from "@/lib/slugs";
import type { ActionResult } from "./topics";

export async function setArticleStatus(
  db: AuthDb,
  id: number,
  status: "published" | "unpublished",
  editedBy: string,
): Promise<void> {
  await db
    .update(schema.articles)
    .set({ status, editedBy, updatedAt: new Date() })
    .where(eq(schema.articles.id, id));
}

/** Removes the article; topic and job history stay (FKs null out). */
export async function deleteArticle(db: AuthDb, id: number): Promise<void> {
  await db.delete(schema.articles).where(eq(schema.articles.id, id));
}

export type TranslationFields = {
  title: string;
  slug: string;
  summary: string;
  metaDescription: string;
  bodyMd: string;
  imageAlt: string | null;
};

export async function saveArticleTranslation(
  db: AuthDb,
  articleId: number,
  locale: string,
  fields: TranslationFields,
  editedBy: string,
): Promise<ActionResult> {
  const slug = slugify(fields.slug || fields.title);
  const [clash] = await db
    .select({ articleId: schema.articleTranslations.articleId })
    .from(schema.articleTranslations)
    .where(
      and(
        eq(schema.articleTranslations.locale, locale),
        eq(schema.articleTranslations.slug, slug),
        ne(schema.articleTranslations.articleId, articleId),
      ),
    );
  if (clash) return { ok: false, error: `Slug "${slug}" is already used in ${locale}.` };

  try {
    await db
      .update(schema.articleTranslations)
      .set({ ...fields, slug })
      .where(
        and(
          eq(schema.articleTranslations.articleId, articleId),
          eq(schema.articleTranslations.locale, locale),
        ),
      );
  } catch (error) {
    // Race: another writer claimed the slug between the pre-check and here.
    if (isUniqueViolation(error, "article_translations")) {
      return { ok: false, error: `Slug "${slug}" is already used in ${locale}.` };
    }
    throw error;
  }
  await db
    .update(schema.articles)
    .set({ editedBy, updatedAt: new Date() })
    .where(eq(schema.articles.id, articleId));
  return { ok: true };
}

/** Shared (locale-independent) fields + tag list in the primary locale. */
export async function saveArticleShared(
  db: AuthDb,
  articleId: number,
  categoryId: number,
  tagNames: string[],
  primaryLocale: string,
  editedBy: string,
): Promise<ActionResult> {
  await db
    .update(schema.articles)
    .set({ categoryId, editedBy, updatedAt: new Date() })
    .where(eq(schema.articles.id, articleId));

  // Re-link tags: reuse by primary-locale slug, create missing.
  await db.delete(schema.articleTags).where(eq(schema.articleTags.articleId, articleId));
  for (const name of tagNames.map((n) => n.trim()).filter(Boolean)) {
    const slug = slugify(name);
    const [existing] = await db
      .select({ tagId: schema.tagTranslations.tagId })
      .from(schema.tagTranslations)
      .where(
        and(eq(schema.tagTranslations.locale, primaryLocale), eq(schema.tagTranslations.slug, slug)),
      );
    let tagId = existing?.tagId;
    if (!tagId) {
      const [tag] = await db.insert(schema.tags).values({}).returning();
      tagId = tag.id;
      await db
        .insert(schema.tagTranslations)
        .values({ tagId, locale: primaryLocale, name, slug });
    }
    await db
      .insert(schema.articleTags)
      .values({ articleId, tagId })
      .onConflictDoNothing();
  }
  return { ok: true };
}
