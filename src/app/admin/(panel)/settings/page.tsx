import { desc } from "drizzle-orm";
import * as schema from "@/db/schema";
import { getRequestContext } from "@/lib/request-context";
import { requireAdmin } from "@/lib/admin-session";
import { getSettings } from "@/lib/settings";
import { SettingsScreen } from "./settings-screen";

export const metadata = { title: "Settings — Taradiddle Admin" };

export default async function SettingsPage() {
  const user = await requireAdmin();
  const { db } = await getRequestContext();
  const settings = await getSettings(db);

  const [allowlist, users, apiKeys, categories, profiles] = await Promise.all([
    db.select().from(schema.adminAllowlist),
    db.select().from(schema.user),
    db.select().from(schema.apiKeys).orderBy(desc(schema.apiKeys.createdAt)),
    db.select().from(schema.categoryTranslations),
    db.select().from(schema.generationProfiles),
  ]);

  const selfEmail = user.email.toLowerCase();
  const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const admins = allowlist.map((a) => {
    // Rows are normally stored lowercase, but tolerate hand-inserted ones.
    const email = a.email.toLowerCase();
    return {
      email,
      hasAccount: userByEmail.has(email),
      isSelf: email === selfEmail,
      added: a.createdAt.toISOString(),
    };
  });
  // Bootstrap admins (first user) may not be on the allowlist — show them too.
  for (const u of users.filter((u) => u.isAdmin)) {
    const email = u.email.toLowerCase();
    if (!admins.some((a) => a.email === email)) {
      admins.unshift({
        email,
        hasAccount: true,
        isSelf: email === selfEmail,
        added: u.createdAt.toISOString(),
      });
    }
  }

  const categoryIds = [...new Set(categories.map((c) => c.categoryId))];

  return (
    <SettingsScreen
      admins={admins}
      apiKeys={apiKeys.map((k) => ({
        id: k.id,
        name: k.name,
        createdAt: k.createdAt.toISOString(),
        revokedAt: k.revokedAt?.toISOString() ?? null,
      }))}
      categories={categoryIds.map((id) => ({
        id,
        translations: settings.locales.map((locale) => {
          const t = categories.find((c) => c.categoryId === id && c.locale === locale);
          return { locale, name: t?.name ?? "", slug: t?.slug ?? "" };
        }),
      }))}
      profiles={profiles.map((p) => ({
        id: p.id,
        name: p.name,
        model: p.model,
        temperature: p.temperature,
        maxOutputTokens: p.maxOutputTokens,
        instructions: p.instructions,
        isDefault: p.isDefault,
      }))}
      settings={{
        autoGenerateEnabled: settings.auto_generate_enabled,
        autoGenerateBatchSize: settings.auto_generate_batch_size,
        selfSuggestEnabled: settings.self_suggest_enabled,
        selfSuggestCount: settings.self_suggest_count,
        selfSuggestHints: settings.self_suggest_hints,
        moderationEnabled: settings.moderation_enabled,
        moderationModel: settings.moderation_model,
        moderationPrompt: settings.moderation_prompt,
        locales: settings.locales,
        defaultLocale: settings.default_locale,
      }}
    />
  );
}
