"use client";

import { useLocale } from "next-intl";
import { useParams } from "next/navigation";
import { routing } from "@/i18n/routing";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * EN / PL switcher. On article pages the per-locale slugs differ; the layout
 * can't know them, so article pages render their own switcher via the
 * `slugByLocale` override (set through a data attribute would be brittle —
 * instead the article page passes alternates into the masthead via context-
 * free URL mapping: we simply navigate to the same pathname, and the article
 * route resolves foreign-locale slugs server-side).
 */
export function LangSwitch() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Language">
      {routing.locales.map((l, i) => (
        <span key={l} className="flex items-center gap-1">
          {i > 0 && <span className="text-hairline">/</span>}
          <button
            className={cn(
              "cursor-pointer px-0.5 py-1 font-sans text-[11px] font-semibold tracking-[0.08em] text-ink-soft",
              locale === l && "border-b-2 border-accent text-accent",
            )}
            onClick={() => {
              // @ts-expect-error -- pathname/params pairing is route-dynamic
              router.replace({ pathname, params }, { locale: l });
            }}
          >
            {l.toUpperCase()}
          </button>
        </span>
      ))}
    </div>
  );
}
