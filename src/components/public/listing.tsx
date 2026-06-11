import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArticleCard } from "./article-bits";
import type { PublicArticle } from "@/lib/public/queries";

export async function Listing({
  heading,
  sub,
  articles,
  emptyText,
}: {
  heading: string;
  sub?: string;
  articles: PublicArticle[];
  emptyText: string;
}) {
  const t = await getTranslations("article");
  return (
    <main className="p-12 max-[900px]:p-7">
      <header className="pt-2 text-center">
        <h1 className="text-[42px] font-extrabold tracking-[-0.01em]">{heading}</h1>
        {sub && (
          <p className="mt-2 font-sans text-[11px] uppercase tracking-[0.14em] text-ink-soft">
            {sub}
          </p>
        )}
      </header>
      <div className="my-[26px] [border-bottom:3px_double_var(--color-ink)]" />
      {articles.length === 0 ? (
        <p className="py-10 text-center text-[17px] italic text-ink-soft">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-7 gap-y-[30px] max-[900px]:grid-cols-1">
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} size="small" />
          ))}
        </div>
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
