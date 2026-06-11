"use server";

import { revalidatePath } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/admin-session";
import { getRequestContext } from "@/lib/request-context";
import {
  saveArticleShared,
  saveArticleTranslation,
  setArticleStatus,
  deleteArticle as deleteArticleDb,
} from "@/lib/admin/articles";
import {
  createApiKey,
  createProfile,
  deleteProfile,
  inviteAdmin,
  makeDefaultProfile,
  removeAdmin,
  revokeApiKey,
  saveCategory,
  updateProfile,
} from "@/lib/admin/settings-admin";
import {
  addTopic,
  addTopicNote,
  approveTopics,
  generateTopics,
  rejectTopics,
  updateTopic,
  type ActionResult,
} from "@/lib/admin/topics";
import { DEFAULT_MODERATION_PROMPT } from "@/db/defaults";
import { getSettings, setSetting } from "@/lib/settings";
import { enqueueRegeneration, enqueueTranslation } from "@/queue/producer";

async function ctx() {
  const user = await requireAdmin();
  const { db } = await getRequestContext();
  const { env } = await getCloudflareContext({ async: true });
  return { user, db, queue: env.GENERATION_QUEUE };
}

/* ── Topics ───────────────────────────────────────────────────────────────── */

const ids = (formData: FormData) =>
  formData
    .getAll("id")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);

export async function approveTopicsAction(formData: FormData): Promise<void> {
  const { db } = await ctx();
  await approveTopics(db, ids(formData));
  revalidatePath("/admin", "layout");
}

export async function rejectTopicsAction(formData: FormData): Promise<void> {
  const { db } = await ctx();
  await rejectTopics(db, ids(formData));
  revalidatePath("/admin", "layout");
}

export async function generateTopicsAction(formData: FormData): Promise<void> {
  const { db, queue, user } = await ctx();
  await generateTopics(db, queue, ids(formData), user.email);
  revalidatePath("/admin", "layout");
}

function topicFields(formData: FormData) {
  const text = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v.trim() : "";
  };
  const scheduled = text("scheduledFor");
  return {
    title: text("title"),
    description: text("description") || null,
    categoryId: text("categoryId") ? Number(text("categoryId")) : null,
    priority: Number(text("priority") || "0"),
    scheduledFor: scheduled ? new Date(scheduled) : null,
    profileId: text("profileId") ? Number(text("profileId")) : null,
  };
}

export async function addTopicAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { db, user } = await ctx();
  const fields = topicFields(formData);
  if (fields.title.length < 3) return { ok: false, error: "Title is too short." };
  const result = await addTopic(db, fields, user.email);
  if (result.ok) revalidatePath("/admin", "layout");
  return result;
}

export async function updateTopicAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { db } = await ctx();
  const id = Number(formData.get("topicId"));
  const fields = topicFields(formData);
  if (fields.title.length < 3) return { ok: false, error: "Title is too short." };
  const result = await updateTopic(db, id, fields);
  if (result.ok) revalidatePath("/admin", "layout");
  return result;
}

export async function addNoteAction(formData: FormData): Promise<void> {
  const { db, user } = await ctx();
  const topicId = Number(formData.get("topicId"));
  const body = String(formData.get("body") ?? "");
  await addTopicNote(db, topicId, user.id, body);
  revalidatePath(`/admin/topics/${topicId}`);
}

/* ── Articles ─────────────────────────────────────────────────────────────── */

export async function toggleArticleStatusAction(formData: FormData): Promise<void> {
  const { db, user } = await ctx();
  const id = Number(formData.get("articleId"));
  const next = formData.get("next") === "published" ? "published" : "unpublished";
  await setArticleStatus(db, id, next, user.id);
  revalidatePath("/admin", "layout");
}

export async function regenerateArticleAction(formData: FormData): Promise<void> {
  const { db, queue, user } = await ctx();
  await enqueueRegeneration(db, queue, Number(formData.get("articleId")), user.email);
  revalidatePath("/admin", "layout");
}

export async function deleteArticleAction(formData: FormData): Promise<void> {
  const { db } = await ctx();
  await deleteArticleDb(db, Number(formData.get("articleId")));
  revalidatePath("/admin", "layout");
}

export async function retryTranslationAction(formData: FormData): Promise<void> {
  const { db, queue } = await ctx();
  await enqueueTranslation(
    db,
    queue,
    Number(formData.get("articleId")),
    String(formData.get("locale")),
  );
  revalidatePath("/admin", "layout");
}

export async function saveTranslationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { db, user } = await ctx();
  const articleId = Number(formData.get("articleId"));
  const locale = String(formData.get("locale"));
  const text = (name: string) => String(formData.get(name) ?? "").trim();
  if (text("title").length < 3) return { ok: false, error: "Title is too short." };
  const result = await saveArticleTranslation(
    db,
    articleId,
    locale,
    {
      title: text("title"),
      slug: text("slug"),
      summary: text("summary"),
      metaDescription: text("metaDescription"),
      bodyMd: String(formData.get("bodyMd") ?? "").trim(),
      imageAlt: text("imageAlt") || null,
    },
    user.id,
  );
  if (result.ok) revalidatePath("/admin", "layout");
  return result;
}

