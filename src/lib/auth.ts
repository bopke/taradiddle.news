import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import * as schema from "@/db/schema";

/** Both runtime D1 (async) and the better-sqlite3 test driver (sync) fit. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AuthDb = BaseSQLiteDatabase<"sync" | "async", any, typeof schema>;

export type AuthEnv = {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
};

async function isAllowlisted(db: AuthDb, email: string): Promise<boolean> {
  // Lowercase both sides — allowlist rows may be entered with any casing.
  const rows = await db
    .select({ email: schema.adminAllowlist.email })
    .from(schema.adminAllowlist)
    .where(sql`lower(${schema.adminAllowlist.email}) = ${email.toLowerCase()}`);
  return rows.length > 0;
}

/** Bootstrap rule: with no users at all, whoever signs up first runs the place. */
async function isFirstUser(db: AuthDb): Promise<boolean> {
  const rows = await db.select({ id: schema.user.id }).from(schema.user).limit(1);
  return rows.length === 0;
}

/**
 * Builds the Better Auth instance bound to a database. Called per request with
 * the Cloudflare env (cheap — no I/O at construction).
 *
 * Admin model: anyone can create an account, but `isAdmin` is only set when
 * the email is on `admin_allowlist` — checked at account creation and again at
 * every session creation, so allowlisting an existing user promotes them on
 * their next sign-in. Exception: the very first account ever created becomes
 * admin unconditionally (bootstrap — no manual SQL needed on a fresh deploy).
 */
export function createAuth(db: AuthDb, env: AuthEnv) {
  if (!env.BETTER_AUTH_SECRET) {
    // Without this, Better Auth would fall back to a known default secret.
    throw new Error(
      "BETTER_AUTH_SECRET is required — set it in .dev.vars (dev) or via `wrangler secret put` (production)",
    );
  }
  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    secret: env.BETTER_AUTH_SECRET,
    // When unset (local dev), Better Auth infers the base URL from each
    // request — so the origin check and OAuth callbacks follow whatever port
    // `next dev` actually picked. Production sets BETTER_AUTH_URL explicitly.
    baseURL: env.BETTER_AUTH_URL || undefined,
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      // GitHub and Google are planned but deliberately not wired up yet.
      ...(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET
        ? {
            discord: {
              clientId: env.DISCORD_CLIENT_ID,
              clientSecret: env.DISCORD_CLIENT_SECRET,
            },
          }
        : {}),
    },
    account: {
      accountLinking: {
        enabled: true,
        // Discord verifies email addresses, so linking a Discord sign-in to an
        // existing account with the same email is safe. Admins can then use
        // either method interchangeably.
        trustedProviders: ["discord"],
      },
    },
    user: {
      additionalFields: {
        isAdmin: {
          type: "boolean",
          defaultValue: false,
          input: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({
            data: {
              ...user,
              isAdmin: (await isFirstUser(db)) || (await isAllowlisted(db, user.email)),
            },
          }),
        },
      },
      session: {
        create: {
          before: async (session) => {
            const [user] = await db
              .select()
              .from(schema.user)
              .where(eq(schema.user.id, session.userId));
            if (user && !user.isAdmin && (await isAllowlisted(db, user.email))) {
              await db
                .update(schema.user)
                .set({ isAdmin: true })
                .where(eq(schema.user.id, user.id));
            }
            return { data: session };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
