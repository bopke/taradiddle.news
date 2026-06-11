import { getDb } from "@/db";
import { createAnthropicClient } from "@/lib/anthropic";
import { runAutoGenerate } from "./auto-generate";
import { runSelfSuggest } from "./self-suggest";

/** Cron schedules registered in wrangler.jsonc. */
export const AUTO_GENERATE_CRON = "*/15 * * * *";
export const SELF_SUGGEST_CRON = "0 6 * * *";

export async function handleScheduled(
  controller: ScheduledController,
  env: CloudflareEnv,
  _ctx: ExecutionContext,
): Promise<void> {
  switch (controller.cron) {
    case AUTO_GENERATE_CRON:
      await runAutoGenerate({ db: getDb(env), queue: env.GENERATION_QUEUE });
      break;
    case SELF_SUGGEST_CRON:
      await runSelfSuggest({ db: getDb(env), anthropic: createAnthropicClient(env) });
      break;
    default:
      console.warn(`unknown cron schedule: ${controller.cron}`);
  }
}
