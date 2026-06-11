import { getTranslations } from "next-intl/server";
import { BackToFront, PageMain } from "@/components/public/chrome";

export default async function PublicNotFound() {
  const t = await getTranslations("notFound");
  return (
    <PageMain className="flex flex-col items-center gap-3.5 pb-16 pt-16 text-center">
      <p className="font-serif text-[120px] font-extrabold leading-none tracking-[-0.03em] text-accent">
        404
      </p>
      <h1 className="text-[34px] font-bold tracking-[-0.01em]">{t("title")}</h1>
      <p className="max-w-[460px] text-[17px] italic text-ink-soft text-pretty">{t("sub")}</p>
      <BackToFront className="mt-2" />
    </PageMain>
  );
}
