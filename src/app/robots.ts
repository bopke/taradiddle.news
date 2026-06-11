import type { MetadataRoute } from "next";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { siteOrigin } from "@/lib/public/site";

// The sitemap URL uses the runtime origin secret — render per request.
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { env } = await getCloudflareContext({ async: true });
  const origin = siteOrigin(env);
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api"] }],
    sitemap: `${origin}/sitemap.xml`,
  };
}