export async function saveSharedAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { db, user } = await ctx();
  const settings = await getSettings(db);
  const result = await saveArticleShared(
    db,
    Number(formData.get("articleId")),
    Number(formData.get("categoryId")),
    String(formData.get("tags") ?? "").split(","),
    settings.default_locale,
    user.id,
  );
  if (result.ok) revalidatePath("/admin", "layout");
  return result;
}

/* ── Jobs ─────────────────────────────────────────────────────────────────── */

export async function retryJobAction(formData: FormData): Promise<void> {
  const { db, queue, user } = await ctx();
  const topicId = Number(formData.get("topicId"));
  if (topicId > 0) await generateTopics(db, queue, [topicId], user.email);
  revalidatePath("/admin", "layout");
}

/* ── Settings: pipeline & moderation ─────────────────────────────────────── */

export async function savePipelineSettingsAction(formData: FormData): Promise<void> {
  const { db } = await ctx();
  await setSetting(db, "auto_generate_enabled", formData.get("autoGenerate") === "on");
  await setSetting(
    db,
    "auto_generate_batch_size",
    Math.max(1, Number(formData.get("autoGenerateBatchSize") || 3)),
  );
  await setSetting(db, "self_suggest_enabled", formData.get("selfSuggest") === "on");
  await setSetting(
    db,
    "self_suggest_count",
    Math.max(1, Number(formData.get("selfSuggestCount") || 5)),
  );
  await setSetting(db, "self_suggest_hints", String(formData.get("selfSuggestHints") ?? "").trim());
  revalidatePath("/admin/settings");
}

export async function saveModerationSettingsAction(formData: FormData): Promise<void> {
  const { db } = await ctx();
  await setSetting(db, "moderation_enabled", formData.get("moderation") === "on");
  await setSetting(db, "moderation_model", String(formData.get("moderationModel") ?? "claude-haiku-4-5"));
  const prompt = String(formData.get("moderationPrompt") ?? "").trim();
  if (prompt) await setSetting(db, "moderation_prompt", prompt);
  revalidatePath("/admin/settings");
}

export async function resetModerationPromptAction(): Promise<void> {
  const { db } = await ctx();
  await setSetting(db, "moderation_prompt", DEFAULT_MODERATION_PROMPT);
  revalidatePath("/admin/settings");
}

/* ── Settings: profiles ───────────────────────────────────────────────────── */

function profileFields(formData: FormData) {
  const text = (name: string) => String(formData.get(name) ?? "").trim();
  const temp = text("temperature");
  return {
    name: text("name"),
    model: text("model"),
    temperature: temp === "" ? null : Number(temp),
    maxOutputTokens: Math.max(256, Number(text("maxOutputTokens") || 4096)),
    instructions: text("instructions"),
  };
}

export async function createProfileAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { db } = await ctx();
  const fields = profileFields(formData);
  if (!fields.name || !fields.model) return { ok: false, error: "Name and model are required." };
  const result = await createProfile(db, fields);
  if (result.ok) revalidatePath("/admin/settings");
  return result;
}

export async function updateProfileAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { db } = await ctx();
  const fields = profileFields(formData);
  if (!fields.name || !fields.model) return { ok: false, error: "Name and model are required." };
  const result = await updateProfile(db, Number(formData.get("profileId")), fields);
  if (result.ok) revalidatePath("/admin/settings");
  return result;
}

export async function makeDefaultProfileAction(formData: FormData): Promise<void> {
  const { db } = await ctx();
  await makeDefaultProfile(db, Number(formData.get("profileId")));
  revalidatePath("/admin/settings");
}

export async function deleteProfileAction(formData: FormData): Promise<void> {
  const { db } = await ctx();
  await deleteProfile(db, Number(formData.get("profileId")));
  revalidatePath("/admin/settings");
}

/* ── Settings: API keys & admins & categories ────────────────────────────── */

export async function createApiKeyAction(
  _prev: { ok: boolean; error?: string; plainKey?: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; error?: string; plainKey?: string }> {
  const { db, user } = await ctx();
  const result = await createApiKey(db, String(formData.get("name") ?? ""), user.id);
  if (result.ok) revalidatePath("/admin/settings");
  return result;
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const { db } = await ctx();
  await revokeApiKey(db, Number(formData.get("keyId")));
  revalidatePath("/admin/settings");
}

export async function inviteAdminAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { db, user } = await ctx();
  const result = await inviteAdmin(db, String(formData.get("email") ?? ""), user.id);
  if (result.ok) revalidatePath("/admin/settings");
  return result;
}

export async function removeAdminAction(formData: FormData): Promise<void> {
  const { db, user } = await ctx();
  await removeAdmin(db, String(formData.get("email") ?? ""), user.email);
  revalidatePath("/admin/settings");
}

export async function saveCategoryAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { db } = await ctx();
  const settings = await getSettings(db);
  const categoryIdRaw = formData.get("categoryId");
  const translations = settings.locales.map((locale) => ({
    locale,
    name: String(formData.get(`name_${locale}`) ?? "").trim(),
    slug: String(formData.get(`slug_${locale}`) ?? "").trim(),
  }));
  const result = await saveCategory(
    db,
    categoryIdRaw ? Number(categoryIdRaw) : null,
    translations,
  );
  if (result.ok) revalidatePath("/admin", "layout");
  return result;
}
