import type {
  Notification,
  NotificationSeverity,
  NotificationType,
} from "@/infrastructure/database/schema";
import { db } from "@/infrastructure/database/turso-connection";

/**
 * Notification Service
 *
 * Centralized service for user notification operations.
 */
export const notificationService = {
  /**
   * Create a new notification
   */
  async createNotification(data: {
    accountId: number;
    type: NotificationType;
    message: string;
    severity: NotificationSeverity;
    metadata?: Record<string, any>;
  }): Promise<Notification> {
    const notification = await db
      .insertInto("notifications")
      .values({
        account_id: data.accountId,
        type: data.type,
        message: data.message,
        severity: data.severity,
        is_read: false,
        metadata: (data.metadata || {}) as any,
        created_at: new Date().toISOString(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return notification as Notification;
  },

  /**
   * Get notifications for an account
   */
  async getNotifications(
    accountId: number,
    options?: { unreadOnly?: boolean; limit?: number },
  ): Promise<Notification[]> {
    let query = db
      .selectFrom("notifications")
      .selectAll()
      .where("account_id", "=", accountId)
      .orderBy("created_at", "desc");

    if (options?.unreadOnly) {
      query = query.where("is_read", "=", false);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    return (await query.execute()) as Notification[];
  },

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: number, accountId: number): Promise<void> {
    await db
      .updateTable("notifications")
      .set({ is_read: true })
      .where("id", "=", notificationId)
      .where("account_id", "=", accountId)
      .execute();
  },

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: number, accountId: number): Promise<void> {
    await db
      .deleteFrom("notifications")
      .where("id", "=", notificationId)
      .where("account_id", "=", accountId)
      .execute();
  },

  /**
   * Mark all notifications as read for an account
   */
  async markAllAsRead(accountId: number): Promise<void> {
    await db
      .updateTable("notifications")
      .set({ is_read: true })
      .where("account_id", "=", accountId)
      .where("is_read", "=", false)
      .execute();
  },
};
