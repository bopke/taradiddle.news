/**
 * Detects SQLite/D1 unique-constraint violations so racy writes can be turned
 * into friendly ActionResults instead of 500s. Optionally narrowed to a
 * specific table/column fragment of the constraint message, e.g.
 * "article_translations" or "topics.normalized_title".
 */
export function isUniqueViolation(error: unknown, fragment?: string): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (!/UNIQUE constraint failed/i.test(message)) return false;
  return fragment ? message.includes(fragment) : true;
}
