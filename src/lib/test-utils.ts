import type Anthropic from "@anthropic-ai/sdk";
import { vi, type Mock } from "vitest";

export type ParseCall = {
  model: string;
  max_tokens: number;
  temperature?: number;
  system: string;
  messages: { role: string; content: string }[];
};

/**
 * Minimal Anthropic stand-in for unit tests: `messages.parse` resolves with
 * whatever `parsed_output` you queue (or throws). Inspect `parseMock.mock.calls`
 * for the exact request params.
 */
export function mockAnthropicClient(
  impl: (params: ParseCall) => unknown | Promise<unknown>,
): { client: Anthropic; parseMock: Mock } {
  const parseMock = vi.fn(async (params: ParseCall) => {
    const parsed = await impl(params);
    return { parsed_output: parsed, stop_reason: parsed === null ? "refusal" : "end_turn" };
  });
  return {
    client: { messages: { parse: parseMock } } as unknown as Anthropic,
    parseMock,
  };
}
