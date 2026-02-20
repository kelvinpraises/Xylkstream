import { Job } from "bullmq";

import { neuralAgent } from "@/interfaces/neural";
import type { ScheduledEvent } from "@/types/scheduled-event";

/**
 * Scheduled Events Processor
 * Routes events to appropriate handlers
 */
export async function processScheduledEvent(job: Job<ScheduledEvent>) {
  const event: ScheduledEvent = job.data;

  console.log(
    `[scheduled-events] Processing: ${event.eventType} for ${event.entityType}:${event.entityId}`,
  );
  await job.log(`Event: ${event.description || event.eventType}`);

  try {
    // Route to appropriate handler
    switch (event.eventType) {
      case "stream.distribution":
        await job.updateProgress(25);
        await neuralAgent.processDistribution(event.entityId);
        await job.updateProgress(100);
        break;

      case "stream.completion":
        await job.updateProgress(50);
        await neuralAgent.completeStream(event.entityId);
        await job.updateProgress(100);
        break;

      case "yield.optimization":
        await job.updateProgress(25);
        await neuralAgent.optimizeYield(event.metadata.accountId);
        await job.updateProgress(100);
        break;

      case "draft.timeout":
        await job.updateProgress(50);
        await neuralAgent.cancelDraft(event.entityId);
        await job.updateProgress(100);
        break;

      case "agent.scheduled":
        await job.updateProgress(25);
        await neuralAgent.resumeAgentTask(event);
        await job.updateProgress(100);
        break;

      default:
        console.warn(`[scheduled-events] Unknown event type: ${event.eventType}`);
        await job.log(`Unknown event type: ${event.eventType}`);
    }

    console.log(
      `[scheduled-events] Successfully processed ${event.eventType} for ${event.entityType}:${event.entityId}`,
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[scheduled-events] Failed to process ${event.eventType}:`,
      errorMessage,
    );
    await job.log(`Processing failed: ${errorMessage}`);
    throw error;
  }
}
