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
`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`,
`DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`.

Then:

```sh
npm run deploy
```

## Architecture notes

- `worker.ts` is the worker entrypoint: it wraps the OpenNext-generated `fetch`
  handler and adds the `queue` consumer (article generation pipeline) and
  `scheduled` handlers (auto-generate + AI topic self-suggestion crons).
- `next.config.ts` initializes Cloudflare bindings for `next dev` only — the
  init is phase-guarded so `next build` works without a wrangler login.
- Health/bindings check: `GET /api/health`.
