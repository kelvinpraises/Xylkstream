import cron from "node-cron";

import { scheduledEventService } from "@/services/infra/scheduled-event-service";
import { enqueueScheduledEvent } from "@/utils/scheduled-events";

/**
 * Event Recovery Cron Job
 *
 * Runs daily at 3 AM to recover scheduled events from database state.
 * Ensures no events are lost after Redis restarts.
 */
const eventRecoveryCron = {
  async start() {
    console.log("[event-recovery-cron] Starting event recovery cron job...");

    // Schedule the job to run daily at 3 AM
    cron.schedule("0 3 * * *", async () => {
      console.log("[event-recovery-cron] Running scheduled event recovery...");
      await this.runRecovery();
    });

    // Run immediately on startup
    console.log("[event-recovery-cron] Running initial event recovery...");
    await this.runRecovery();
  },

  async runRecovery() {
    try {
      const events = [];

      // 1. Active streams needing distribution
      const activeStreams = await scheduledEventService.getActiveStreams();

      for (const stream of activeStreams) {
        events.push({
          eventType: "stream.distribution",
          entityType: "vesting_stream",
          entityId: stream.id,
          dueAt: new Date(stream.last_distribution_at || stream.start_date),
          metadata: {
            accountId: stream.account_id,
          },
          description: `Process distribution for stream "${stream.title}"`,
        });
      }

      // 2. Streams past end date needing completion
      const completableStreams = await scheduledEventService.getCompletableStreams();

      for (const stream of completableStreams) {
        events.push({
          eventType: "stream.completion",
          entityType: "vesting_stream",
          entityId: stream.id,
          dueAt: new Date(),
          metadata: {
            accountId: stream.account_id,
            reason: "end_date_reached",
          },
          description: `Complete stream "${stream.title}"`,
        });
      }

      // 3. Draft timeouts (DRAFTING for > 24 hours)
      const staleDrafts = await scheduledEventService.getStaleDrafts(24);

      for (const draft of staleDrafts) {
        events.push({
          eventType: "draft.timeout",
          entityType: "vesting_stream",
          entityId: draft.id,
          dueAt: new Date(),
          metadata: {
            accountId: draft.account_id,
          },
          description: `Clean up stale draft "${draft.title}"`,
        });
      }

      // Enqueue all events
      for (const event of events) {
        await enqueueScheduledEvent(event);
      }

      console.log(
        `[event-recovery-cron] Recovery completed: ${events.length} events re-enqueued`,
      );
    } catch (error) {
      console.error("[event-recovery-cron] Event recovery failed:", error);
    }
  },
};

export default eventRecoveryCron;
