import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/admin-session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — Taradiddle Admin" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user?.isAdmin) redirect("/admin");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="font-serif text-2xl font-bold tracking-tight">
            Taradiddle
            <span className="italic text-accent">.admin</span>
          </span>
        </div>
        <LoginForm />
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Access is allowlist-only. Signing in does not grant admin rights unless
          an existing admin has invited your email address.
        </p>
      </div>
    </main>
  );
}
