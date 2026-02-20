import { RpcTarget } from "capnweb";

import { auditLogService } from "@/services/infra/audit-log-service";

/**
 * Log RPC Target (Internal)
 * Allows plugins to attach UI visualizations to agent logs
 */
export class LogTarget extends RpcTarget {
  async logAttachment(params: {
    accountId: number;
    streamId: number | null;
    type: "ui";
    title: string;
    summary: string | null;
    url: string;
    data: Record<string, any>;
  }): Promise<void> {
    await auditLogService.createAuditLog({
      accountId: params.accountId,
      streamId: params.streamId,
      type: "PLUGIN_UI_ATTACHMENT",
      content: {
        attachmentType: params.type,
        title: params.title,
        summary: params.summary,
        url: params.url,
        data: params.data,
      },
      isInternal: false, // Attachments are visible to users
    });
  }
}
