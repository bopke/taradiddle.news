import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Listing } from "@/components/public/listing";
import { searchArticles } from "@/lib/public/queries";
import { getPublicContext } from "@/lib/public/site";

export const metadata: Metadata = {
  title: "Search — Taradiddle.news",
  robots: { index: false },
};

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { q } = await searchParams;
  const t = await getTranslations("listing");

  const query = (q ?? "").trim().slice(0, 100);
  const { db, settings } = await getPublicContext();
  const articles = query
    ? await searchArticles({ db, locale, primaryLocale: settings.default_locale }, query)
    : [];

  return (
    <Listing
      heading={`${t("searchResultsFor")} “${query}”`}
      sub={t("articles", { count: articles.length })}
      articles={articles}
      emptyText={t("searchNone")}
    />
  );
}
