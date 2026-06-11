import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";

// Reads D1 and the production origin — must render at request time, not build time.
export const dynamic = "force-dynamic";
import * as schema from "@/db/schema";
import { routing } from "@/i18n/routing";
import { getPublicContext } from "@/lib/public/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { db, origin } = await getPublicContext();

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${origin}/${routing.defaultLocale}`,
      alternates: {
        languages: Object.fromEntries(routing.locales.map((l) => [l, `${origin}/${l}`])),
      },
    },
  ];

  // Articles: one entry per published article, hreflang across its locales.
  const translations = await db
    .select({
      articleId: schema.articleTranslations.articleId,
      locale: schema.articleTranslations.locale,
      slug: schema.articleTranslations.slug,
      updatedAt: schema.articles.updatedAt,
    })
    .from(schema.articleTranslations)
    .innerJoin(schema.articles, eq(schema.articles.id, schema.articleTranslations.articleId))
    .where(eq(schema.articles.status, "published"));

  const byArticle = new Map<number, typeof translations>();
  for (const t of translations) {
    const group = byArticle.get(t.articleId) ?? [];
    group.push(t);
    byArticle.set(t.articleId, group);
  }
  for (const group of byArticle.values()) {
    const primary = group.find((t) => t.locale === routing.defaultLocale) ?? group[0];
    entries.push({
      url: `${origin}/${primary.locale}/articles/${primary.slug}`,
      lastModified: primary.updatedAt,
      alternates: {
        languages: Object.fromEntries(
          group.map((t) => [t.locale, `${origin}/${t.locale}/articles/${t.slug}`]),
        ),
      },
    });
  }

  // Category and tag listings per locale.
  const categories = await db.select().from(schema.categoryTranslations);
  for (const c of categories) {
    entries.push({ url: `${origin}/${c.locale}/category/${c.slug}` });
  }
  const tags = await db.select().from(schema.tagTranslations);
  for (const t of tags) {
    entries.push({ url: `${origin}/${t.locale}/tag/${t.slug}` });
  }

  return entries;
}
