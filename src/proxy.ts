import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

/** Locale detection/redirects for the public site only (Next 16 "proxy",
 * formerly the middleware convention — same execution model, new name). */
export default createMiddleware(routing);

export const config = {
  // Everything except: admin panel, API routes, Next internals, static files.
  matcher: ["/((?!admin|api|_next|.*\\..*).*)"],
};
