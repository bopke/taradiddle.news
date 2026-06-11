"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

const inputClass =
  "border border-hairline bg-paper px-2.5 py-[5px] font-sans text-xs text-ink outline-none focus:border-ink";

function MagnifierIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="6.5" cy="6.5" r="4.5" />
      <line x1="10" y1="10" x2="14" y2="14" />
    </svg>
  );
}

/**
 * Archive search. Full input on wide screens; below 700px it collapses to a
 * magnifying-glass button that expands into an input overlaying the topbar
 * (the topbar wrapper is `relative`).
 */
export function SearchBox() {
  const t = useTranslations("chrome");
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!q.trim()) return;
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
    setQ("");
    setOpen(false);
  }

  return (
    <>
      {/* Wide screens: the input, always visible. */}
      <form onSubmit={submit} className="max-[700px]:hidden">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className={`${inputClass} w-[180px]`}
        />
      </form>

      {/* Narrow screens: magnifier toggle. */}
      <button
        type="button"
        aria-label={t("searchPlaceholder")}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="hidden cursor-pointer p-1 text-ink-soft hover:text-ink max-[700px]:block"
      >
        <MagnifierIcon />
      </button>

      {/* Narrow screens, expanded: input overlays the whole topbar row. */}
      {open && (
        <form
          onSubmit={submit}
          className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b border-hairline bg-paper px-7 py-[7px] min-[700px]:hidden"
        >
          <input
            type="search"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => {
              if (!q.trim()) setOpen(false);
            }}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className={`${inputClass} flex-1`}
          />
          <button
            type="button"
            aria-label={t("closeSearch")}
            onClick={() => {
              setQ("");
              setOpen(false);
            }}
            className="cursor-pointer px-1 font-sans text-base leading-none text-ink-soft hover:text-ink"
          >
            ×
          </button>
        </form>
      )}
    </>
  );
}
