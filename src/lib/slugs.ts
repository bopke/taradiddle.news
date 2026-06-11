/**
 * Slug and title-normalization helpers. Locale-aware enough for en+pl:
 * NFD decomposition strips most diacritics; the Polish ł/Ł doesn't decompose,
 * so it's mapped explicitly.
 */

const CHAR_MAP: Record<string, string> = { ł: "l", Ł: "l" };

function stripDiacritics(text: string): string {
  return text
    .replace(/[łŁ]/g, (c) => CHAR_MAP[c])
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function slugify(text: string): string {
  const slug = stripDiacritics(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return slug || "untitled";
}

/**
 * Appends -2, -3… until `isTaken` says the slug is free. `isTaken` is async so
 * callers can check the database.
 */
export async function uniqueSlug(
  base: string,
  isTaken: (slug: string) => Promise<boolean> | boolean,
): Promise<string> {
  if (!(await isTaken(base))) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!(await isTaken(candidate))) return candidate;
  }
}

/**
 * Normalization for near-duplicate topic detection: case-, diacritic-,
 * punctuation- and whitespace-insensitive.
 */
export function normalizeTitle(title: string): string {
  return stripDiacritics(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
