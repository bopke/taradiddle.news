import { describe, expect, it } from "vitest";
import { generateArticle, type GenerationContext, type GenerationProfileInput } from "./generation";
import { mockAnthropicClient, type ParseCall } from "./test-utils";

const PROFILE: GenerationProfileInput = {
  model: "claude-sonnet-4-6",
  temperature: null,
  maxOutputTokens: 4096,
  instructions: "Keep articles between 350 and 550 words.",
};

const CTX: GenerationContext = {
  topic: { title: "Moon Declares Independence", description: "tariffs on tides" },
  categories: [
    { slug: "world", name: "World" },
    { slug: "science", name: "Science" },
  ],
  categoryAssigned: false,
  primaryLocale: "en",
};

const ARTICLE = {
  title: "Moon Declares Independence, Imposes Tariff on Tides",
  summary: "Lunar authorities cite centuries of unpaid gravitational labor.",
  meta_description: "The Moon has declared independence and will charge Earth for tides.",
  body_md: "THE SEA OF TRANQUILITY — In a stunning move...\n\n> We simply want fair compensation. Officials confirmed the development in a statement that careful readers described as suspiciously well-formatted, while independent observers continued to observe independently, as is tradition. Analysts expect further developments as soon as anything at all develops, and have pre-drafted reactions for every possible outcome including this exact sentence appearing in print. A follow-up committee has been formed to determine why a committee was necessary, with findings expected never.",
  tags: ["moon", "trade"],
  category_slug: "science",
  image_prompt: "photorealistic press conference podium on the lunar surface",
  image_alt: "A podium standing on the lunar surface",
};

describe("generateArticle", () => {
  it("returns the parsed article and sends profile params", async () => {
    const { client, createMock } = mockAnthropicClient(() => ARTICLE);
    const article = await generateArticle(client, PROFILE, CTX);

    expect(article).toEqual(ARTICLE);
    const call: ParseCall = createMock.mock.calls[0][0];
    expect(call.model).toBe("claude-sonnet-4-6");
    expect(call.max_tokens).toBe(4096);
    expect(call.system).toContain("Taradiddle.news");
    expect(call.system).toContain("---BODY---");
    expect(call.system).toContain("Keep articles between 350 and 550 words.");
    expect(call.messages[0].content).toContain("Moon Declares Independence");
  });

  it("survives straight quotes and delimiters-adjacent markdown in the body", async () => {
    const body =
      'NEW YORK — "This is fine," said a spokesperson for the Department of "Air Quotes", ' +
      'adding "no further comment" before commenting further at length. '.repeat(12);
    const { client } = mockAnthropicClient(() => ({ ...ARTICLE, body_md: body }));
    const article = await generateArticle(client, PROFILE, CTX);
    expect(article.body_md).toBe(body.trim());
  });

  it("omits temperature when the profile has none", async () => {
    const { client, createMock } = mockAnthropicClient(() => ARTICLE);
    await generateArticle(client, PROFILE, CTX);
    expect("temperature" in createMock.mock.calls[0][0]).toBe(false);
  });

  it("sends temperature when the profile sets one", async () => {
    const { client, createMock } = mockAnthropicClient(() => ARTICLE);
    await generateArticle(client, { ...PROFILE, temperature: 0.9 }, CTX);
    expect(createMock.mock.calls[0][0].temperature).toBe(0.9);
  });

  it("offers categories when unassigned and forbids picking when assigned", async () => {
    const { client, createMock } = mockAnthropicClient(() => ARTICLE);
    await generateArticle(client, PROFILE, CTX);
    expect(createMock.mock.calls[0][0].system).toContain('"science" (Science)');

    await generateArticle(client, PROFILE, { ...CTX, categoryAssigned: true, categories: [] });
    expect(createMock.mock.calls[1][0].system).toContain("already assigned");
  });

  it("throws when the response has no text", async () => {
    const { client } = mockAnthropicClient(() => null);
    await expect(generateArticle(client, PROFILE, CTX)).rejects.toThrow(/no text output/);
  });

  it("throws when the response is missing the body delimiter", async () => {
    const { client } = mockAnthropicClient(() => '{"title": "T"}');
    await expect(generateArticle(client, PROFILE, CTX)).rejects.toThrow(/missing the ---BODY---/);
  });
});

describe("generation schema guards", () => {
  it("rejects sentence-length tags", async () => {
    const { articleMetaSchema } = await import("./generation");
    const base = {
      title: "T",
      summary: "S",
      meta_description: "M",
      category_slug: null,
      image_prompt: "p",
      image_alt: "a",
    };
    expect(articleMetaSchema.safeParse({ ...base, tags: ["moon", "trade"] }).success).toBe(true);
    expect(
      articleMetaSchema.safeParse({
        ...base,
        tags: ["a full sentence that clearly is not a tag but a continuation of the article body text"],
      }).success,
    ).toBe(false);
  });
});

describe("generation truncation guard", () => {
  it("rejects a stub body", async () => {
    const { client } = mockAnthropicClient(() => ({
      ...ARTICLE,
      body_md: "NEW YORK — In a move insiders describe as brief.",
    }));
    await expect(generateArticle(client, PROFILE, CTX)).rejects.toThrow(/suspiciously short/);
  });
});
