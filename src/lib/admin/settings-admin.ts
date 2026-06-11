import { and, count, eq, ne, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { generateApiKey, hashApiKey } from "@/lib/api-keys";
import type { AuthDb } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/db-errors";
import type { ActionResult } from "./topics";

/* ── Generation profiles ──────────────────────────────────────────────────── */

export type ProfileFields = {
  name: string;
  model: string;
  temperature: number | null;
  maxOutputTokens: number;
  instructions: string;
};

export async function createProfile(
  db: AuthDb,
  fields: ProfileFields,
): Promise<ActionResult & { id?: number }> {
  const [existing] = await db
    .select({ id: schema.generationProfiles.id })
    .from(schema.generationProfiles)
    .where(eq(schema.generationProfiles.name, fields.name));
  if (existing) return { ok: false, error: "A profile with this name already exists." };

  // First profile ever becomes the default automatically.
  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.generationProfiles);
  const [row] = await db
    .insert(schema.generationProfiles)
    .values({ ...fields, isDefault: total === 0 })
    .returning();
  return { ok: true, id: row.id };
}

export async function updateProfile(
  db: AuthDb,
  id: number,
  fields: ProfileFields,
): Promise<ActionResult> {
  const [clash] = await db
    .select({ id: schema.generationProfiles.id })
    .from(schema.generationProfiles)
    .where(
      and(eq(schema.generationProfiles.name, fields.name), ne(schema.generationProfiles.id, id)),
    );
  if (clash) return { ok: false, error: "A profile with this name already exists." };

  try {
    await db
      .update(schema.generationProfiles)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(schema.generationProfiles.id, id));
  } catch (error) {
    if (isUniqueViolation(error, "generation_profiles")) {
      return { ok: false, error: "A profile with this name already exists." };
    }
    throw error;
  }
  return { ok: true };
}

/** Exactly one default: set this one, unset all others. */
export async function makeDefaultProfile(db: AuthDb, id: number): Promise<ActionResult> {
  const [profile] = await db
    .select()
    .from(schema.generationProfiles)
    .where(eq(schema.generationProfiles.id, id));
  if (!profile) return { ok: false, error: "Profile not found." };

  await db
    .update(schema.generationProfiles)
    .set({ isDefault: sql`(${schema.generationProfiles.id} = ${id})` });
  return { ok: true };
}

export async function deleteProfile(db: AuthDb, id: number): Promise<ActionResult> {
  const [profile] = await db
    .select()
    .from(schema.generationProfiles)
    .where(eq(schema.generationProfiles.id, id));
  if (!profile) return { ok: false, error: "Profile not found." };
  if (profile.isDefault) return { ok: false, error: "The default profile can't be deleted." };
  // topics.profile_id FK is ON DELETE SET NULL — they fall back to the default.
  await db.delete(schema.generationProfiles).where(eq(schema.generationProfiles.id, id));
  return { ok: true };
}

/* ── API keys ─────────────────────────────────────────────────────────────── */

export async function createApiKey(
  db: AuthDb,
  name: string,
  createdBy: string,
): Promise<(ActionResult & { plainKey?: string }) | { ok: false; error: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Key name is required." };
  const [existing] = await db
    .select({ id: schema.apiKeys.id })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.name, trimmed));
  if (existing) return { ok: false, error: "A key with this name already exists." };

  const plainKey = generateApiKey();
  await db
    .insert(schema.apiKeys)
    .values({ name: trimmed, keyHash: await hashApiKey(plainKey), createdBy });
  // The plain key is returned exactly once and never stored.
  return { ok: true, plainKey };
}

export async function revokeApiKey(db: AuthDb, id: number): Promise<void> {
  await db
    .update(schema.apiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(schema.apiKeys.id, id));
}

/* ── Admin allowlist ──────────────────────────────────────────────────────── */

export async function inviteAdmin(
  db: AuthDb,
  email: string,
  invitedBy: string,
): Promise<ActionResult> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { ok: false, error: "That doesn't look like an email address." };
  }
  await db
    .insert(schema.adminAllowlist)
    .values({ email: normalized, invitedBy })
    .onConflictDoNothing();
  // Promote immediately if the account already exists (otherwise the
  // session-create hook promotes on their next sign-in).
  await db
    .update(schema.user)
    .set({ isAdmin: true })
    .where(eq(sql`lower(${schema.user.email})`, normalized));
  return { ok: true };
}

/** Removes allowlist entry and demotes the account. Self-removal is blocked. */
export async function removeAdmin(
  db: AuthDb,
  email: string,
  actingEmail: string,
): Promise<ActionResult> {
  const normalized = email.trim().toLowerCase();
  if (normalized === actingEmail.trim().toLowerCase()) {
    return { ok: false, error: "You can't remove yourself." };
  }
  await db.delete(schema.adminAllowlist).where(eq(schema.adminAllowlist.email, normalized));
  await db
    .update(schema.user)
    .set({ isAdmin: false })
    .where(eq(sql`lower(${schema.user.email})`, normalized));
  return { ok: true };
}

/* ── Categories ───────────────────────────────────────────────────────────── */

export async function saveCategory(
  db: AuthDb,
  categoryId: number | null,
  translations: { locale: string; name: string; slug: string }[],
): Promise<ActionResult> {
  if (translations.some((t) => !t.name.trim() || !t.slug.trim())) {
    return { ok: false, error: "Every locale needs a name and a slug." };
  }
  let id = categoryId;
  if (id === null) {
    const [category] = await db.insert(schema.categories).values({}).returning();
    id = category.id;
  }
  for (const t of translations) {
    await db
      .insert(schema.categoryTranslations)
      .values({ categoryId: id, locale: t.locale, name: t.name.trim(), slug: t.slug.trim() })
      .onConflictDoUpdate({
        target: [schema.categoryTranslations.categoryId, schema.categoryTranslations.locale],
        set: { name: t.name.trim(), slug: t.slug.trim() },
      });
  }
  return { ok: true };
}
