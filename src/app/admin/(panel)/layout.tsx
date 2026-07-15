import { count, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { requireAdmin } from "@/lib/admin-session";
import { countUnresolvedFailedJobs } from "@/lib/admin/jobs";
import { getRequestContext } from "@/lib/request-context";
import { AdminSidebar } from "@/components/admin/sidebar";

/**
 * Auth gate + shell for every admin screen. The login and forbidden pages
 * live outside this route group, so they stay reachable.
 */
export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();
  const { db } = await getRequestContext();

  const [[suggested], failedJobsCount] = await Promise.all([
    db.select({ total: count() }).from(schema.topics).where(eq(schema.topics.status, "suggested")),
    countUnresolvedFailedJobs(db),
  ]);

  return (
    <div className="flex min-h-screen bg-admin-bg font-sans text-[13px] text-admin-ink">
      <AdminSidebar
        userEmail={user.email}
        suggestedCount={suggested.total}
        failedJobsCount={failedJobsCount}
      />
      <div className="min-w-0 flex-1">
        <div className="max-w-[1200px] px-7 pb-12 pt-6">{children}</div>
      </div>
    </div>
  );
}
