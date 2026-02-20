import { EventEmitter } from "events";
import type { AuditLog } from "@/infrastructure/database/schema";

/**
 * Event Emitter for Audit Log Changes
 * Broadcasts when new audit logs are created
 */
class AuditLogEmitter extends EventEmitter {
  /**
   * Emit a new audit log event
   * Only emits to stream-specific listeners (SSE connections)
   */
  emitAuditLog(auditLog: AuditLog) {
    if (auditLog.stream_id) {
      this.emit(`audit-log:${auditLog.stream_id}`, auditLog);
    }
  }

  /**
   * Subscribe to audit logs for a specific vesting stream
   */
  onStreamAuditLog(
    streamId: number,
    callback: (auditLog: AuditLog) => void,
  ): () => void {
    const eventName = `audit-log:${streamId}`;
    this.on(eventName, callback);

    return () => {
      this.off(eventName, callback);
    };
  }
}

export const auditLogEmitter = new AuditLogEmitter();
