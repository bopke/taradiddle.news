import { describe, expect, it } from "vitest";
import { moderateTopic } from "./moderation";
import { mockAnthropicClient } from "./test-utils";

const SETTINGS = {
  moderation_enabled: true,
  moderation_model: "claude-haiku-4-5",
  moderation_prompt: "POLICY TEXT",
  default_locale: "en",
};

const allowVerdict = (overrides = {}) => ({
  allow: true,
  reason: null,
  detected_locale: "en",
  title_primary: null,
  description_primary: null,
  ...overrides,
});

describe("moderateTopic", () => {
  it("returns skipped when moderation is disabled (no API call)", async () => {
    const { client, parseMock } = mockAnthropicClient(() => allowVerdict());
    const result = await moderateTopic(
      client,
      { ...SETTINGS, moderation_enabled: false },
      { title: "T" },
    );
    expect(result).toEqual({ kind: "skipped" });
    expect(parseMock).not.toHaveBeenCalled();
  });

  it("passes an allowed primary-locale topic through unchanged", async () => {
    const { client, parseMock } = mockAnthropicClient(() => allowVerdict());
    const result = await moderateTopic(client, SETTINGS, {
      title: "Moon Declares Independence",
      description: "angle: trade tariffs on tides",
    });

    expect(result).toEqual({
      kind: "allowed",
      detectedLocale: "en",
      title: "Moon Declares Independence",
      description: "angle: trade tariffs on tides",
      original: null,
    });
    const call = parseMock.mock.calls[0][0];
    expect(call.model).toBe("claude-haiku-4-5");
    expect(call.system).toContain("POLICY TEXT");
    expect(call.system).toContain('"en"');
  });

  it("normalizes a secondary-language topic and keeps the original", async () => {
    const { client } = mockAnthropicClient(() =>
      allowVerdict({
        detected_locale: "pl",
        title_primary: "Sejm Moves Sessions to Minecraft",
        description_primary: "servers crash daily",
      }),
    );
    const result = await moderateTopic(client, SETTINGS, {
      title: "Sejm przenosi obrady do Minecrafta",
      description: "serwery padają codziennie",
    });

    expect(result).toEqual({
      kind: "allowed",
      detectedLocale: "pl",
      title: "Sejm Moves Sessions to Minecraft",
      description: "servers crash daily",
      original: {
        title: "Sejm przenosi obrady do Minecrafta",
        description: "serwery padają codziennie",
        locale: "pl",
      },
    });
  });

  it("flags with the model's reason", async () => {
    const { client } = mockAnthropicClient(() => ({
      allow: false,
      reason: "Targets a real ongoing tragedy.",
      detected_locale: "en",
      title_primary: null,
      description_primary: null,
    }));
    const result = await moderateTopic(client, SETTINGS, { title: "X" });
    expect(result).toEqual({ kind: "flagged", reason: "Targets a real ongoing tragedy." });
  });

  it("supplies a fallback reason when the model returns none", async () => {
    const { client } = mockAnthropicClient(() => ({
      allow: false,
      reason: null,
      detected_locale: "en",
      title_primary: null,
      description_primary: null,
    }));
    const result = await moderateTopic(client, SETTINGS, { title: "X" });
    expect(result).toEqual({ kind: "flagged", reason: "Rejected by moderation." });
  });

  it("fails open on API errors", async () => {
    const { client } = mockAnthropicClient(() => {
      throw new Error("529 overloaded");
    });
    const result = await moderateTopic(client, SETTINGS, { title: "X" });
    expect(result).toEqual({ kind: "skipped" });
  });

  it("fails open when the output is unparseable (refusal)", async () => {
    const { client } = mockAnthropicClient(() => null);
    const result = await moderateTopic(client, SETTINGS, { title: "X" });
    expect(result).toEqual({ kind: "skipped" });
  });
});
