import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** Page content container: airy desktop padding, tighter on phones. */
export function PageMain({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <main className={cn("p-12 max-[900px]:p-7", className)}>{children}</main>;
}

/** The newspaper double rule separating page sections. */
export function DoubleRule({ className }: { className?: string }) {
  return <div className={cn("my-[26px] [border-bottom:3px_double_var(--color-ink)]", className)} />;
}

/** Accent uppercase "← Back to the front page" link. */
export async function BackToFront({ className }: { className?: string }) {
  const t = await getTranslations("article");
  return (
    <Link
      href="/"
      className={cn(
        "mt-9 inline-block font-sans text-xs font-semibold uppercase tracking-[0.1em] text-accent hover:underline",
        className,
      )}
    >
      ← {t("backToFront")}
    </Link>
  );
}
