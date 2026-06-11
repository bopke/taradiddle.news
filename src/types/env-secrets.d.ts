/**
 * Secrets that exist on the deployed Worker (`wrangler secret put`) but are
 * absent from .dev.vars — `wrangler types` only generates what it can see
 * locally, so these are declared here and merge into CloudflareEnv.
 */
interface CloudflareEnv {
  /** Public site origin (e.g. https://taradiddle.news). Unset in local dev. */
  BETTER_AUTH_URL?: string;
}
