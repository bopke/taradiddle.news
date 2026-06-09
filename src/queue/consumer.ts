import type { GenerationMessage } from "./messages";

/**
 * Queue consumer for `article-generation`. Implemented in Phase 4.
 * Throwing lets Queues retry with backoff; exhausted messages go to the DLQ.
 */
export async function handleGenerationBatch(
  batch: MessageBatch<GenerationMessage>,
  _env: CloudflareEnv,
  _ctx: ExecutionContext,
): Promise<void> {
  for (const message of batch.messages) {
    console.log("generation queue message received (consumer not implemented yet)", message.body);
    message.ack();
  }
}
