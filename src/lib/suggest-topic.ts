import type Anthropic from "@anthropic-ai/sdk";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@/db/schema";
import { hashApiKey } from "./api-keys";
import type { AuthDb } from "./auth";
import { moderateTopic } from "./moderation";
import { getSettings } from "./settings";
import { normalizeTitle } from "./slugs";

/** Requests per key per rolling hour bucket. */
export const RATE_LIMIT_PER_HOUR = 60;

const bodySchema = z.object({
  title: z.string().trim().min(3).max(300),
  description: z.string().trim().max(2000).optional(),
  /** Category slug in any locale (e.g. "science" or "nauka"). */
  category: z.string().trim().optional(),
  priority: z.number().int().min(-100).max(100).optional(),
});

export type SuggestDeps = {
  db: AuthDb;
  anthropic: Anthropic;
  /** Injectable clock for rate-limit window tests. */
  now?: () => Date;
};

/**
 * POST /api/suggestions — the only published API (see spec § External API).
 * Bearer-key authenticated; rate limited; deduplicated; moderated.
 */
export async function handleSuggestionRequest(
  deps: SuggestDeps,
  request: Request,
): Promise<Response> {
  const { db } = deps;
  const now = deps.now?.() ?? new Date();

  // --- Authentication --------------------------------------------------------
  const authorization = request.headers.get("authorization") ?? "";
  const key = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!key) return json(401, { error: "invalid_api_key" });

  const keyHash = await hashApiKey(key);
  const [apiKey] = await db
    .select()
    .from(schema.apiKeys)
    .where(and(eq(schema.apiKeys.keyHash, keyHash), isNull(schema.apiKeys.revokedAt)));
  if (!apiKey) return json(401, { error: "invalid_api_key" });

  // --- Rate limit (counts every authenticated request) -----------------------
  const windowStart = Math.floor(now.getTime() / 1000 / 3600) * 3600;
  const [usage] = await db
    .insert(schema.apiKeyUsage)
    .values({ apiKeyId: apiKey.id, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [schema.apiKeyUsage.apiKeyId, schema.apiKeyUsage.windowStart],
      set: { count: sql`${schema.apiKeyUsage.count} + 1` },
    })
    .returning();
  if (usage.count > RATE_LIMIT_PER_HOUR) {
    return json(429, { error: "rate_limited", retry_after_seconds: windowStart + 3600 - Math.floor(now.getTime() / 1000) });
  }

  // --- Validation -------------------------------------------------------------
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json(422, { error: "invalid_request", details: "body must be JSON" });
  }
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return json(422, { error: "invalid_request", details: z.flattenError(parsed.error).fieldErrors });
  }
  const body = parsed.data;

  let categoryId: number | null = null;
  if (body.category) {
    const [category] = await db
      .select({ id: schema.categoryTranslations.categoryId })
      .from(schema.categoryTranslations)
      .where(eq(schema.categoryTranslations.slug, body.category));
    if (!category) {
      return json(422, { error: "invalid_request", details: `unknown category "${body.category}"` });
    }
    categoryId = category.id;
  }

  // --- Dedup (against the moderated/normalized title too, see below) ---------
  const existingTitles = await db
    .select({ title: schema.topics.title, originalTitle: schema.topics.originalTitle })
    .from(schema.topics);
  const taken = new Set(
    existingTitles.flatMap((t) =>
      [t.title, t.originalTitle].filter((x): x is string => !!x).map(normalizeTitle),
    ),
  );
  if (taken.has(normalizeTitle(body.title))) {
    return json(409, { error: "duplicate_topic" });
  }

  // --- Moderation + language normalization ------------------------------------
  const settings = await getSettings(db);
  const moderation = await moderateTopic(deps.anthropic, settings, {
    title: body.title,
    description: body.description,
  });

  if (moderation.kind === "flagged") {
    return json(422, { error: "rejected_by_moderation", reason: moderation.reason });
  }

  const normalized =
    moderation.kind === "allowed"
      ? moderation
      : { title: body.title, description: body.description ?? null, original: null };

  // The translated title may collide where the submitted one didn't.
  if (normalized.original && taken.has(normalizeTitle(normalized.title))) {
    return json(409, { error: "duplicate_topic" });
  }

  // --- Insert ------------------------------------------------------------------
  const [topic] = await db
    .insert(schema.topics)
    .values({
      title: normalized.title,
      description: normalized.description,
      originalTitle: normalized.original?.title ?? null,
      originalDescription: normalized.original?.description ?? null,
      originalLocale: normalized.original?.locale ?? null,
      categoryId,
      priority: body.priority ?? 0,
      source: "api",
      submittedBy: apiKey.name,
    })
    .returning();

  return json(201, {
    topic: {
      id: topic.id,
      title: topic.title,
      description: topic.description,
      status: topic.status,
      priority: topic.priority,
      created_at: topic.createdAt,
    },
  });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
