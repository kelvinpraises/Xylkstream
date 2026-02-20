import { Worker } from "bullmq";

import { scheduledEventsQueue } from "@/infrastructure/queue/config";
import { processScheduledEvent } from "./processor";

const worker = new Worker("scheduled-events", processScheduledEvent, {
  connection: scheduledEventsQueue.opts.connection,
  concurrency: 5, // Max 5 events processing simultaneously
});

worker.on("completed", (job) => {
  console.log(`[scheduled-events] Job ${job.id} completed successfully`);
});

worker.on("failed", (job, err) => {
  if (job) {
    console.error(`[scheduled-events] Job ${job.id} failed: ${err.message}`, job.data);
  }
});

worker.on("error", (err) => {
  console.error("[scheduled-events] Worker error:", err);
});

export { worker as scheduledEventsWorker };
