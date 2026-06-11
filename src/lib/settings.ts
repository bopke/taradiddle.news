import { settings as settingsTable } from "@/db/schema";
import { DEFAULT_SETTINGS, type SettingsShape } from "@/db/defaults";
import type { AuthDb } from "./auth";

/** Any drizzle sqlite db (D1 at runtime, better-sqlite3 in tests). */
export type AnyDb = AuthDb;

/**
 * Reads all settings, JSON-decoding values and falling back to
 * DEFAULT_SETTINGS for missing or unparseable rows — the app must keep
 * working even if a setting row is absent or corrupted.
 */
export async function getSettings(db: AnyDb): Promise<SettingsShape> {
  const rows = await db.select().from(settingsTable);
  const result: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (!(row.key in DEFAULT_SETTINGS)) continue;
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {
      // Keep the default for unparseable values.
    }
  }
  return result as SettingsShape;
}

export async function setSetting<K extends keyof SettingsShape>(
  db: AnyDb,
  key: K,
  value: SettingsShape[K],
): Promise<void> {
  await db
    .insert(settingsTable)
    .values({ key, value: JSON.stringify(value) })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value: JSON.stringify(value) },
    });
}
