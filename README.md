# Taradiddle.news

AI-generated satirical news site — *tar·a·did·dle: a petty lie; pretentious nonsense.*
Next.js on Cloudflare Workers (OpenNext), D1, R2, Queues, Workers AI, Anthropic API.

- Spec: `docs/superpowers/specs/2026-06-09-ainews-design.md`
- Plan: `docs/superpowers/plans/2026-06-10-ainews-implementation-plan.md`
- Visual design: `docs/superpowers/design/ainews/` (claude.ai/design handoff)

## How it works

Topics arrive from bots (`POST /api/suggestions`), admins, or daily AI
self-suggestion. Bot/AI topics pass a Haiku moderation call that also
normalizes non-English submissions. Admins curate the topic queue at `/admin`;
approved topics get enqueued (manually, in batches, or by cron), the queue
consumer generates the article with the topic's generation profile, a Flux
hero image, and a translation per extra locale, then publishes. The public
site serves `/{en,pl}` with per-locale slugs, search, RSS, sitemap + hreflang.

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars   # fill in secrets (see the file)
npx wrangler login   # once: the Workers AI binding always proxies to the real service
npm run dev          # Next.js dev server with bindings (local D1/R2; queue consumer DOES NOT run)
npm run preview      # full worker under wrangler dev — queue consumer + crons work here
npm test             # Vitest (100 tests)
npm run db:migrate:local && npm run db:seed:local   # fresh local database
```

> The queue consumer and cron handlers live in the Worker (`worker.ts`), so
> generation only runs under `npm run preview` or in production — never under
> plain `next dev`.

## Database

```sh
npm run db:generate        # drizzle-kit generate → ./drizzle migrations
npm run db:migrate:local   # apply to local (miniflare) D1
npm run db:migrate:remote  # apply to the real D1 database
npm run db:seed:local      # idempotent seed (categories, settings, default profile)
npm run db:seed:remote
```

Note: the local D1 sqlite file is keyed by `database_id` — changing the id in
`wrangler.jsonc` silently starts a fresh local DB (re-run migrate + seed).

## Deploy

One-time resource setup (already done for this project):

```sh
npx wrangler d1 create taradiddle        # put the returned id into wrangler.jsonc
npx wrangler r2 bucket create taradiddle-images
npx wrangler queues create article-generation
npx wrangler queues create article-generation-dlq
```

Secrets (`wrangler secret put <NAME>`):

| Secret | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Generation, translation, moderation, self-suggestion |
| `BETTER_AUTH_SECRET` | Session signing (≥32 random chars) |
| `BETTER_AUTH_URL` | Public origin, e.g. `https://taradiddle.news` — also used for sitemap/OG/RSS URLs |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Discord OAuth (GitHub/Google planned, not wired) |

Manual deploy: `npm run deploy` (build → remote migrations → deploy).

### CI (Cloudflare Workers Builds)

- Build command: `npm run build` (runs `opennextjs-cloudflare build`).
- Deploy command: `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`
  — migrations apply right before the new code goes live; `migrations apply` is
  a no-op when nothing is pending. Keep migrations additive (no drops/renames in
  the same deploy as code that needs the old shape). `wrangler deploy`
  auto-detects the OpenNext project and delegates to `opennextjs-cloudflare deploy`.

### Post-deploy checklist (fresh environment)

1. Sign up at `/admin/login` immediately — **the first account becomes admin**.
2. Settings → API keys: create a key for your bots (shown once).
3. Add a topic (or POST one), approve it, hit **Generate now**, watch the Jobs
   screen; the article appears on `/` when the job succeeds.
4. Crons (auto-generate + self-suggest) ship **disabled** — flip them in
   Settings → Generation once manual generations have validated costs.
5. For Discord sign-in, add `<site>/api/auth/callback/discord` to the Discord
   app's redirect URIs.

## Auth & admins

Email+password or Discord OAuth. Anyone can create an account, but the admin
panel only opens for admins: the **first account ever created** (bootstrap) and
emails on the allowlist (Settings → Admins; enforced in `src/lib/auth.ts`,
promoted at sign-in).

## Operations

- **Jobs screen** (`/admin/jobs`) is the audit trail — every queue message,
  attempt count, and error. Failed jobs are retryable; messages that exhaust
  retries also land in the `article-generation-dlq` queue for inspection.
- **Moderation** fails open (a Haiku outage stores the topic for human triage);
  generation failures retry 3× with backoff, then mark topic + job `failed`.
- **Hero image / translation failures are non-fatal**: the article publishes
  (placeholder image / primary locale only) and the job records the partial.
- **Costs**: each article ≈ 1 generation call + 1 translation call per extra
  locale (profile model, default `claude-sonnet-4-6`) + 1 Flux image; each
  bot/AI topic ≈ 1 Haiku moderation call. Tune per-profile `max_output_tokens`
  and the cron caps in Settings.

## Architecture notes

- `worker.ts` is the worker entrypoint: OpenNext `fetch` handler + `queue`
  consumer (generation pipeline) + `scheduled` handlers (both settings-gated).
- `next.config.ts` initializes Cloudflare bindings for `next dev` only — the
  init is phase-guarded so `next build` works without a wrangler login.
- Public pages render per request against D1 (no ISR); hero images stream from
  R2 via `/images/*` with immutable caching.
- Health/bindings check: `GET /api/health`.
