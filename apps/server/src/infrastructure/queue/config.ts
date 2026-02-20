import { Queue } from "bullmq";
import Redis from "ioredis";

const connection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const scheduledEventsQueue = new Queue("scheduled-events", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

process.on("SIGINT", async () => {
  await scheduledEventsQueue.close();
  connection.quit();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await scheduledEventsQueue.close();
  connection.quit();
  process.exit(0);
});
