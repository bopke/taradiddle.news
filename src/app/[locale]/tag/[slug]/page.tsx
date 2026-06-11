import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Listing } from "@/components/public/listing";
import { getTagArticles, getTagBySlug } from "@/lib/public/queries";
import { getPublicContext } from "@/lib/public/site";

type Params = { locale: string; slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const { db, settings, origin } = await getPublicContext();
  const tag = await getTagBySlug(db, locale, settings.default_locale, slug);
  if (!tag) return {};
  return {
    title: `#${tag.name} — Taradiddle.news`,
    alternates: { canonical: `${origin}/${locale}/tag/${slug}` },
  };
}

export default async function TagPage({ params }: { params: Promise<Params> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("listing");

  const { db, settings } = await getPublicContext();
  const tag = await getTagBySlug(db, locale, settings.default_locale, slug);
  if (!tag) notFound();

  const articles = await getTagArticles(
    { db, locale, primaryLocale: settings.default_locale },
    tag.id,
  );

  return (
    <Listing
      heading={`#${tag.name}`}
      sub={`${t("tagLabel")} · ${t("articles", { count: articles.length })}`}
      articles={articles}
      emptyText={t("emptyCategory")}
    />
  );
}
