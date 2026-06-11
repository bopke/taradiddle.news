import { defineRouting } from "next-intl/routing";
import { DEFAULT_SETTINGS } from "@/db/defaults";

/**
 * Locale routing is static config (middleware can't read D1): keep in sync
 * with the `locales` / `default_locale` settings, whose source of truth for
 * fresh databases is DEFAULT_SETTINGS anyway.
 */
export const routing = defineRouting({
  locales: DEFAULT_SETTINGS.locales,
  defaultLocale: DEFAULT_SETTINGS.default_locale,
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
