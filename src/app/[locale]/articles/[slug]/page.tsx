import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  ArticleCard,
  Byline,
  CategoryKicker,
  HeroImage,
  RailHeading,
} from "@/components/public/article-bits";
import { renderArticleHtml } from "@/lib/public/markdown";
import {
  bumpViewCount,
  getArticleAlternates,
  getArticleBySlug,
  getArticleTags,
  getRelated,
} from "@/lib/public/queries";
import { getPublicContext } from "@/lib/public/site";

type Params = { locale: string; slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const { db, settings, origin } = await getPublicContext();
  const deps = { db, locale, primaryLocale: settings.default_locale };
  const article = await getArticleBySlug(deps, slug);
  if (!article) return {};

  const alternates = await getArticleAlternates(db, article.id);
  const languages = Object.fromEntries(
    alternates.map((a) => [a.locale, `${origin}/${a.locale}/articles/${a.slug}`]),
  );
  const url = `${origin}/${locale}/articles/${article.slug}`;

  return {
    title: `${article.title} — Taradiddle.news`,
    description: article.metaDescription,
    alternates: { canonical: url, languages },
    openGraph: {
      title: article.title,
      description: article.metaDescription,
      type: "article",
      url,
      locale,
      ...(article.imageKey ? { images: [`${origin}/images/${article.imageKey}`] } : {}),
    },
    twitter: {
      card: article.imageKey ? "summary_large_image" : "summary",
      title: article.title,
      description: article.metaDescription,
    },
  };
}

export default async function ArticlePage({ params }: { params: Promise<Params> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("article");

  const { db, settings, origin } = await getPublicContext();
  const deps = { db, locale, primaryLocale: settings.default_locale };
  const article = await getArticleBySlug(deps, slug);
  if (!article) notFound();

  // Count the view without blocking the render.
  const { ctx } = await getCloudflareContext({ async: true });
  ctx.waitUntil(bumpViewCount(db, article.id).catch(() => {}));

  const [tags, related] = await Promise.all([
    getArticleTags(db, article.id, locale, settings.default_locale),
    getRelated(deps, article.id, article.category.id),
  ]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.metaDescription,
    datePublished: article.generatedAt.toISOString(),
    inLanguage: locale,
    isAccessibleForFree: true,
    author: { "@type": "Organization", name: "Taradiddle.news" },
    publisher: { "@type": "Organization", name: "Taradiddle.news" },
    ...(article.imageKey ? { image: [`${origin}/images/${article.imageKey}`] } : {}),
  };

  return (
    <main className="mx-auto max-w-[820px] p-12 max-[900px]:p-7">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="flex flex-col gap-4">
        <CategoryKicker category={article.category} />
        <h1 className="text-[46px] font-extrabold leading-[1.06] tracking-[-0.015em] text-pretty max-[900px]:text-[34px]">
          {article.title}
        </h1>
        <p className="text-[21px] italic leading-[1.4] text-ink-soft text-pretty">
          {article.summary}
        </p>
        <Byline article={article} />

        {article.untranslated && (
          <div className="border border-hairline border-l-4 border-l-accent bg-paper-dim px-4 py-3 font-sans text-[13px] text-ink-soft">
            {t("notTranslated")}
          </div>
        )}

        <HeroImage article={article} ratio="2 / 1" priority />

        <div
          className="article-prose mx-auto mt-2 w-full max-w-[680px]"
          dangerouslySetInnerHTML={{ __html: renderArticleHtml(article.bodyMd) }}
        />

        {tags.length > 0 && (
          <div className="mx-auto mt-1 flex w-full max-w-[680px] flex-wrap gap-2">
            {tags.map((tag) => (
              <Link
                key={tag.slug}
                href={`/tag/${tag.slug}`}
                className="border border-hairline px-2.5 py-1 font-sans text-[11px] font-semibold tracking-[0.06em] text-ink-soft hover:border-accent hover:text-accent"
              >
                #{tag.name}
              </Link>
            ))}
          </div>
        )}

        <p className="mx-auto mt-2.5 w-full max-w-[680px] border-t border-hairline pt-3 font-sans text-[11.5px] italic text-ink-soft">
          {t("disclosure")}
        </p>
      </article>

      {related.length > 0 && (
        <section className="mt-11">
          <RailHeading>{t("related")}</RailHeading>
          <div className="grid grid-cols-3 gap-6 max-[900px]:grid-cols-1">
            {related.map((a) => (
              <ArticleCard key={a.id} article={a} size="small" />
            ))}
          </div>
        </section>
      )}

      <Link
        href="/"
        className="mt-9 inline-block font-sans text-xs font-semibold uppercase tracking-[0.1em] text-accent hover:underline"
      >
        ← {t("backToFront")}
      </Link>
    </main>
  );
}
