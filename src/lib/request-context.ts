import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb, type Db } from "@/db";
import { createAuth, type Auth } from "./auth";

/** Per-request Cloudflare env + db + auth, for route handlers and RSC. */
export async function getRequestContext(): Promise<{
  env: CloudflareEnv;
  db: Db;
  auth: Auth;
}> {
  const { env } = await getCloudflareContext({ async: true });
  const db = getDb(env);
  const auth = createAuth(db, env);
  return { env, db, auth };
}
