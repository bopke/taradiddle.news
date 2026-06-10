import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/admin-session";
import { SignOutButton } from "./sign-out-button";

export const metadata = { title: "Not authorized — Taradiddle Admin" };

export default async function ForbiddenPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (user.isAdmin) redirect("/admin");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold">Not authorized</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You are signed in as <strong>{user.email}</strong>, but that address is
          not on the admin allowlist. Ask an existing admin to invite you, then
          sign in again.
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <SignOutButton />
          <Link className="text-sm underline underline-offset-4" href="/">
            Back to the site
          </Link>
        </div>
      </div>
    </main>
  );
}
