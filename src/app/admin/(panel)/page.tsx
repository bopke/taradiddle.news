import Link from "next/link";
import { count, desc, eq, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import { getRequestContext } from "@/lib/request-context";
import {
  adminBtnClass,
  CellMeta,
  CellTitle,
  formatDateTime,
  PageHead,
  Panel,
  SourceTag,
  StatusPill,
  tableClass,
  tdClass,
} from "@/components/admin/ui";
import { approveTopicsAction, rejectTopicsAction } from "./actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard — Taradiddle Admin" };

export default async function AdminDashboardPage() {
  const { db } = await getRequestContext();

  const [pending, pendingTotal, inQueue, failures, published, recentJobs] = await Promise.all([
    db
      .select()
      .from(schema.topics)
      .where(eq(schema.topics.status, "suggested"))
      .orderBy(desc(schema.topics.createdAt))
      .limit(8),
    db.select({ total: count() }).from(schema.topics).where(eq(schema.topics.status, "suggested")),
    db
      .select({ total: count() })
      .from(schema.topics)
      .where(inArray(schema.topics.status, ["queued", "generating"])),
    db
      .select({ total: count() })
      .from(schema.generationJobs)
      .where(eq(schema.generationJobs.status, "failed")),
    db
      .select({ total: count() })
      .from(schema.articles)
      .where(eq(schema.articles.status, "published")),
    db
      .select({
        job: schema.generationJobs,
        topicTitle: schema.topics.title,
      })
      .from(schema.generationJobs)
      .leftJoin(schema.topics, eq(schema.generationJobs.topicId, schema.topics.id))
      .orderBy(desc(schema.generationJobs.createdAt))
      .limit(5),
  ]);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const stats = [
    { label: "Pending suggestions", value: pendingTotal[0].total, href: "/admin/topics" },
    { label: "Queue depth", value: inQueue[0].total, href: "/admin/jobs" },
    {
      label: "Recent failures",
      value: failures[0].total,
      href: "/admin/jobs",
      alert: failures[0].total > 0,
    },
    { label: "Published articles", value: published[0].total, href: "/admin/articles" },
  ];

  return (
    <>
      <PageHead title="Dashboard" sub={`${today} · all systems nominal-ish`} />

      <div className="mb-5 grid grid-cols-4 gap-3 max-[980px]:grid-cols-2">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="flex flex-col gap-[3px] rounded-md border border-admin-border bg-admin-panel px-4 py-3.5 hover:border-admin-ink-dim"
          >
            <span
              className={cn(
                "text-[26px] font-bold leading-none tabular-nums",
                s.alert && "text-accent",
              )}
            >
              {s.value}
            </span>
            <span className="text-[11.5px] font-semibold text-admin-ink-dim">{s.label}</span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] items-start gap-4 max-[980px]:grid-cols-1">
        <Panel
          title="New suggestions"
          flush
          actions={
            <Link href="/admin/topics" className={adminBtnClass({ small: true })}>
              View all
            </Link>
          }
        >
          <table className={tableClass}>
            <tbody>
              {pending.length === 0 && (
                <tr>
                  <td className={cn(tdClass, "text-admin-ink-dim")}>
                    Nothing pending. The bots are slacking.
                  </td>
                </tr>
              )}
              {pending.map((t) => (
                <tr key={t.id} className="last:[&>td]:border-b-0">
                  <td className={tdClass}>
                    <Link href={`/admin/topics/${t.id}`} className="block">
                      <CellTitle>{t.title}</CellTitle>
                      <CellMeta>
                        <SourceTag source={t.source} /> {t.submittedBy || "self-suggested"} ·{" "}
                        {formatDateTime(t.createdAt)}
                      </CellMeta>
                    </Link>
                  </td>
                  <td className={cn(tdClass, "whitespace-nowrap text-right")}>
                    <form className="inline-flex gap-1.5">
                      <input type="hidden" name="id" value={t.id} />
                      <button
                        formAction={approveTopicsAction}
                        className={adminBtnClass({ kind: "primary", small: true })}
                      >
                        Approve
                      </button>
                      <button formAction={rejectTopicsAction} className={adminBtnClass({ small: true })}>
                        Reject
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel
          title="Pipeline activity"
          flush
          actions={
            <Link href="/admin/jobs" className={adminBtnClass({ small: true })}>
              Job log
            </Link>
          }
        >
          <table className={tableClass}>
            <tbody>
              {recentJobs.length === 0 && (
                <tr>
                  <td className={cn(tdClass, "text-admin-ink-dim")}>No jobs yet.</td>
                </tr>
              )}
              {recentJobs.map(({ job, topicTitle }) => (
                <tr key={job.id} className="last:[&>td]:border-b-0">
                  <td className={tdClass}>
                    <CellTitle>{topicTitle ?? "(topic deleted)"}</CellTitle>
                    <CellMeta>
                      job-{job.id} · attempt {job.attempt} · {job.trigger}
                    </CellMeta>
                  </td>
                  <td className={cn(tdClass, "text-right")}>
                    <StatusPill status={job.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
