import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/db";
import type { AuthDb } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import type { SettingsShape } from "@/db/defaults";

/**
 * Canonical site origin for absolute URLs (sitemap, OG, JSON-LD, RSS).
 * Normalized through URL so values like "https://example.com/auth/" or
 * trailing slashes can't leak paths into generated URLs.
 */
export function siteOrigin(env: { BETTER_AUTH_URL?: string }): string {
  try {
    return new URL(env.BETTER_AUTH_URL ?? "").origin;
  } catch {
    return "http://localhost:3000";
  }
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
