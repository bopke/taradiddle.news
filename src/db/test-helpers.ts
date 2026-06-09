import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type TestDb = BetterSQLite3Database<typeof schema>;

/**
 * In-memory SQLite with the real generated migrations applied — the same SQL
 * D1 runs. FKs are enforced (D1 enforces them too).
 */
export function createTestDb(): { db: TestDb; sqlite: Database.Database } {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return { db, sqlite };
}
