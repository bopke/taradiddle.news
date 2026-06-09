/**
 * Canonical default values for seeded data. The seed SQL (drizzle/seed.sql)
 * mirrors these; runtime code reads settings through src/lib/settings.ts which
 * falls back to DEFAULT_SETTINGS when a key is missing, and the admin panel's
 * "reset to default" button restores DEFAULT_MODERATION_PROMPT.
 */

export const DEFAULT_MODERATION_PROMPT = `You are the topic moderator for Taradiddle.news, a lighthearted satirical news site that publishes obviously-untrue, deadpan parody articles (The Onion style). You will be given a suggested article topic (title and optional description).

Reject the topic if any of the following apply:
- It targets or demeans people based on race, ethnicity, nationality, religion, gender, sexuality, or disability, or is otherwise hateful.
- It is sexually explicit, or sexualizes anyone.
- It promotes, glorifies, or instructs violence, self-harm, or illegal activity.
- It concerns a real ongoing tragedy, disaster, or death where satire would mock victims (punching down) rather than institutions.
- Satirizing it would require generating plausible misinformation about real, named private individuals.
- It would violate Anthropic's usage policy.

Otherwise allow it. Satire about public institutions, public figures acting in their public roles, technology, business, science, and everyday absurdity is the whole point of the site — allow freely. When rejecting, give a one-sentence reason a bot developer can act on.

Additionally, detect the language of the submission. If it is not English, translate the title and description into natural English.`;

export const DEFAULT_SETTINGS = {
  auto_generate_enabled: false,
  auto_generate_batch_size: 3,
  self_suggest_enabled: false,
  self_suggest_count: 5,
  self_suggest_hints: "",
  moderation_enabled: true,
  moderation_model: "claude-haiku-4-5",
  moderation_prompt: DEFAULT_MODERATION_PROMPT,
  locales: ["en", "pl"],
  default_locale: "en",
} as const;

export type SettingsShape = {
  -readonly [K in keyof typeof DEFAULT_SETTINGS]: (typeof DEFAULT_SETTINGS)[K] extends readonly string[]
    ? string[]
    : (typeof DEFAULT_SETTINGS)[K];
};

export const DEFAULT_PROFILE = {
  name: "House style",
  model: "claude-sonnet-4-6",
  temperature: null,
  maxOutputTokens: 4096,
  instructions:
    "Standard Taradiddle voice: dry, deadpan, economical. Quote at least one " +
    "fictional expert or spokesperson with an absurdly specific job title. " +
    "Keep articles between 350 and 550 words.",
  isDefault: true,
} as const;

/** Starter categories with en + pl translations. */
export const STARTER_CATEGORIES = [
  { en: { name: "World", slug: "world" }, pl: { name: "Świat", slug: "swiat" } },
  { en: { name: "Politics", slug: "politics" }, pl: { name: "Polityka", slug: "polityka" } },
  { en: { name: "Technology", slug: "technology" }, pl: { name: "Technologia", slug: "technologia" } },
  { en: { name: "Science", slug: "science" }, pl: { name: "Nauka", slug: "nauka" } },
  { en: { name: "Business", slug: "business" }, pl: { name: "Biznes", slug: "biznes" } },
  { en: { name: "Culture", slug: "culture" }, pl: { name: "Kultura", slug: "kultura" } },
] as const;
