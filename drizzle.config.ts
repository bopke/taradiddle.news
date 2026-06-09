import { defineConfig } from "drizzle-kit";

// Used for `drizzle-kit generate` only — SQL migrations land in ./drizzle and
// are applied with `wrangler d1 migrations apply DB --local|--remote`.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
