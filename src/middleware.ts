import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

/**
 * Locale detection/redirects for the public site only.
 *
 * Deliberately uses the deprecated `middleware` convention, NOT Next 16's
 * `proxy.ts`: proxy compiles for the Node.js runtime, which the OpenNext
 * Cloudflare adapter doesn't support ("Node.js middleware is not currently
 * supported" at deploy). Ignore the build's deprecation warning until
 * OpenNext supports the proxy convention, then rename this file back.
 */
export default createMiddleware(routing);

export const config = {
  // Everything except: admin panel, API routes, Next internals, static files.
  matcher: ["/((?!admin|api|_next|.*\\..*).*)"],
};
