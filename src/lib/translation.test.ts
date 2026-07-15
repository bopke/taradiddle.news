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
    const { client, createMock } = mockAnthropicClient(() => TRANSLATED);
    const result = await translateArticle(client, "claude-sonnet-4-6", {
      sourceLocale: "en",
      targetLocale: "pl",
      article: SOURCE,
    });

    expect(result.title).toBe("Księżyc ogłasza niepodległość");
    expect(result.slug).toBe("ksiezyc-oglasza-niepodleglosc");
    expect(result.tags).toEqual(["księżyc", "handel"]);

    const call = createMock.mock.calls[0][0];
    expect(call.system).toContain('"en" to "pl"');
    expect(call.system).toContain("---BODY---");
    expect(call.messages[0].content).toContain("Moon Declares Independence");
    expect(call.messages[0].content).toContain("---BODY---\nTHE SEA OF TRANQUILITY");
  });

  it("survives straight quotes in the translated body", async () => {
    const body =
      'WARSZAWA — "Wszystko w porządku" — zapewnił rzecznik, cytując "ekspertów" oraz "dane". '.repeat(3);
    const { client } = mockAnthropicClient(() => ({ ...TRANSLATED, body_md: body }));
    const result = await translateArticle(client, "m", {
      sourceLocale: "en",
      targetLocale: "pl",
      article: SOURCE,
    });
    expect(result.body_md).toBe(body.trim());
  });

  it("throws when no text output comes back", async () => {
    const { client } = mockAnthropicClient(() => null);
    await expect(
      translateArticle(client, "m", { sourceLocale: "en", targetLocale: "pl", article: SOURCE }),
    ).rejects.toThrow(/translation to pl/);
  });

  it("throws when the response is missing the body delimiter", async () => {
    const { client } = mockAnthropicClient(() => '{"title": "T"}');
    await expect(
      translateArticle(client, "m", { sourceLocale: "en", targetLocale: "pl", article: SOURCE }),
    ).rejects.toThrow(/missing the ---BODY---/);
  });
});

describe("translation schema guards", () => {
  it("rejects sentence-length strings in tags (the tag-pollution failure mode)", async () => {
    const { translationMetaSchema } = await import("./translation");
    const polluted = {
      title: "T",
      summary: "S",
      meta_description: "M",
      image_alt: null,
      tags: [
        "ok-tag",
        "te — uznajmił Fitch reporterom z kuchni, której prawa własności są w tej chwili co najmniej niejasne — całe zdanie zamiast taga",
      ],
    };
    expect(translationMetaSchema.safeParse(polluted).success).toBe(false);
    expect(
      translationMetaSchema.safeParse({ ...polluted, tags: ["ok-tag", "drugi tag"] }).success,
    ).toBe(true);
  });
});

describe("truncation guard", () => {
  it("rejects a drastically short body (stub-translation failure mode)", async () => {
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
