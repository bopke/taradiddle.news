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
  const { auth } = await getRequestContext();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email, isAdmin } = session.user as SessionUser;
  return { id, name, email, isAdmin: !!isAdmin };
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
