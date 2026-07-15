import type Anthropic from "@anthropic-ai/sdk";
import { vi, type Mock } from "vitest";
import { BODY_DELIMITER } from "./ai-output";

export type ParseCall = {
  model: string;
  max_tokens: number;
  temperature?: number;
  system: string;
  messages: { role: string; content: string }[];
};

/**
 * Minimal Anthropic stand-in for unit tests. Both entry points share `impl`:
 *
 * - `messages.parse` (moderation, suggestions) resolves with whatever
 *   `impl` returns as `parsed_output`.
 * - `messages.create` (generation, translation) serializes the returned
 *   object into the delimited wire format — metadata JSON, ---BODY---,
 *   then `body_md` — so tests exercise the real response parser. Return
 *   a string to send raw text instead, or null for an empty response.
 *
 * Inspect `parseMock.mock.calls` / `createMock.mock.calls` for request params.
 */
export function mockAnthropicClient(
  impl: (params: ParseCall) => unknown | Promise<unknown>,
): { client: Anthropic; parseMock: Mock; createMock: Mock } {
  const parseMock = vi.fn(async (params: ParseCall) => {
    const parsed = await impl(params);
    return { parsed_output: parsed, stop_reason: parsed === null ? "refusal" : "end_turn" };
  });
  const createMock = vi.fn(async (params: ParseCall) => {
    const result = await impl(params);
    if (result === null) return { content: [], stop_reason: "refusal" };
    const text =
      typeof result === "string"
        ? result
        : (({ body_md, ...meta }) =>
            `${JSON.stringify(meta)}\n${BODY_DELIMITER}\n${String(body_md ?? "")}`)(
            result as Record<string, unknown>,
          );
    return { content: [{ type: "text", text }], stop_reason: "end_turn" };
  });
  return {
    client: { messages: { parse: parseMock, create: createMock } } as unknown as Anthropic,
    parseMock,
    createMock,
  };
}
