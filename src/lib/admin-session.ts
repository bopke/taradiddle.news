import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRequestContext } from "./request-context";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  // Read headers() before constructing auth: it's the dynamic-rendering
  // signal, so build-time prerendering bails out here instead of reaching
  // createAuth(), which needs runtime-only secrets.
  const requestHeaders = await headers();
  const { auth } = await getRequestContext();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) return null;
  const u: Record<string, unknown> = session.user;
  if (typeof u.id !== "string" || typeof u.email !== "string") return null;
  return {
    id: u.id,
    name: typeof u.name === "string" ? u.name : "",
    email: u.email,
    // SQLite stores booleans as 0/1; only strict true counts as admin.
    isAdmin: u.isAdmin === true || u.isAdmin === 1,
  };
}

/**
 * Gate for everything under /admin (except the login screen): redirects
 * anonymous visitors to the login page; non-admin accounts land on a 403.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!user.isAdmin) redirect("/admin/forbidden");
  return user;
}
