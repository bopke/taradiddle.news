import { requireAdmin } from "@/lib/admin-session";

/**
 * Auth gate for every admin screen. The login and forbidden pages live
 * outside this route group, so they stay reachable.
 */
export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return <>{children}</>;
}
