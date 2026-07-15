import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  BODY_DELIMITER,
  extractText,
  parseDelimitedResponse,
  serializeFields,
} from "./ai-output";

const schema = z.object({
  title: z.string().min(1),
  image_alt: z.string().nullable(),
  tags: z.array(z.string().min(1)).max(10),
});

const asMessage = (text: string, stop_reason = "end_turn") =>
  ({ content: [{ type: "text", text }], stop_reason }) as never;

describe("extractText", () => {
  it("concatenates text blocks", () => {
    expect(extractText(asMessage("hello"), "generation")).toBe("hello");
  });

  it("fails loudly on max_tokens (a cut would silently shorten the body)", () => {
    expect(() => extractText(asMessage("partial...", "max_tokens"), "generation")).toThrow(
      /max_tokens/,
    );
  });

  it("fails loudly on an empty response, naming the caller", () => {
    expect(() => extractText({ content: [], stop_reason: "refusal" } as never, "translation to pl"))
      .toThrow(/translation to pl.*no text output.*refusal/);
  });
});

describe("parseDelimitedResponse", () => {
  it("parses key: value lines — quotes anywhere are harmless", () => {
    const { meta, body } = parseDelimitedResponse(
      schema,
      `title: Konsultant twierdzi, że firma powinna „robić to" lepiej
image_alt: A "consultant" gesturing
tags: konsultant | prezentacja
${BODY_DELIMITER}
He said "sure" and then "no", twice.`,
      "translation to pl",
    );
    expect(meta.title).toBe('Konsultant twierdzi, że firma powinna „robić to" lepiej');
    expect(meta.image_alt).toBe('A "consultant" gesturing');
    expect(meta.tags).toEqual(["konsultant", "prezentacja"]);
    expect(body).toBe('He said "sure" and then "no", twice.');
  });

  it("treats empty and literal-null values as null, and skips fence lines", () => {
    const { meta } = parseDelimitedResponse(
      schema,
      `\`\`\`
title: T
image_alt: null
tags: a | b
\`\`\`
${BODY_DELIMITER}
body`,
      "generation",
    );
    expect(meta.image_alt).toBeNull();
  });

  it("folds a wrapped line into the previous field, ignores unknown keys and preamble", () => {
    const { meta } = parseDelimitedResponse(
      schema,
      `Here is the article:
title: A headline that the model
wrapped onto a second line
note: unknown keys are not fields
image_alt: null
tags: a
${BODY_DELIMITER}
body`,
      "generation",
    );
    expect(meta.title).toBe(
      "A headline that the model wrapped onto a second line note: unknown keys are not fields",
    );
  });

  it("splits at the first delimiter only", () => {
    const { body } = parseDelimitedResponse(
      schema,
      `title: T\nimage_alt: null\ntags: a\n${BODY_DELIMITER}\nan article quoting the literal ${BODY_DELIMITER} marker`,
      "generation",
    );
    expect(body).toContain(`literal ${BODY_DELIMITER} marker`);
  });

  it("throws on a missing delimiter, empty body, and missing fields", () => {
    expect(() => parseDelimitedResponse(schema, "title: T", "generation")).toThrow(
      /missing the ---BODY---/,
    );
    expect(() =>
      parseDelimitedResponse(schema, `title: T\ntags: a\n${BODY_DELIMITER}\n  `, "generation"),
    ).toThrow(/empty body/);
    expect(() =>
      parseDelimitedResponse(schema, `tags: a\nimage_alt: x\n${BODY_DELIMITER}\nbody`, "generation"),
    ).toThrow(/failed validation.*title/);
  });
});

describe("serializeFields", () => {
  it("round-trips through the parser", () => {
    const text = `${serializeFields({ title: "T", image_alt: null, tags: ["a", "b"] })}\n${BODY_DELIMITER}\nbody`;
    const { meta } = parseDelimitedResponse(schema, text, "test");
    expect(meta).toEqual({ title: "T", image_alt: null, tags: ["a", "b"] });
  });
});
