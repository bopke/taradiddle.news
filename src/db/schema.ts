import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

/* ---------------------------------------------------------------------------
 * Better Auth tables (field names follow Better Auth's core schema; extended
 * with isAdmin). Referenced by the drizzle adapter in src/lib/auth.ts.
 * ------------------------------------------------------------------------- */

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Emails allowed to become admins. Signing in (any method) with an email on
 * this list sets user.isAdmin. Rows are added from the admin Settings screen.
 */
export const adminAllowlist = sqliteTable("admin_allowlist", {
  email: text("email").primaryKey(),
  invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/* ---------------------------------------------------------------------------
 * Content pipeline
 * ------------------------------------------------------------------------- */

export const TOPIC_STATUSES = [
  "suggested",
  "approved",
  "queued",
  "generating",
  "done",
  "rejected",
  "failed",
] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

export const TOPIC_SOURCES = ["admin", "api", "ai"] as const;
export type TopicSource = (typeof TOPIC_SOURCES)[number];

export const topics = sqliteTable(
  "topics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Always stored in the primary locale (normalized at ingestion). */
    title: text("title").notNull(),
    description: text("description"),
    /** Original submission when it arrived in a non-primary language. */
    originalTitle: text("original_title"),
    originalDescription: text("original_description"),
    originalLocale: text("original_locale"),
    status: text("status", { enum: TOPIC_STATUSES }).notNull().default("suggested"),
    priority: integer("priority").notNull().default(0),
    /** Don't auto-generate before this time. Null = whenever. */
    scheduledFor: integer("scheduled_for", { mode: "timestamp" }),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    /** Generation profile override; null = site default profile. */
    profileId: integer("profile_id").references(() => generationProfiles.id, {
      onDelete: "set null",
    }),
    source: text("source", { enum: TOPIC_SOURCES }).notNull(),
    /** Admin user id or API key name, depending on source. */
    submittedBy: text("submitted_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("topics_picker_idx").on(t.status, t.priority, t.scheduledFor)],
);

export const topicNotes = sqliteTable(
  "topic_notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("topic_notes_topic_idx").on(t.topicId)],
);

export const ARTICLE_STATUSES = ["published", "unpublished"] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export const articles = sqliteTable(
  "articles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Survives topic deletion. */
    topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id),
    /** R2 object key of the hero image; null = category placeholder renders. */
    imageKey: text("image_key"),
    status: text("status", { enum: ARTICLE_STATUSES }).notNull().default("published"),
    /** Incremented on article-page views (any locale); feeds "Most Processed". */
    viewCount: integer("view_count").notNull().default(0),
    /** Which Claude model wrote it. */
    model: text("model").notNull(),
    profileId: integer("profile_id").references(() => generationProfiles.id, {
      onDelete: "set null",
    }),
    generatedAt: integer("generated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: updatedAt(),
    /** Audit only — no "human-edited" badge on the site (design decision). */
    editedBy: text("edited_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [index("articles_feed_idx").on(t.status, t.generatedAt)],
);

export const articleTranslations = sqliteTable(
  "article_translations",
  {
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    /** Human-facing lede. */
    summary: text("summary").notNull(),
    /** ~155-char SEO description written by the generator. */
    metaDescription: text("meta_description").notNull(),
    bodyMd: text("body_md").notNull(),
    imageAlt: text("image_alt"),
    translatedAt: integer("translated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    primaryKey({ columns: [t.articleId, t.locale] }),
    uniqueIndex("article_translations_slug_idx").on(t.locale, t.slug),
  ],
);

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: createdAt(),
});

export const tagTranslations = sqliteTable(
  "tag_translations",
  {
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tagId, t.locale] }),
    uniqueIndex("tag_translations_slug_idx").on(t.locale, t.slug),
  ],
);

export const articleTags = sqliteTable(
  "article_tags",
  {
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.tagId] })],
);

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  description: text("description"),
  createdAt: createdAt(),
});

export const categoryTranslations = sqliteTable(
  "category_translations",
  {
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.categoryId, t.locale] }),
    uniqueIndex("category_translations_slug_idx").on(t.locale, t.slug),
  ],
);

/* ---------------------------------------------------------------------------
 * Operations
 * ------------------------------------------------------------------------- */

export const apiKeys = sqliteTable("api_keys", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  /** SHA-256 of the key; the key itself is shown once at creation. */
  keyHash: text("key_hash").notNull().unique(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
});

/** Per-key, per-hour request counter backing the suggestion API rate limit. */
export const apiKeyUsage = sqliteTable(
  "api_key_usage",
  {
    apiKeyId: integer("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    /** Hour bucket: unix epoch seconds truncated to the hour. */
    windowStart: integer("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.apiKeyId, t.windowStart] })],
);

export const JOB_STATUSES = ["queued", "running", "succeeded", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_TRIGGERS = ["manual", "cron", "batch", "translate"] as const;
export type JobTrigger = (typeof JOB_TRIGGERS)[number];

/** Audit trail of queue work — D1 is the source of truth; the Queue is transport. */
export const generationJobs = sqliteTable(
  "generation_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
    articleId: integer("article_id").references(() => articles.id, {
      onDelete: "set null",
    }),
    status: text("status", { enum: JOB_STATUSES }).notNull().default("queued"),
    trigger: text("trigger", { enum: JOB_TRIGGERS }).notNull(),
    /** Truncated error message of the latest failed attempt. */
    error: text("error"),
    attempt: integer("attempt").notNull().default(0),
    startedAt: integer("started_at", { mode: "timestamp" }),
    finishedAt: integer("finished_at", { mode: "timestamp" }),
    createdAt: createdAt(),
  },
  (t) => [index("generation_jobs_topic_idx").on(t.topicId)],
);

export const generationProfiles = sqliteTable("generation_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  model: text("model").notNull(),
  /** Null = omit from the request (required for Opus 4.7+, which rejects it). */
  temperature: real("temperature"),
  maxOutputTokens: integer("max_output_tokens").notNull().default(4096),
  /** Appended to the base generation prompt — the profile's writing voice. */
  instructions: text("instructions").notNull().default(""),
  /** Exactly one profile is the site default; it can't be deleted. */
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Key-value settings; values are JSON-encoded. Defaults live in src/db/defaults.ts. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
