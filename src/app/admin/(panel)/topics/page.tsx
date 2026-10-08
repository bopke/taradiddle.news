import { count, desc, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { TOPIC_STATUSES, type TopicStatus } from "@/db/schema";
import { pageWindow } from "@/lib/admin/pagination";
import { getRequestContext } from "@/lib/request-context";
import { getSettings } from "@/lib/settings";
import { TopicsScreen } from "./topics-screen";

export const metadata = { title: "Topics — Taradiddle Admin" };

function parseTab(raw: string | string[] | undefined): "all" | TopicStatus {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "all") return "all";
  return TOPIC_STATUSES.find((s) => s === value) ?? "suggested";
}

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { db } = await getRequestContext();
  const query = await searchParams;
  const tab = parseTab(query.status);

  const [settings, statusCounts, categories, profiles] = await Promise.all([
    getSettings(db),
    db
      .select({ status: schema.topics.status, total: count() })
      .from(schema.topics)
      .groupBy(schema.topics.status),
    db.select().from(schema.categoryTranslations),
    db.select().from(schema.generationProfiles),
  ]);
  const counts = Object.fromEntries(statusCounts.map((c) => [c.status, c.total])) as Partial<
    Record<TopicStatus, number>
  >;
  const all = statusCounts.reduce((sum, c) => sum + c.total, 0);
  const { page, pageCount, offset, limit } = pageWindow(query.page, tab === "all" ? all : (counts[tab] ?? 0));

  const topics = await db
    .select()
    .from(schema.topics)
    .where(tab === "all" ? undefined : eq(schema.topics.status, tab))
    .orderBy(desc(schema.topics.createdAt), desc(schema.topics.id))
    .limit(limit)
    .offset(offset);

  return (
    <TopicsScreen
      // Remount per tab/page so the row selection doesn't carry over.
      key={`${tab}-${page}`}
      tab={tab}
      page={page}
      pageCount={pageCount}
      counts={{ ...counts, all }}
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
