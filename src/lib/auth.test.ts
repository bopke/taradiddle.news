import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import { createAuth, type Auth, type AuthDb } from "./auth";

let db: TestDb;
let auth: Auth;

const TEST_ENV = {
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
  BETTER_AUTH_URL: "http://localhost:3000",
};

beforeEach(() => {
  ({ db } = createTestDb());
  auth = createAuth(db as unknown as AuthDb, TEST_ENV);
});

function getUserByEmail(email: string) {
  return db.select().from(schema.user).where(eq(schema.user.email, email)).get();
}

/** The bootstrap rule makes the first-ever account admin; seed one so the
 * allowlist behavior under test isn't short-circuited. */
async function seedFirstUser() {
  await auth.api.signUpEmail({
    body: { name: "Founder", email: "founder@example.com", password: "hunter2hunter2" },
  });
}

describe("auth", () => {
  it("makes the very first account an admin (bootstrap), even with an empty allowlist", async () => {
    await seedFirstUser();
    expect(getUserByEmail("founder@example.com")!.isAdmin).toBe(true);
  });

  it("creates a non-admin account for a later email not on the allowlist", async () => {
    await seedFirstUser();
    await auth.api.signUpEmail({
      body: { name: "Rando", email: "rando@example.com", password: "hunter2hunter2" },
    });

    const user = getUserByEmail("rando@example.com");
    expect(user).toBeDefined();
    expect(user!.isAdmin).toBe(false);
  });

  it("creates an admin account when the email is allowlisted", async () => {
    await seedFirstUser();
    db.insert(schema.adminAllowlist).values({ email: "boss@example.com" }).run();

    await auth.api.signUpEmail({
      body: { name: "Boss", email: "boss@example.com", password: "hunter2hunter2" },
    });

    expect(getUserByEmail("boss@example.com")!.isAdmin).toBe(true);
  });

  it("promotes an existing user on sign-in after they get allowlisted", async () => {
    await seedFirstUser();
    await auth.api.signUpEmail({
      body: { name: "Later", email: "later@example.com", password: "hunter2hunter2" },
    });
    expect(getUserByEmail("later@example.com")!.isAdmin).toBe(false);

    db.insert(schema.adminAllowlist).values({ email: "later@example.com" }).run();

    await auth.api.signInEmail({
      body: { email: "later@example.com", password: "hunter2hunter2" },
    });

    expect(getUserByEmail("later@example.com")!.isAdmin).toBe(true);
  });

  it("rejects sign-in with a wrong password", async () => {
    await seedFirstUser();
    await auth.api.signUpEmail({
      body: { name: "X", email: "x@example.com", password: "hunter2hunter2" },
    });

    await expect(
      auth.api.signInEmail({ body: { email: "x@example.com", password: "wrong-password" } }),
    ).rejects.toThrow();
  });

  it("matches allowlist entries case-insensitively on the user email", async () => {
    await seedFirstUser();
    db.insert(schema.adminAllowlist).values({ email: "mixed@example.com" }).run();

    await auth.api.signUpEmail({
      body: { name: "Mixed", email: "Mixed@Example.com", password: "hunter2hunter2" },
    });

    // Better Auth normalizes emails to lowercase; the allowlist check lowercases too.
    const user = db.select().from(schema.user).all().find((u) => u.email.toLowerCase() === "mixed@example.com");
    expect(user).toBeDefined();
    expect(user!.isAdmin).toBe(true);
  });
});
