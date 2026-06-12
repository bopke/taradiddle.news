import { describe, expect, it } from "vitest";
import { translateArticle, type ArticleSource } from "./translation";
import { mockAnthropicClient } from "./test-utils";

const SOURCE: ArticleSource = {
  title: "Moon Declares Independence",
  summary: "Lunar authorities cite unpaid gravitational labor.",
  metaDescription: "The Moon declares independence.",
  bodyMd: "THE SEA OF TRANQUILITY — ...",
  imageAlt: "A podium on the lunar surface",
  tags: ["moon", "trade"],
};

const TRANSLATED = {
  title: "Księżyc ogłasza niepodległość",
  summary: "Władze lunarne wskazują na wieki nieopłaconej pracy grawitacyjnej.",
  meta_description: "Księżyc ogłosił niepodległość.",
  body_md: "MORZE SPOKOJU — ...",
  image_alt: "Mównica na powierzchni Księżyca",
  tags: ["księżyc", "handel"],
};

describe("translateArticle", () => {
  it("returns the translation with a locally derived slug", async () => {
    const { client, parseMock } = mockAnthropicClient(() => TRANSLATED);
    const result = await translateArticle(client, "claude-sonnet-4-6", {
      sourceLocale: "en",
      targetLocale: "pl",
      article: SOURCE,
    });

    expect(result.title).toBe("Księżyc ogłasza niepodległość");
    expect(result.slug).toBe("ksiezyc-oglasza-niepodleglosc");
    expect(result.tags).toEqual(["księżyc", "handel"]);

    const call = parseMock.mock.calls[0][0];
    expect(call.system).toContain('"en" to "pl"');
    expect(call.messages[0].content).toContain("Moon Declares Independence");
  });

  it("throws when no parseable output comes back", async () => {
    const { client } = mockAnthropicClient(() => null);
    await expect(
      translateArticle(client, "m", { sourceLocale: "en", targetLocale: "pl", article: SOURCE }),
    ).rejects.toThrow(/translation to pl/);
  });
});

describe("translation schema guards", () => {
  it("rejects sentence-length strings in tags (the tag-pollution failure mode)", async () => {
    const { translationSchema } = await import("./translation");
    const polluted = {
      title: "T",
      summary: "S",
      meta_description: "M",
      image_alt: null,
      tags: [
        "ok-tag",
        "te — uznajmił Fitch reporterom z kuchni, której prawa własności są w tej chwili co najmniej niejasne — całe zdanie zamiast taga",
      ],
      body_md: "B",
    };
    expect(translationSchema.safeParse(polluted).success).toBe(false);
    expect(
      translationSchema.safeParse({ ...polluted, tags: ["ok-tag", "drugi tag"] }).success,
    ).toBe(true);
  });

  it("lists tags before body_md in the schema (decoding-order guard)", async () => {
    const { translationSchema } = await import("./translation");
    const keys = Object.keys(translationSchema.shape);
    expect(keys.indexOf("tags")).toBeLessThan(keys.indexOf("body_md"));
  });
});

describe("truncation guard", () => {
  it("rejects a drastically short body (early string-close failure mode)", async () => {
    const longSource: ArticleSource = {
      ...SOURCE,
      bodyMd: "A paragraph of reasonable length for a satirical article. ".repeat(20),
    };
    const { client } = mockAnthropicClient(() => ({
      ...TRANSLATED,
      body_md: "Tylko jeden akapit.",
    }));
    await expect(
      translateArticle(client, "m", { sourceLocale: "en", targetLocale: "pl", article: longSource }),
    ).rejects.toThrow(/suspiciously short/);
  });
});
