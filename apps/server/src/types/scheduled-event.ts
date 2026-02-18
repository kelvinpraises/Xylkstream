/**
 * Scheduled Event Types
 * Generic event system for time-based triggers
 */

export interface ScheduledEvent {
  eventType: string; // "stream.distribution" | "stream.completion" | "yield.optimization" | "agent.scheduled"
  entityType: string; // "vesting_stream" | "vesting_account" | "user" (future)
  entityId: number; // ID of the entity
  dueAt: Date; // When to process
  metadata: {
    accountId: number; // REQUIRED - for deterministic memory context
    [key: string]: any; // Event-specific data
  };
  description?: string; // Human-readable (for debugging/agent context)
}

export interface MemoryContext {
  thread: string; // Conversation thread ID
  resource: string; // Resource owner ID
}
