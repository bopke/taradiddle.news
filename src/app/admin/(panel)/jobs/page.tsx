import { listJobs } from "@/lib/admin/jobs";
import { getRequestContext } from "@/lib/request-context";
import {
  adminBtnClass,
  CellMeta,
  CellTitle,
  formatDateTime,
  PageHead,
  StatusPill,
  tableClass,
  tdClass,
  thClass,
} from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { retryJobAction } from "../actions";

export const metadata = { title: "Generation jobs — Taradiddle Admin" };

export default async function JobsPage() {
  const { db } = await getRequestContext();
  const jobs = await listJobs(db, 200);

  return (
    <>
      <PageHead
        title="Generation jobs"
        sub="Audit trail of every queue message. D1 is the source of truth; the queue is transport."
      />
      <div className="overflow-hidden rounded-md border border-admin-border">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Job</th>
              <th className={thClass}>Topic</th>
              <th className={thClass}>Trigger</th>
              <th className={thClass}>Attempt</th>
              <th className={thClass}>Started</th>
              <th className={thClass}>Status</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr>
                <td colSpan={7} className={cn(tdClass, "text-admin-ink-dim")}>
                  No jobs yet.
                </td>
              </tr>
            )}
            {jobs.map(({ job, topicTitle, resolved }) => (
              <tr key={job.id} className="last:[&>td]:border-b-0">
                <td className={cn(tdClass, "font-mono text-[11.5px] text-admin-ink-dim")}>
                  job-{job.id}
                </td>
                <td className={tdClass}>
                  <CellTitle>{topicTitle ?? "(topic deleted)"}</CellTitle>
                  {job.error && (
                    <CellMeta>
                      <span className="text-[oklch(0.45_0.14_25)]">{job.error}</span>
                    </CellMeta>
                  )}
                </td>
                <td className={cn(tdClass, "text-xs text-admin-ink-dim")}>{job.trigger}</td>
                <td className={cn(tdClass, "tabular-nums")}>{job.attempt}</td>
                <td className={cn(tdClass, "whitespace-nowrap text-xs text-admin-ink-dim")}>
                  {formatDateTime(job.startedAt)}
                </td>
                <td className={tdClass}>
                  <StatusPill status={resolved ? "resolved" : job.status} />
                </td>
                <td className={cn(tdClass, "text-right")}>
                  {job.status === "failed" && !resolved && job.topicId && (
                    <form action={retryJobAction}>
                      <input type="hidden" name="topicId" value={job.topicId} />
                      <button className={adminBtnClass({ kind: "accent", small: true })}>Retry</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
