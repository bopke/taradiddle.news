/** Cron schedules registered in wrangler.jsonc. */
export const AUTO_GENERATE_CRON = "*/15 * * * *";
export const SELF_SUGGEST_CRON = "0 6 * * *";

/**
 * Scheduled handler. Implemented in Phase 6:
 * - every 15 min: enqueue due approved topics (settings-gated)
 * - daily: AI topic self-suggestion (settings-gated)
 */
export async function handleScheduled(
  controller: ScheduledController,
  _env: CloudflareEnv,
  _ctx: ExecutionContext,
): Promise<void> {
  switch (controller.cron) {
    case AUTO_GENERATE_CRON:
      console.log("auto-generate cron tick (not implemented yet)");
      break;
    case SELF_SUGGEST_CRON:
      console.log("self-suggest cron tick (not implemented yet)");
      break;
    default:
      console.warn(`unknown cron schedule: ${controller.cron}`);
  }
}
