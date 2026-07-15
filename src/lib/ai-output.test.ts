import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BODY_DELIMITER, extractText, parseDelimitedResponse } from "./ai-output";

const schema = z.object({ title: z.string() });

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
  it("splits metadata from body; quotes in the body are harmless", () => {
    const body = 'He said "sure" and then "no", twice.';
    const { meta, body: parsed } = parseDelimitedResponse(
      schema,
      `{"title": "T"}\n${BODY_DELIMITER}\n${body}\n`,
      "generation",
    );
    expect(meta.title).toBe("T");
    expect(parsed).toBe(body);
  });

  it("tolerates a ```json fence around the metadata", () => {
    const { meta } = parseDelimitedResponse(
      schema,
      '```json\n{"title": "T"}\n```\n' + `${BODY_DELIMITER}\nbody text`,
      "generation",
    );
    expect(meta.title).toBe("T");
  });

  it("splits at the first delimiter only", () => {
    const { body } = parseDelimitedResponse(
      schema,
      `{"title": "T"}\n${BODY_DELIMITER}\nan article quoting the literal ${BODY_DELIMITER} marker`,
      "generation",
    );
    expect(body).toContain(`literal ${BODY_DELIMITER} marker`);
  });

  it("throws on a missing delimiter, empty body, and invalid metadata", () => {
    expect(() => parseDelimitedResponse(schema, '{"title": "T"}', "generation")).toThrow(
      /missing the ---BODY---/,
    );
    expect(() =>
      parseDelimitedResponse(schema, `{"title": "T"}\n${BODY_DELIMITER}\n  `, "generation"),
    ).toThrow(/empty body/);
    expect(() =>
      parseDelimitedResponse(schema, `not json\n${BODY_DELIMITER}\nbody`, "generation"),
    ).toThrow(/not valid JSON/);
  });
});
