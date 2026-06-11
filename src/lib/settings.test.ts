import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/db/defaults";
import * as schema from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import type { AuthDb } from "./auth";
import { getSettings, setSetting } from "./settings";

let db: TestDb;
const asDb = () => db as unknown as AuthDb;

beforeEach(() => {
  ({ db } = createTestDb());
});

describe("settings", () => {
  it("returns defaults for an empty table", async () => {
    const settings = await getSettings(asDb());
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it("overrides defaults with stored values", async () => {
    db.insert(schema.settings)
      .values([
        { key: "auto_generate_enabled", value: "true" },
        { key: "locales", value: '["en","pl","de"]' },
      ])
      .run();

    const settings = await getSettings(asDb());
    expect(settings.auto_generate_enabled).toBe(true);
    expect(settings.locales).toEqual(["en", "pl", "de"]);
    expect(settings.moderation_enabled).toBe(DEFAULT_SETTINGS.moderation_enabled);
  });

  it("keeps the default when a stored value is corrupt JSON", async () => {
    db.insert(schema.settings)
      .values({ key: "auto_generate_batch_size", value: "{not json" })
      .run();

    const settings = await getSettings(asDb());
    expect(settings.auto_generate_batch_size).toBe(DEFAULT_SETTINGS.auto_generate_batch_size);
  });

  it("ignores unknown keys", async () => {
    db.insert(schema.settings).values({ key: "mystery", value: '"x"' }).run();
    const settings = await getSettings(asDb());
    expect("mystery" in settings).toBe(false);
  });

  it("setSetting upserts and round-trips", async () => {
    await setSetting(asDb(), "self_suggest_count", 9);
    await setSetting(asDb(), "self_suggest_count", 12);
    const settings = await getSettings(asDb());
    expect(settings.self_suggest_count).toBe(12);
  });
});
