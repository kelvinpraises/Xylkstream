import type { AuditLog, AuditLogType } from "@/infrastructure/database/schema";
import { db } from "@/infrastructure/database/turso-connection";
import { auditLogEmitter } from "@/infrastructure/events/audit-log-emitter";

/**
 * Audit Log Service
 *
 * Centralized service for all audit log operations.
 * Guarantees event emission for real-time updates.
 */
export const auditLogService = {
  /**
   * Create a new audit log entry
   * Automatically emits event for real-time updates
   */
  async createAuditLog(data: {
    accountId: number;
    streamId: number | null;
    type: AuditLogType;
    content: Record<string, any>;
    confidenceScore?: number;
    isInternal?: boolean;
  }): Promise<AuditLog> {
    const result = await db
      .insertInto("audit_logs")
      .values({
        account_id: data.accountId,
        stream_id: data.streamId,
        type: data.type,
        content: data.content,
        confidence_score: data.confidenceScore ?? null,
        is_internal: data.isInternal ?? true,
        created_at: new Date().toISOString(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Always emit event after successful insert
    auditLogEmitter.emitAuditLog(result as any);

    return result as AuditLog;
  },

  /**
   * Get audit logs for a specific vesting stream
   */
  async getAuditLogsForStream(
    streamId: number,
    includeInternal = false,
  ): Promise<AuditLog[]> {
    console.log(`[AuditLogService] Fetching logs for stream ${streamId}, includeInternal: ${includeInternal}`);
    
    let query = db
      .selectFrom("audit_logs")
      .selectAll()
      .where("stream_id", "=", streamId)
      .orderBy("created_at", "asc");

    if (!includeInternal) {
      console.log(`[AuditLogService] Adding filter: is_internal = false`);
      query = query.where("is_internal", "=", false);
    } else {
      console.log(`[AuditLogService] Including all logs (internal and public)`);
    }

    const results = (await query.execute()) as AuditLog[];
    
    console.log(`[AuditLogService] Found ${results.length} logs for stream ${streamId}`);
    
    if (results.length > 0) {
      console.log(`[AuditLogService] First 3 logs:`, results.slice(0, 3).map(log => {
        const content = log.content as any;
        return {
          id: log.id,
          type: log.type,
          is_internal: log.is_internal,
          stream_id: log.stream_id,
          content_preview: typeof content === 'string' ? content.substring(0, 50) : JSON.stringify(content || {}).substring(0, 50)
        };
      }));
    } else {
      console.log(`[AuditLogService] No logs found. Checking if ANY logs exist for this stream...`);
      
      // Check if there are ANY logs for this stream (including internal)
      const allLogs = await db
        .selectFrom("audit_logs")
        .selectAll()
        .where("stream_id", "=", streamId)
        .execute();
      
      console.log(`[AuditLogService] Total logs (including internal): ${allLogs.length}`);
      if (allLogs.length > 0) {
        console.log(`[AuditLogService] Sample of all logs:`, allLogs.slice(0, 3).map(log => ({
          id: log.id,
          type: log.type,
          is_internal: log.is_internal,
        })));
      }
    }
    
    return results;
  },

  /**
   * Get audit logs for an account
   */
  async getAuditLogsForAccount(
    accountId: number,
    options?: { limit?: number; offset?: number; includeInternal?: boolean },
  ): Promise<AuditLog[]> {
    let query = db
      .selectFrom("audit_logs")
      .selectAll()
      .where("account_id", "=", accountId)
      .orderBy("created_at", "desc");

    if (!options?.includeInternal) {
      query = query.where("is_internal", "=", false);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.offset(options.offset);
    }

    return (await query.execute()) as AuditLog[];
  },
};
