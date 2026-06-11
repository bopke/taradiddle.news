import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {};

export default async function config(phase: string): Promise<NextConfig> {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    // Makes Cloudflare bindings (DB, IMAGE_BUCKET, AI, GENERATION_QUEUE)
    // available via getCloudflareContext() during `next dev`. Must not run
    // during `next build`: the AI binding proxies to the real Workers AI
    // service, which requires a wrangler login the build environment may not
    // have.
    const { initOpenNextCloudflareForDev } = await import("@opennextjs/cloudflare");
    await initOpenNextCloudflareForDev();
  }
  return withNextIntl(nextConfig);
}
