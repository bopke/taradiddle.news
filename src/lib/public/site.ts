import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/db";
import type { AuthDb } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import type { SettingsShape } from "@/db/defaults";

/** Canonical site origin for absolute URLs (sitemap, OG, JSON-LD, RSS). */
export function siteOrigin(env: { BETTER_AUTH_URL?: string }): string {
  return env.BETTER_AUTH_URL || "http://localhost:3000";
}

export type PublicContext = {
  env: CloudflareEnv;
  db: AuthDb;
  settings: SettingsShape;
  origin: string;
};

export async function getPublicContext(): Promise<PublicContext> {
  const { env } = await getCloudflareContext({ async: true });
  const db = getDb(env);
  const settings = await getSettings(db);
  return { env, db, settings, origin: siteOrigin(env) };
}
