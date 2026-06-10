import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default {
  ...defineCloudflareConfig({}),
  // `npm run build` is `opennextjs-cloudflare build` (what CI runs), and the
  // OpenNext builder's default inner command is `npm run build` — which would
  // recurse. Point the inner Next.js build at next directly instead.
  buildCommand: "npx next build",
};
