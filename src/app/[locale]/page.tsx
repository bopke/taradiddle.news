import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArticleCard, MostProcessed, RailHeading } from "@/components/public/article-bits";
import { DoubleRule, PageMain } from "@/components/public/chrome";
import { getFeedPage, getMostProcessed } from "@/lib/public/queries";
import { getPublicContext } from "@/lib/public/site";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "chrome" });
  const { origin } = await getPublicContext();
  return {
    title: "Taradiddle.news",
    description: t("tagline"),
    alternates: {
      canonical: `${origin}/${locale}`,
      languages: { en: `${origin}/en`, pl: `${origin}/pl` },
    },
    openGraph: {
      title: "Taradiddle.news",
      description: t("tagline"),
      type: "website",
      locale,
    },
  };
}

export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { page: pageRaw } = await searchParams;
  const t = await getTranslations("home");

  const { db, settings } = await getPublicContext();
  const deps = { db, locale, primaryLocale: settings.default_locale };

  const requestedPage = Math.max(1, Number(pageRaw) || 1);
  const { articles, pageCount } = await getFeedPage(deps, requestedPage);
  const page = Math.min(requestedPage, pageCount);
  const mostProcessed = await getMostProcessed(deps);

  const lead = page === 1 ? articles[0] : undefined;
  const secondary = page === 1 ? articles.slice(1, 3) : [];
  const grid = page === 1 ? articles.slice(3) : articles;

  return (
    <PageMain>
      {page === 1 && lead && (
        <>
          <section className="grid grid-cols-[1.7fr_1fr] gap-11 max-[900px]:grid-cols-1">
            <ArticleCard article={lead} size="lead" priority />
            <div className="flex flex-col gap-6 border-l border-hairline pl-8 max-[900px]:border-l-0 max-[900px]:pl-0">
              {secondary.map((a) => (
                <ArticleCard key={a.id} article={a} size="medium" />
              ))}
            </div>
          </section>
          <DoubleRule />
        </>
      )}

      <section className="grid grid-cols-[2.4fr_1fr] gap-9 max-[900px]:grid-cols-1">
        <div>
          <RailHeading>{page > 1 ? t("latestPage", { page }) : t("latest")}</RailHeading>
          {grid.length === 0 ? (
            <p className="py-10 text-center text-[17px] italic text-ink-soft">…</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-9 gap-y-[42px] max-[900px]:grid-cols-1">
              {grid.map((a) => (
                <ArticleCard key={a.id} article={a} size="small" />
              ))}
            </div>
          )}

          {pageCount > 1 && (
            <nav
              aria-label="Pagination"
              className="mt-7 flex items-center justify-between gap-4 border-t border-ink pt-3.5 font-sans text-xs font-semibold uppercase tracking-[0.08em]"
            >
              {page > 1 ? (
                <Link href={page === 2 ? "/" : `/?page=${page - 1}`} className="text-accent hover:underline">
                  {t("newer")}
                </Link>
              ) : (
                <span className="text-hairline">{t("newer")}</span>
              )}
              <span className="flex gap-1.5">
                {Array.from({ length: pageCount }, (_, i) => (
                  <Link
                    key={i}
                    href={i === 0 ? "/" : `/?page=${i + 1}`}
                    className={cn(
                      "flex size-[26px] items-center justify-center border border-transparent text-ink-soft hover:border-hairline",
                      page === i + 1 && "border-ink text-ink",
                    )}
                  >
                    {i + 1}
                  </Link>
                ))}
              </span>
              {page < pageCount ? (
                <Link href={`/?page=${page + 1}`} className="text-accent hover:underline">
                  {t("older")}
                </Link>
              ) : (
                <span className="text-hairline">{t("older")}</span>
              )}
            </nav>
          )}
        </div>
        <MostProcessed articles={mostProcessed} />
      </section>
    </PageMain>
  );
}
