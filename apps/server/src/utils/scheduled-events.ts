import type { ScheduledEvent } from "@/types/scheduled-event";
import { scheduledEventsQueue } from "@/infrastructure/queue/config";

/**
 * Create deterministic job ID from event
 * Same event always produces same ID (prevents duplicates)
 */
export function createEventJobId(event: ScheduledEvent): string {
  return `${event.eventType}:${event.entityType}:${event.entityId}`;
}

/**
 * Extract deterministic memory context from event
 */
export function getMemoryContext(event: ScheduledEvent): {
  thread: string;
  resource: string;
} {
  return {
    thread: event.entityId.toString(),
    resource: `account-${event.metadata.accountId}`,
  };
}

/**
 * Enqueue scheduled event with deterministic job ID
 */
export async function enqueueScheduledEvent(event: ScheduledEvent): Promise<void> {
  const jobId = createEventJobId(event);
  const delay = Math.max(0, event.dueAt.getTime() - Date.now());

  await scheduledEventsQueue.add(
    event.eventType,
    event,
    {
      jobId,
      delay,
    },
  );

  console.log(
    `[scheduled-events] Enqueued ${event.eventType} for ${event.entityType}:${event.entityId} (delay: ${delay}ms)`,
  );
}
