import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Masthead, SiteFooter } from "@/components/public/masthead";
import { getNavCategories } from "@/lib/public/queries";
import { getPublicContext } from "@/lib/public/site";

export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const { db } = await getPublicContext();
  const categories = await getNavCategories(db, locale);

  return (
    <NextIntlClientProvider>
      <div className="min-h-screen bg-paper-dim font-serif text-ink">
        <div className="mx-auto min-h-screen max-w-[1140px] bg-paper shadow-[0_0_40px_rgba(28,26,22,0.08)]">
          <Masthead categories={categories} />
          {children}
          <SiteFooter />
        </div>
      </div>
    </NextIntlClientProvider>
  );
}
