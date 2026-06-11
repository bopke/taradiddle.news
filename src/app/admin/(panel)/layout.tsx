import { count, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { requireAdmin } from "@/lib/admin-session";
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

  const [[suggested], [failedJobs]] = await Promise.all([
    db.select({ total: count() }).from(schema.topics).where(eq(schema.topics.status, "suggested")),
    db
      .select({ total: count() })
      .from(schema.generationJobs)
      .where(eq(schema.generationJobs.status, "failed")),
  ]);

  return (
    <div className="flex min-h-screen bg-admin-bg font-sans text-[13px] text-admin-ink">
      <AdminSidebar
        userEmail={user.email}
        suggestedCount={suggested.total}
        failedJobsCount={failedJobs.total}
      />
      <div className="min-w-0 flex-1">
        <div className="max-w-[1200px] px-7 pb-12 pt-6">{children}</div>
      </div>
    </div>
  );
}
