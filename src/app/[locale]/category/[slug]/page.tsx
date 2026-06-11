import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Listing } from "@/components/public/listing";
import { getCategoryArticles, getCategoryBySlug } from "@/lib/public/queries";
import { getPublicContext } from "@/lib/public/site";

type Params = { locale: string; slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const { db, origin } = await getPublicContext();
  const category = await getCategoryBySlug(db, locale, slug);
  if (!category) return {};
  return {
    title: `${category.name} — Taradiddle.news`,
    alternates: { canonical: `${origin}/${locale}/category/${slug}` },
  };
}

export default async function CategoryPage({ params }: { params: Promise<Params> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("listing");

  const { db, settings } = await getPublicContext();
  const category = await getCategoryBySlug(db, locale, slug);
  if (!category) notFound();

  const articles = await getCategoryArticles(
    { db, locale, primaryLocale: settings.default_locale },
    category.id,
  );

  return (
    <Listing
      heading={category.name}
      sub={`${t("categoryLabel")} · ${t("articles", { count: articles.length })}`}
      articles={articles}
      emptyText={t("emptyCategory")}
    />
  );
}
