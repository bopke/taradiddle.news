/** Rows per page on admin list screens. */
export const ADMIN_PAGE_SIZE = 50;

export type PageWindow = { page: number; pageCount: number; offset: number; limit: number };

/**
 * Turns a raw `?page=` value and a row total into a clamped page window:
 * junk or out-of-range values land on the nearest valid page.
 */
export function pageWindow(raw: string | string[] | undefined, total: number): PageWindow {
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const requested = Number.parseInt(Array.isArray(raw) ? raw[0] : (raw ?? ""), 10);
  const page = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), pageCount) : 1;
  return { page, pageCount, offset: (page - 1) * ADMIN_PAGE_SIZE, limit: ADMIN_PAGE_SIZE };
}
