import { requireAdmin } from "@/lib/admin-session";

export const metadata = { title: "Dashboard — Taradiddle Admin" };

/** Placeholder dashboard — replaced with the real one in Phase 7. */
export default async function AdminDashboardPage() {
  const user = await requireAdmin();
  return (
    <main className="p-8">
      <h1 className="text-lg font-semibold">Taradiddle Admin</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Signed in as {user.email}. The real dashboard arrives in Phase 7.
      </p>
    </main>
  );
}
