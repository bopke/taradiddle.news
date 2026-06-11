import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { SettingsShape } from "@/db/defaults";

/**
 * One cheap call does double duty: moderation verdict + language detection
 * with translation to the primary locale (see spec § Topic Moderation).
 *
 * All fields are required-but-nullable rather than optional — structured
 * outputs reject `additionalProperties` tricks and behave most reliably with
 * a fixed key set.
 */
const verdictSchema = z.object({
  allow: z.boolean(),
  reason: z.string().nullable(),
  detected_locale: z.string(),
  title_primary: z.string().nullable(),
  description_primary: z.string().nullable(),
});

export type TopicInput = {
  title: string;
  description?: string | null;
};

export type ModerationResult =
  /**
   * Topic passed. Normalization is best-effort, not guaranteed: title and
   * description are translated to the primary locale only when the model
   * supplied a translation (detected_locale !== default_locale AND
   * title_primary !== null) — then `original` holds the submitted text and its
   * locale. If the model detected a foreign language but returned
   * title_primary === null, the original foreign-language content is kept
   * as-is and `original` stays null, so `detectedLocale` may differ from the
   * primary locale while the content remains untranslated. (Generation copes:
   * it always writes in the primary locale regardless of topic language.)
   */
  | {
      kind: "allowed";
      detectedLocale: string;
      title: string;
      description: string | null;
      original: { title: string; description: string | null; locale: string } | null;
    }
  /** Topic rejected; reason comes verbatim from the model. */
  | { kind: "flagged"; reason: string }
  /** Moderation disabled, or the call failed (fail-open: admins still gate). */
  | { kind: "skipped" };

const RESPONSE_INSTRUCTIONS = `
Respond with a JSON object:
- "allow": whether the topic is acceptable per the policy above.
- "reason": when rejecting, one actionable sentence; null when allowing.
- "detected_locale": BCP-47 language code of the submission (e.g. "en", "pl").
- "title_primary" / "description_primary": when the submission is NOT in {PRIMARY} and you allow it, the title/description translated into {PRIMARY}; null otherwise (and null when the corresponding field was not provided).`;

export async function moderateTopic(
  client: Anthropic,
  settings: Pick<
    SettingsShape,
    "moderation_enabled" | "moderation_model" | "moderation_prompt" | "default_locale"
  >,
  input: TopicInput,
): Promise<ModerationResult> {
  if (!settings.moderation_enabled) return { kind: "skipped" };

  try {
    const message = await client.messages.parse({
      model: settings.moderation_model,
      max_tokens: 1024,
      system:
        settings.moderation_prompt +
        RESPONSE_INSTRUCTIONS.replaceAll("{PRIMARY}", settings.default_locale),
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            title: input.title,
            description: input.description ?? null,
          }),
        },
      ],
      output_config: { format: zodOutputFormat(verdictSchema) },
    });

    const verdict = message.parsed_output;
    if (!verdict) return { kind: "skipped" }; // refusal / truncation → fail open

    if (!verdict.allow) {
      return { kind: "flagged", reason: verdict.reason ?? "Rejected by moderation." };
    }

    const isForeign =
      verdict.detected_locale !== settings.default_locale && verdict.title_primary !== null;
    return {
      kind: "allowed",
      detectedLocale: verdict.detected_locale,
      title: isForeign ? verdict.title_primary! : input.title,
      description: isForeign
        ? verdict.description_primary
        : (input.description ?? null),
      original: isForeign
        ? {
            title: input.title,
            description: input.description ?? null,
            locale: verdict.detected_locale,
          }
        : null,
    };
  } catch (error) {
    console.warn("moderation call failed — failing open", error);
    return { kind: "skipped" };
  }
}
