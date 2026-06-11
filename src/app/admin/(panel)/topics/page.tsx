import { desc } from "drizzle-orm";
import * as schema from "@/db/schema";
import { getRequestContext } from "@/lib/request-context";
import { getSettings } from "@/lib/settings";
import { TopicsScreen } from "./topics-screen";

export const metadata = { title: "Topics — Taradiddle Admin" };

export default async function TopicsPage() {
  const { db } = await getRequestContext();
  const settings = await getSettings(db);

  const [topics, categories, profiles] = await Promise.all([
    db.select().from(schema.topics).orderBy(desc(schema.topics.createdAt)),
    db.select().from(schema.categoryTranslations),
    db.select().from(schema.generationProfiles),
  ]);

  return (
    <TopicsScreen
      topics={topics.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        source: t.source,
        priority: t.priority,
        scheduledFor: t.scheduledFor?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        originalLocale: t.originalLocale,
      }))}
      categories={categories
        .filter((c) => c.locale === settings.default_locale)
        .map((c) => ({ id: c.categoryId, name: c.name }))}
      profiles={profiles.map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault }))}
    />
  );
}
