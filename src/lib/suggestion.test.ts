import { describe, expect, it } from "vitest";
import { suggestTopics } from "./suggestion";
import { mockAnthropicClient } from "./test-utils";

describe("suggestTopics", () => {
  it("returns suggestions and steers with count, hints and recent titles", async () => {
    const topics = [
      { title: "Area Printer Achieves Sentience, Still Jams", description: null },
      { title: "Nation's Plants Unionize", description: "demands: more sun" },
    ];
    const { client, parseMock } = mockAnthropicClient(() => ({ topics }));

    const result = await suggestTopics(client, {
      model: "claude-sonnet-4-6",
      count: 2,
      hints: "more tech satire",
      recentTitles: ["Moon Declares Independence"],
      primaryLocale: "en",
    });

    expect(result).toEqual(topics);
    const call = parseMock.mock.calls[0][0];
    expect(call.model).toBe("claude-sonnet-4-6");
    expect(call.system).toContain("exactly 2");
    expect(call.system).toContain("more tech satire");
    expect(call.messages[0].content).toContain("Moon Declares Independence");
  });

  it("omits the steering section without hints", async () => {
    const { client, parseMock } = mockAnthropicClient(() => ({ topics: [] }));
    await suggestTopics(client, {
      model: "m",
      count: 5,
      hints: "",
      recentTitles: [],
      primaryLocale: "en",
    });
    expect(parseMock.mock.calls[0][0].system).not.toContain("Editorial steering");
  });

  it("throws when no parseable output comes back", async () => {
    const { client } = mockAnthropicClient(() => null);
    await expect(
      suggestTopics(client, { model: "m", count: 1, hints: "", recentTitles: [], primaryLocale: "en" }),
    ).rejects.toThrow(/self-suggestion/);
  });
});
