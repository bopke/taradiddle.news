import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { PublicArticle } from "@/lib/public/queries";
import { cn } from "@/lib/utils";

/** Deterministic hue per category for the striped no-image placeholder. */
export function categoryHue(categoryId: number): number {
  return (categoryId * 67) % 360;
}

export function HeroImage({
  article,
  ratio,
  className,
  priority,
}: {
  article: PublicArticle;
  ratio: string;
  className?: string;
  priority?: boolean;
}) {
  if (article.imageKey) {
    return (
      // R2-served, already sized by the generator; next/image gains nothing here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/images/${article.imageKey}`}
        alt={article.imageAlt ?? ""}
        className={cn("w-full border border-hairline object-cover", className)}
        style={{ aspectRatio: ratio }}
        loading={priority ? "eager" : "lazy"}
      />
    );
  }
  const hue = categoryHue(article.category.id);
  const base = `oklch(0.93 0.015 ${hue})`;
  const stripe = `oklch(0.88 0.022 ${hue})`;
  return (
    <div
      aria-hidden="true"
      className={cn("flex w-full items-center justify-center border border-hairline", className)}
      style={{
        aspectRatio: ratio,
        background: `repeating-linear-gradient(-45deg, ${base} 0 10px, ${stripe} 10px 20px)`,
      }}
    >
      <span className="border border-hairline bg-paper px-2.5 py-1 font-mono text-[11px] text-ink-soft">
        {article.category.name}
      </span>
    </div>
  );
}

export function CategoryKicker({ category }: { category: PublicArticle["category"] }) {
  return (
    <Link
      href={`/category/${category.slug}`}
      className="font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-accent hover:underline"
    >
      {category.name}
    </Link>
  );
}

export function Byline({ article }: { article: PublicArticle }) {
  const t = useTranslations("article");
  const locale = useLocaleTag();
  return (
    <div className="flex flex-wrap items-center gap-2 font-sans text-[10.5px] uppercase tracking-[0.06em] text-ink-soft">
      <span className="font-semibold">
        {t("by")} CLAUDE ({article.model})
      </span>
      <span>·</span>
      <span>
        {article.generatedAt.toLocaleDateString(locale, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </span>
    </div>
  );
}

function useLocaleTag() {
  const locale = useLocale();
  return locale === "pl" ? "pl-PL" : "en-US";
}

export function ArticleCard({
  article,
  size,
  showImage = true,
  priority,
}: {
  article: PublicArticle;
  size: "lead" | "medium" | "small";
  showImage?: boolean;
  priority?: boolean;
}) {
  const href = `/articles/${article.slug}`;
  return (
    <article className="flex flex-col">
      {showImage && (
        <Link href={href}>
          <HeroImage article={article} ratio={size === "lead" ? "16 / 9" : "3 / 2"} priority={priority} />
        </Link>
      )}
      <div className="flex flex-col gap-[7px] pt-[11px]">
        <CategoryKicker category={article.category} />
        <h2
          className={cn(
            "leading-[1.12] tracking-[-0.01em]",
            size === "lead" && "text-[44px] font-bold max-[900px]:text-[34px]",
            size === "medium" && "text-[23px] font-bold",
            size === "small" && "text-[19px] font-semibold leading-[1.2]",
          )}
        >
          <Link
            href={href}
            className="hover:underline hover:decoration-2 hover:underline-offset-[3px]"
          >
            {article.title}
          </Link>
        </h2>
        {(size === "lead" || size === "medium") && (
          <p className="text-base leading-[1.45] text-ink-soft text-pretty">{article.summary}</p>
        )}
        <Byline article={article} />
      </div>
    </article>
  );
}

export function RailHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-4 border-b border-ink pb-[7px] font-sans text-[11px] font-bold uppercase tracking-[0.2em] text-accent">
      {children}
    </h3>
  );
}

export function MostProcessed({ articles }: { articles: PublicArticle[] }) {
  const t = useTranslations("home");
  if (articles.length === 0) return null;
  return (
    <aside className="border-l border-hairline pl-7 max-[900px]:border-l-0 max-[900px]:pl-0">
      <RailHeading>{t("mostProcessed")}</RailHeading>
      <ol className="flex flex-col">
        {articles.map((a, idx) => (
          <li
            key={a.id}
            className="flex gap-3.5 border-b border-hairline py-3 text-base font-semibold leading-[1.25] last:border-b-0"
          >
            <span className="w-5 shrink-0 font-serif text-[26px] font-normal italic leading-none text-accent">
              {idx + 1}
            </span>
            <Link href={`/articles/${a.slug}`} className="hover:underline">
              {a.title}
            </Link>
          </li>
        ))}
      </ol>
    </aside>
  );
}
