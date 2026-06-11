import { and, count, desc, eq, inArray, like, ne, or, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { AuthDb } from "@/lib/auth";

/** Front page: 1 lead + 2 rail + 6 grid; later pages: 6 grid each. */
export const FIRST_PAGE_SIZE = 9;
export const PAGE_SIZE = 6;

export type PublicArticle = {
  id: number;
  slug: string;
  title: string;
  summary: string;
  metaDescription: string;
  bodyMd: string;
  imageKey: string | null;
  imageAlt: string | null;
  model: string;
  generatedAt: Date;
  category: { id: number; name: string; slug: string };
  /** True when the requested locale has no translation (primary shown). */
  untranslated: boolean;
  viewCount: number;
};

export type PublicDeps = { db: AuthDb; locale: string; primaryLocale: string };

type RawRow = {
  article: typeof schema.articles.$inferSelect;
  translation: typeof schema.articleTranslations.$inferSelect;
  categoryName: string;
  categorySlug: string;
};

function baseQuery({ db, locale }: PublicDeps) {
  return db
    .select({
      article: schema.articles,
      translation: schema.articleTranslations,
      categoryName: schema.categoryTranslations.name,
      categorySlug: schema.categoryTranslations.slug,
    })
    .from(schema.articles)
    .innerJoin(
      schema.articleTranslations,
      eq(schema.articleTranslations.articleId, schema.articles.id),
    )
    .innerJoin(
      schema.categoryTranslations,
      and(
        eq(schema.categoryTranslations.categoryId, schema.articles.categoryId),
        eq(schema.categoryTranslations.locale, locale),
      ),
    );
}

/** Collapses locale+primary fallback rows to one per article, preferring the locale. */
function pickPerArticle(rows: RawRow[], locale: string): RawRow[] {
  const byArticle = new Map<number, RawRow>();
  for (const row of rows) {
    const existing = byArticle.get(row.article.id);
    if (!existing || (existing.translation.locale !== locale && row.translation.locale === locale)) {
      byArticle.set(row.article.id, row);
    }
  }
  return [...byArticle.values()];
}

function toPublic(row: RawRow, locale: string): PublicArticle {
  return {
    id: row.article.id,
    slug: row.translation.slug,
    title: row.translation.title,
    summary: row.translation.summary,
    metaDescription: row.translation.metaDescription,
    bodyMd: row.translation.bodyMd,
    imageKey: row.article.imageKey,
    imageAlt: row.translation.imageAlt,
    model: row.article.model,
    generatedAt: row.article.generatedAt,
    category: {
      id: row.article.categoryId,
      name: row.categoryName,
      slug: row.categorySlug,
    },
    untranslated: row.translation.locale !== locale,
    viewCount: row.article.viewCount,
  };
}

async function fetchArticles(
  deps: PublicDeps,
  where: ReturnType<typeof and> | undefined,
  opts: { limit: number; offset?: number; orderBy?: "views" | "date" },
): Promise<PublicArticle[]> {
  const fallbackLocales =
    deps.locale === deps.primaryLocale ? [deps.locale] : [deps.locale, deps.primaryLocale];
  const offset = opts.offset ?? 0;
  const rows = await baseQuery(deps)
    .where(
      and(
        eq(schema.articles.status, "published"),
        inArray(schema.articleTranslations.locale, fallbackLocales),
        where,
      ),
    )
    .orderBy(
      opts.orderBy === "views"
        ? desc(schema.articles.viewCount)
        : desc(schema.articles.generatedAt),
      desc(schema.articles.id),
    )
    // Each article may yield up to two rows (locale + primary fallback), so
    // over-fetch 2x the window before collapsing and slicing.
    .limit((offset + opts.limit) * 2);

  return pickPerArticle(rows as RawRow[], deps.locale)
    .slice(offset, offset + opts.limit)
    .map((row) => toPublic(row, deps.locale));
}

export async function getNavCategories(db: AuthDb, locale: string) {
  return db
    .select({
      id: schema.categoryTranslations.categoryId,
      name: schema.categoryTranslations.name,
      slug: schema.categoryTranslations.slug,
    })
    .from(schema.categoryTranslations)
    .where(eq(schema.categoryTranslations.locale, locale))
    .orderBy(schema.categoryTranslations.categoryId);
}

export async function getFeedPage(deps: PublicDeps, page: number) {
  const offset = page <= 1 ? 0 : FIRST_PAGE_SIZE + (page - 2) * PAGE_SIZE;
  const limit = page <= 1 ? FIRST_PAGE_SIZE : PAGE_SIZE;
  const articles = await fetchArticles(deps, undefined, { limit, offset });

  const [{ total }] = await deps.db
    .select({ total: count() })
    .from(schema.articles)
    .where(eq(schema.articles.status, "published"));
  const pageCount =
    total <= FIRST_PAGE_SIZE ? 1 : 1 + Math.ceil((total - FIRST_PAGE_SIZE) / PAGE_SIZE);

  return { articles, pageCount, total };
}

export async function getMostProcessed(deps: PublicDeps, limit = 5) {
  return fetchArticles(deps, undefined, { limit, orderBy: "views" });
}

/**
 * Resolves an article by slug in ANY locale (so a language-switcher link to a
 * not-yet-translated article still lands), then returns the requested
 * locale's content with primary fallback.
 */
export async function getArticleBySlug(
  deps: PublicDeps,
  slug: string,
): Promise<PublicArticle | null> {
  // Slugs are unique per locale, not globally — when the same string exists in
  // several locales, prefer the requested locale's article, then primary.
  const candidates = await deps.db
    .select({
      articleId: schema.articleTranslations.articleId,
      locale: schema.articleTranslations.locale,
    })
    .from(schema.articleTranslations)
    .where(eq(schema.articleTranslations.slug, slug));
  const match =
    candidates.find((c) => c.locale === deps.locale) ??
    candidates.find((c) => c.locale === deps.primaryLocale) ??
    candidates[0];
  if (!match) return null;

  const [article] = await fetchArticles(deps, eq(schema.articles.id, match.articleId), {
    limit: 1,
  });
  return article ?? null;
}

/** All locale variants of an article (hreflang + language switcher). */
export async function getArticleAlternates(db: AuthDb, articleId: number) {
  return db
    .select({
      locale: schema.articleTranslations.locale,
      slug: schema.articleTranslations.slug,
    })
    .from(schema.articleTranslations)
    .where(eq(schema.articleTranslations.articleId, articleId));
}

export async function getArticleTags(
  db: AuthDb,
  articleId: number,
  locale: string,
  primaryLocale: string,
) {
  const rows = await db
    .select({
      tagId: schema.articleTags.tagId,
      locale: schema.tagTranslations.locale,
      name: schema.tagTranslations.name,
      slug: schema.tagTranslations.slug,
    })
    .from(schema.articleTags)
    .innerJoin(schema.tagTranslations, eq(schema.tagTranslations.tagId, schema.articleTags.tagId))
    .where(
      and(
        eq(schema.articleTags.articleId, articleId),
        inArray(schema.tagTranslations.locale, [locale, primaryLocale]),
      ),
    );
  const byTag = new Map<number, { name: string; slug: string }>();
  for (const row of rows) {
    if (!byTag.has(row.tagId) || row.locale === locale) {
      byTag.set(row.tagId, { name: row.name, slug: row.slug });
    }
  }
  return [...byTag.values()];
}

export async function getRelated(
  deps: PublicDeps,
  articleId: number,
  categoryId: number,
  limit = 3,
) {
  return fetchArticles(
    deps,
    and(eq(schema.articles.categoryId, categoryId), ne(schema.articles.id, articleId)),
    { limit },
  );
}

export async function getCategoryBySlug(db: AuthDb, locale: string, slug: string) {
  const [category] = await db
    .select({
      id: schema.categoryTranslations.categoryId,
      name: schema.categoryTranslations.name,
      slug: schema.categoryTranslations.slug,
    })
    .from(schema.categoryTranslations)
    .where(
      and(
        eq(schema.categoryTranslations.locale, locale),
        eq(schema.categoryTranslations.slug, slug),
      ),
    );
  return category ?? null;
}

export async function getCategoryArticles(deps: PublicDeps, categoryId: number, limit = 24) {
  return fetchArticles(deps, eq(schema.articles.categoryId, categoryId), { limit });
}

export async function getTagBySlug(
  db: AuthDb,
  locale: string,
  primaryLocale: string,
  slug: string,
) {
  const rows = await db
    .select({
      tagId: schema.tagTranslations.tagId,
      locale: schema.tagTranslations.locale,
      name: schema.tagTranslations.name,
    })
    .from(schema.tagTranslations)
    .where(
      and(
        eq(schema.tagTranslations.slug, slug),
        inArray(schema.tagTranslations.locale, [locale, primaryLocale]),
      ),
    );
  const preferred = rows.find((r) => r.locale === locale) ?? rows[0];
  return preferred ? { id: preferred.tagId, name: preferred.name, slug } : null;
}

export async function getTagArticles(deps: PublicDeps, tagId: number, limit = 24) {
  const links = await deps.db
    .select({ articleId: schema.articleTags.articleId })
    .from(schema.articleTags)
    .where(eq(schema.articleTags.tagId, tagId));
  if (links.length === 0) return [];
  return fetchArticles(
    deps,
    inArray(
      schema.articles.id,
      links.map((l) => l.articleId),
    ),
    { limit },
  );
}

export async function searchArticles(deps: PublicDeps, query: string, limit = 24) {
  const tr = schema.articleTranslations;
  const term = `%${query.replaceAll("%", "").replaceAll("_", "")}%`;
  return fetchArticles(
    deps,
    or(like(tr.title, term), like(tr.summary, term), like(tr.bodyMd, term)),
    { limit },
  );
}

/** Fire-and-forget view counter ("Most Processed" data). */
export async function bumpViewCount(db: AuthDb, articleId: number): Promise<void> {
  await db
    .update(schema.articles)
    .set({ viewCount: sql`${schema.articles.viewCount} + 1` })
    .where(eq(schema.articles.id, articleId));
}
