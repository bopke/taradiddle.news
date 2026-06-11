import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LangSwitch } from "./lang-switch";
import { SearchBox } from "./search-box";

export async function Masthead({
  categories,
}: {
  categories: { id: number; name: string; slug: string }[];
}) {
  const t = await getTranslations("chrome");
  const locale = await getLocale();
  const today = new Date().toLocaleDateString(locale === "pl" ? "pl-PL" : "en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <header>
      <div className="relative flex items-center gap-[18px] border-b border-hairline px-7 py-2.5 font-sans text-[11px] tracking-[0.04em] text-ink-soft">
        <span className="font-semibold uppercase tracking-[0.12em]">{today}</span>
        <div className="ml-auto flex items-center gap-4">
          <SearchBox />
          <LangSwitch />
        </div>
      </div>

      <div className="px-7 pb-[18px] pt-[30px] text-center">
        <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          {t("mastheadEdition")}
        </span>
        <h1 className="my-1.5 text-6xl font-extrabold leading-none tracking-[-0.015em] max-[900px]:text-[44px]">
          <Link href="/">
            Taradiddle<span className="font-medium italic text-accent">.news</span>
          </Link>
        </h1>
        <p className="text-base italic text-ink-soft">{t("tagline")}</p>
      </div>

      {/* `safe center` keeps the row centered when it fits and falls back to
          flex-start when it overflows, so the first items stay reachable while
          the row scrolls horizontally (scrollbar hidden, newspaper-style). */}
      <nav className="mx-7 flex overflow-x-auto border-t border-ink [border-bottom:3px_double_var(--color-ink)] [justify-content:safe_center] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Link
          href="/"
          className="shrink-0 whitespace-nowrap px-[22px] py-2.5 font-sans text-xs font-semibold uppercase tracking-[0.14em] hover:text-accent"
        >
          {t("navHome")}
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/category/${c.slug}`}
            className="shrink-0 whitespace-nowrap border-l border-hairline px-[22px] py-2.5 font-sans text-xs font-semibold uppercase tracking-[0.14em] hover:text-accent"
          >
            {c.name}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export async function SiteFooter() {
  const t = await getTranslations("chrome");
  const locale = await getLocale();
  return (
    <footer className="mx-7 mt-10 flex flex-col gap-1.5 [border-top:3px_double_var(--color-ink)] pb-[34px] pt-[22px] text-center text-sm italic text-ink-soft">
      <p>{t("footerLine1")}</p>
      <p className="font-sans text-[10.5px] not-italic uppercase tracking-[0.1em]">
        {t("footerLine2")} · Taradiddle.news © {new Date().getFullYear()} ·{" "}
        <a href={`/${locale}/feed.xml`} className="underline underline-offset-2 hover:text-accent">
          RSS
        </a>
      </p>
    </footer>
  );
}
