# Taradiddle.news

AI-generated satirical news site. Next.js on Cloudflare Workers (OpenNext), D1, R2, Queues, Workers AI, Anthropic API.

## Local development

```sh
npm install
npx wrangler login   # required once: the Workers AI binding always proxies to the
                     # real service, so `next dev` needs an authenticated session
npm run dev          # Next.js dev server with Cloudflare bindings (local D1/R2/queue)
npm test             # Vitest
```

## Database

```sh
npm run db:generate        # drizzle-kit generate → ./drizzle migrations
npm run db:migrate:local   # apply to local (miniflare) D1
npm run db:migrate:remote  # apply to the real D1 database
```

## Deploy

One-time resource setup:

```sh
npx wrangler d1 create taradiddle        # put the returned id into wrangler.jsonc
npx wrangler r2 bucket create taradiddle-images
npx wrangler queues create article-generation
npx wrangler queues create article-generation-dlq
```

Secrets (`wrangler secret put <NAME>`): `ANTHROPIC_API_KEY`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL` (the public site URL), `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`.
(GitHub/Google OAuth are planned but not wired up yet — Discord only for now.)

## Auth & admins

Sign-in: email+password or Discord OAuth (Discord app redirect URI:
`<site>/api/auth/callback/discord`). Anyone can create an account, but the
admin panel only opens for emails on the `admin_allowlist` table (enforced in
`src/lib/auth.ts`); an allowlisted email is promoted on the next sign-in.
The Settings screen for inviting admins arrives in Phase 7 — until then, add
rows to `admin_allowlist` via `wrangler d1 execute`. **Bootstrap:** on a fresh
database the very first account created becomes admin automatically — sign up
right after deploying, no SQL needed.

For local dev, copy `.dev.vars.example` to `.dev.vars` and fill it in.

Then:

```sh
npm run deploy
```

### CI (Cloudflare Workers Builds)

- Build command: `npm run build` (runs `opennextjs-cloudflare build`).
- Deploy command: `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`
  — migrations apply right before the new code goes live; `migrations apply` is
  a no-op when nothing is pending. Keep migrations additive (no drops/renames in
  the same deploy as code that needs the old shape). `wrangler deploy`
  auto-detects the OpenNext project and delegates to `opennextjs-cloudflare
  deploy` — the same thing the local `npm run deploy` script calls directly.

## Architecture notes

- `worker.ts` is the worker entrypoint: it wraps the OpenNext-generated `fetch`
  handler and adds the `queue` consumer (article generation pipeline) and
  `scheduled` handlers (auto-generate + AI topic self-suggestion crons).
- `next.config.ts` initializes Cloudflare bindings for `next dev` only — the
  init is phase-guarded so `next build` works without a wrangler login.
- Health/bindings check: `GET /api/health`.
