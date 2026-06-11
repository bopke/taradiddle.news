import { describe, expect, it } from "vitest";
import { normalizeTitle, slugify, uniqueSlug } from "./slugs";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Local Man Achieves Inbox Zero")).toBe("local-man-achieves-inbox-zero");
  });

  it("strips Polish diacritics including ł", () => {
    expect(slugify("Żółć gęślą jaźń — później!")).toBe("zolc-gesla-jazn-pozniej");
  });

  it("collapses punctuation runs and trims hyphens", () => {
    expect(slugify("  ...what?! really -- yes...  ")).toBe("what-really-yes");
  });

  it("caps length without trailing hyphen", () => {
    const slug = slugify("a".repeat(70) + " " + "b".repeat(30));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("falls back to 'untitled' for empty input", () => {
    expect(slugify("!!!")).toBe("untitled");
  });
});

describe("uniqueSlug", () => {
  it("returns the base when free", async () => {
    expect(await uniqueSlug("free", () => false)).toBe("free");
  });

  it("suffixes -2, -3… until free", async () => {
    const taken = new Set(["dup", "dup-2"]);
    expect(await uniqueSlug("dup", (s) => taken.has(s))).toBe("dup-3");
  });
});

describe("normalizeTitle", () => {
  it("treats case, diacritics and punctuation as equal", () => {
    expect(normalizeTitle("Sejm przenosi obrady do Minecrafta!")).toBe(
      normalizeTitle("  sejm przenosi obrady do minecrafta "),
    );
  });

  it("differs for genuinely different titles", () => {
    expect(normalizeTitle("A")).not.toBe(normalizeTitle("B"));
  });
});
