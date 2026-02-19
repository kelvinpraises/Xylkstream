import type { VestingStream, VestingAccount } from "@/infrastructure/database/schema";
import { db } from "@/infrastructure/database/turso-connection";

/**
 * Scheduled Event Service
 *
 * Provides queries for scheduled event recovery and cron jobs.
 */
export const scheduledEventService = {
  /**
   * Get all active vesting streams (for distribution events)
   */
  async getActiveStreams(): Promise<VestingStream[]> {
    return (await db
      .selectFrom("vesting_streams")
      .where("status", "=", "ACTIVE")
      .selectAll()
      .execute()) as VestingStream[];
  },

  /**
   * Get streams that need distribution
   */
  async getStreamsDueForDistribution(): Promise<VestingStream[]> {
    const now = new Date();

    return (await db
      .selectFrom("vesting_streams")
      .where("status", "=", "ACTIVE")
      .where((eb) =>
        eb.or([
          eb("last_distribution_at", "is", null),
          eb("last_distribution_at", "<", now),
        ]),
      )
      .where("end_date", ">", now)
      .selectAll()
      .execute()) as VestingStream[];
  },

  /**
   * Get streams past end date that need completion
   */
  async getCompletableStreams(): Promise<VestingStream[]> {
    const now = new Date();

    return (await db
      .selectFrom("vesting_streams")
      .where("end_date", "<", now)
      .where("status", "in", ["ACTIVE", "PAUSED"])
      .selectAll()
      .execute()) as VestingStream[];
  },

  /**
   * Get stale drafts (DRAFTING for more than X hours)
   */
  async getStaleDrafts(hoursOld: number): Promise<VestingStream[]> {
    const cutoffTime = new Date(Date.now() - hoursOld * 60 * 60 * 1000);

    return (await db
      .selectFrom("vesting_streams")
      .where("status", "=", "DRAFTING")
      .where("created_at", "<", cutoffTime)
      .selectAll()
      .execute()) as VestingStream[];
  },

  /**
   * Get all vesting accounts (for yield optimization)
   */
  async getAllAccounts(): Promise<VestingAccount[]> {
    return (await db
      .selectFrom("vesting_accounts")
      .selectAll()
      .execute()) as VestingAccount[];
  },
};
