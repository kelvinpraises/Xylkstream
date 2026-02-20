import { RpcTarget } from "capnweb";

import {
  AgxManifest,
  AuditLogType,
  VestingStreamStatus,
  NotificationSeverity,
  NotificationType,
  AccountPolicy,
} from "@/infrastructure/database/schema";
import { neuralAgent } from "@/interfaces/neural";
import { auditLogService } from "@/services/infra/audit-log-service";
import { streamService } from "@/services/streams/stream-service";
import { accountService } from "@/services/identity/account-service";
import { notificationService } from "@/services/infra/notification-service";
import { pluginRegistryService } from "@/services/plugins/plugin-registry-service";

/**
 * AuthenticatedSession RPC Target
 * Capability-based security - possession of this object proves authentication
 * All methods are scoped to the authenticated user
 */
export class AuthenticatedSession extends RpcTarget {
  constructor(
    private userId: number,
    private accountId: number,
  ) {
    super();
  }

  // ===== Account Methods =====

  async getAccount(): Promise<{
    id: number;
    walletAddress: string;
    policy: AccountPolicy;
    walletBalances: Record<string, string>;
  }> {
    const account = await accountService.getAccount(this.accountId);

    const policy =
      typeof account.policy_json === "string"
        ? JSON.parse(account.policy_json)
        : account.policy_json;

    const walletBalances =
      typeof account.wallet_balances === "string"
        ? JSON.parse(account.wallet_balances)
        : account.wallet_balances;

    return {
      id: account.id,
      walletAddress: account.wallet_address,
      policy: policy as AccountPolicy,
      walletBalances: walletBalances as Record<string, string>,
    };
  }

  async updatePolicy(params: { policy: AccountPolicy }): Promise<{ success: boolean }> {
    await accountService.updatePolicy(this.accountId, params.policy);
    return { success: true };
  }

  async getWalletBalances(): Promise<Record<string, string>> {
    const account = await accountService.getAccount(this.accountId);
    return account.wallet_balances as Record<string, string>;
  }

  // ===== Vesting Stream Methods =====

  async listStreams(params?: {
    status?: VestingStreamStatus;
    limit?: number;
    offset?: number;
  }): Promise<
    Array<{
      id: number;
      status: VestingStreamStatus;
      recipientAddress: string;
      title: string;
      description: string;
      totalAmount: number;
      amountPerPeriod: number;
      periodDuration: number;
      assetId: string;
      startDate: string;
      endDate: string;
      totalDistributed: number;
      yieldEarned: number;
      createdAt: string;
    }>
  > {
    const streams = await streamService.listStreamsForAccount(this.accountId, params);

    return streams.map((s) => ({
      id: s.id,
      status: s.status,
      recipientAddress: s.recipient_address,
      title: s.title,
      description: s.description,
      totalAmount: s.total_amount,
      amountPerPeriod: s.amount_per_period,
      periodDuration: s.period_duration,
      assetId: s.asset_id,
      startDate: s.start_date instanceof Date ? s.start_date.toISOString() : s.start_date,
      endDate: s.end_date instanceof Date ? s.end_date.toISOString() : s.end_date,
      totalDistributed: s.total_distributed,
      yieldEarned: s.yield_earned,
      createdAt: s.created_at instanceof Date ? s.created_at.toISOString() : s.created_at,
    }));
  }

  async getStreamDetails(params: { streamId: number }): Promise<{
    id: number;
    accountId: number;
    status: VestingStreamStatus;
    recipientAddress: string;
    title: string;
    description: string;
    totalAmount: number;
    amountPerPeriod: number;
    periodDuration: number;
    assetId: string;
    startDate: string;
    endDate: string;
    lastDistributionAt: string | null;
    totalDistributed: number;
    yieldEarned: number;
    createdAt: string;
    completedAt: string | null;
  }> {
    console.log("[RPC] getStreamDetails called with:", params);

    const stream = await streamService.getStream(params.streamId);
    console.log("[RPC] Found stream:", stream);

    // Verify ownership
    if (stream.account_id !== this.accountId) {
      console.error(
        `[RPC] Ownership mismatch: stream.account_id=${stream.account_id}, this.accountId=${this.accountId}`,
      );
      throw new Error("Unauthorized: Stream does not belong to this account");
    }

    return {
      id: stream.id,
      accountId: stream.account_id,
      status: stream.status,
      recipientAddress: stream.recipient_address,
      title: stream.title,
      description: stream.description,
      totalAmount: stream.total_amount,
      amountPerPeriod: stream.amount_per_period,
      periodDuration: stream.period_duration,
      assetId: stream.asset_id,
      startDate:
        stream.start_date instanceof Date
          ? stream.start_date.toISOString()
          : stream.start_date,
      endDate:
        stream.end_date instanceof Date ? stream.end_date.toISOString() : stream.end_date,
      lastDistributionAt: stream.last_distribution_at
        ? stream.last_distribution_at instanceof Date
          ? stream.last_distribution_at.toISOString()
          : stream.last_distribution_at
        : null,
      totalDistributed: stream.total_distributed,
      yieldEarned: stream.yield_earned,
      createdAt:
        stream.created_at instanceof Date
          ? stream.created_at.toISOString()
          : stream.created_at,
      completedAt: stream.completed_at
        ? stream.completed_at instanceof Date
          ? stream.completed_at.toISOString()
          : stream.completed_at
        : null,
    };
  }

  async cancelStream(params: { streamId: number }): Promise<{ success: boolean }> {
    await streamService.transitionStatus(params.streamId, "CANCELLED");
    return { success: true };
  }

  async pauseStream(params: { streamId: number }): Promise<{ success: boolean }> {
    await streamService.transitionStatus(params.streamId, "PAUSED");
    return { success: true };
  }

  async resumeStream(params: { streamId: number }): Promise<{ success: boolean }> {
    await streamService.transitionStatus(params.streamId, "ACTIVE");
    return { success: true };
  }

  async requestStreamCreation(params: { prompt: string }): Promise<{ streamId: number }> {
    console.log("[RPC] requestStreamCreation called for account:", this.accountId);
    console.log("[RPC] Prompt:", params.prompt);

    // Create stream with user prompt
    const streamId = await neuralAgent.createStreamFromNaturalLanguage(
      this.accountId,
      params.prompt,
    );

    console.log("[RPC] Stream created with ID:", streamId);

    if (streamId <= 0) {
      throw new Error(
        "Failed to create stream - check budget limits or policy configuration",
      );
    }

    return { streamId };
  }

  async createStream(params: {
    recipientAddress: string;
    amount: number;
    asset: string;
    startDate: string;
    endDate: string;
    cliffDate?: string;
  }): Promise<{ streamId: number }> {
    // Check budget limits
    const canCreate = await streamService.canCreateStream(this.accountId, params.amount);
    if (!canCreate) {
      throw new Error("Stream amount exceeds your budget limits");
    }

    // Calculate period duration (simplified: monthly)
    const start = new Date(params.startDate);
    const end = new Date(params.endDate);
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const periodDuration = 86400 * 30; // 30 days in seconds
    const amountPerPeriod = params.amount / Math.ceil(totalDays / 30);

    // Create stream
    const streamId = await streamService.createDraft(this.accountId, {
      recipient_address: params.recipientAddress,
      title: `Stream to ${params.recipientAddress.slice(0, 6)}...${params.recipientAddress.slice(-4)}`,
      description: "Direct stream creation",
      total_amount: params.amount,
      amount_per_period: amountPerPeriod,
      period_duration: periodDuration,
      asset_id: params.asset,
      start_date: start,
      end_date: end,
    });

    // Transition to ACTIVE
    await streamService.transitionStatus(streamId, "ACTIVE");

    // Create audit log
    await auditLogService.createAuditLog({
      accountId: this.accountId,
      streamId,
      type: "STREAM_CREATED",
      content: {
        message: `Stream created to ${params.recipientAddress}`,
        amount: params.amount,
        asset: params.asset,
      },
      isInternal: false,
    });

    return { streamId };
  }

  // ===== Audit Methods =====

  async getAuditLogs(params: { streamId: number; includeInternal?: boolean }): Promise<
    Array<{
      id: number;
      type: AuditLogType;
      content: Record<string, any>;
      confidenceScore: number | null;
      isInternal: boolean;
      createdAt: string;
    }>
  > {
    console.log(
      `[RPC getAuditLogs] streamId: ${params.streamId}, includeInternal: ${params.includeInternal}`,
    );

    const logs = await auditLogService.getAuditLogsForStream(
      params.streamId,
      params.includeInternal ?? false,
    );

    console.log(`[RPC getAuditLogs] Retrieved ${logs.length} logs from service`);

    return logs.map((log) => {
      const content =
        typeof log.content === "string" ? JSON.parse(log.content) : log.content;

      const createdAt =
        typeof log.created_at === "string" ? log.created_at : log.created_at.toISOString();

      return {
        id: log.id,
        type: log.type,
        content: content as Record<string, any>,
        confidenceScore: log.confidence_score,
        isInternal: log.is_internal,
        createdAt,
      };
    });
  }

  async addUserFeedback(params: {
    streamId: number;
    feedback: string;
  }): Promise<{ success: boolean }> {
    await neuralAgent.handleUserFeedback(params.streamId, this.accountId, params.feedback);

    return { success: true };
  }

  // ===== Notification Methods =====

  async getNotifications(params?: { unreadOnly?: boolean; limit?: number }): Promise<
    Array<{
      id: number;
      type: NotificationType;
      message: string;
      severity: NotificationSeverity;
      isRead: boolean;
      metadata: Record<string, any>;
      createdAt: string;
    }>
  > {
    const notifications = await notificationService.getNotifications(
      this.accountId,
      params,
    );

    return notifications.map((n) => ({
      id: n.id,
      type: n.type,
      message: n.message,
      severity: n.severity,
      isRead: n.is_read,
      metadata: n.metadata as Record<string, any>,
      createdAt: n.created_at.toISOString(),
    }));
  }

  async markNotificationRead(params: {
    notificationId: number;
  }): Promise<{ success: boolean }> {
    await notificationService.markAsRead(params.notificationId, this.accountId);
    return { success: true };
  }

  // ===== Plugin Methods =====

  async listAvailablePlugins(params?: { limit?: number; offset?: number }): Promise<
    Array<{
      id: string;
      name: string;
      version: string;
      providerId: string;
      author: string;
      description: string;
      features: string[];
      sourceUrl: string;
    }>
  > {
    const plugins = await pluginRegistryService.listPlugins(params);

    return plugins.map((p) => {
      const manifest = p.agx_manifest as AgxManifest;
      return {
        id: p.id,
        name: p.name,
        version: p.version,
        providerId: p.provider_id,
        author: p.author,
        description: manifest.description,
        features: manifest.features || [],
        sourceUrl: p.source_url,
      };
    });
  }

  async getPluginDetails(params: { pluginId: string }): Promise<{
    id: string;
    name: string;
    version: string;
    providerId: string;
    author: string;
    logicPath: string;
    agxManifest: AgxManifest;
    sourceUrl: string;
    discoveredAt: string;
    lastValidatedAt: string;
  }> {
    const plugin = await pluginRegistryService.getPluginById(params.pluginId);

    return {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      providerId: plugin.provider_id,
      author: plugin.author,
      logicPath: plugin.logic_path,
      agxManifest: plugin.agx_manifest as AgxManifest,
      sourceUrl: plugin.source_url,
      discoveredAt: plugin.discovered_at.toISOString(),
      lastValidatedAt: plugin.last_validated_at.toISOString(),
    };
  }

  async togglePlugin(params: {
    pluginId: string;
    enabled: boolean;
  }): Promise<{ success: boolean }> {
    // Get current account policy
    const account = await accountService.getAccount(this.accountId);
    const policy =
      typeof account.policy_json === "string"
        ? JSON.parse(account.policy_json)
        : account.policy_json;

    // Update plugins list
    const currentPlugins = policy.plugins || [];
    let updatedPlugins: string[];

    if (params.enabled) {
      // Add plugin if not already present
      if (!currentPlugins.includes(params.pluginId)) {
        updatedPlugins = [...currentPlugins, params.pluginId];
      } else {
        updatedPlugins = currentPlugins;
      }
    } else {
      // Remove plugin
      updatedPlugins = currentPlugins.filter((id: string) => id !== params.pluginId);
    }

    // Update policy
    const updatedPolicy = {
      ...policy,
      plugins: updatedPlugins,
    };

    await accountService.updatePolicy(this.accountId, updatedPolicy);

    // Create audit log
    await auditLogService.createAuditLog({
      accountId: this.accountId,
      streamId: null,
      type: params.enabled ? "PLUGIN_ATTACHED" : "PLUGIN_ERROR",
      content: {
        message: `Plugin ${params.pluginId} ${params.enabled ? "enabled" : "disabled"}`,
        pluginId: params.pluginId,
      },
      isInternal: false,
    });

    return { success: true };
  }

  // ===== Contract Deployment Methods =====

  async deployContracts(params: { chainId: string }): Promise<{
    chainId: string;
    contracts: Record<string, string>;
    txHashes: string[];
    deployedAt: string;
  }> {
    const { createPrivyClient } =
      await import("@/services/wallet/shared/providers/privy-provider");

    const privyClient = createPrivyClient();
    const result = await streamService.deployContracts(
      this.accountId,
      params.chainId,
      privyClient,
    );

    return {
      chainId: result.chainId,
      contracts: result.contracts,
      txHashes: result.txHashes,
      deployedAt: result.deployedAt.toISOString(),
    };
  }

  async getDeployment(params: { chainId: string }): Promise<{
    chainId: string;
    contracts: Record<string, string>;
    txHashes: string[];
    deployedAt: string;
  } | null> {
    const result = await streamService.getDeployment(this.accountId, params.chainId);

    if (!result) return null;

    return {
      chainId: result.chainId,
      contracts: result.contracts,
      txHashes: result.txHashes,
      deployedAt: result.deployedAt.toISOString(),
    };
  }

  async listDeployments(): Promise<
    Array<{
      chainId: string;
      contracts: Record<string, string>;
      txHashes: string[];
      deployedAt: string;
    }>
  > {
    const results = await streamService.listDeployments(this.accountId);

    return results.map((r) => ({
      chainId: r.chainId,
      contracts: r.contracts,
      txHashes: r.txHashes,
      deployedAt: r.deployedAt.toISOString(),
    }));
  }

  // ===== Stream Wizard Methods =====

  async createStreamFromWizard(params: {
    chainId: string;
    name: string;
    tokenAddress: string;
    totalAmount: string;
    recipients: Array<{ address: string; percentage: number }>;
    vestingSchedule: {
      type: "linear" | "cliff" | "milestone";
      startDate: string;
      endDate: string;
      cliffDuration?: number;
    };
  }): Promise<{
    success: boolean;
    streamId: number;
  }> {
    // 1. Validate chain is deployed
    const deployment = await streamService.getDeployment(this.accountId, params.chainId);
    if (!deployment) {
      throw new Error(`Please deploy contracts to ${params.chainId} first`);
    }

    // 2. Check budget limits
    const canCreate = await streamService.canCreateStream(
      this.accountId,
      parseFloat(params.totalAmount),
    );
    if (!canCreate) {
      throw new Error("Stream amount exceeds your budget limits");
    }

    // 3. Create stream in database (for now, single recipient)
    const recipient = params.recipients[0];
    if (!recipient) {
      throw new Error("At least one recipient is required");
    }

    const assetId = `${params.chainId}/erc20:${params.tokenAddress}`;

    const streamId = await streamService.createDraft(this.accountId, {
      recipient_address: recipient.address,
      title: params.name,
      description: `Stream created via wizard`,
      total_amount: parseFloat(params.totalAmount),
      amount_per_period: parseFloat(params.totalAmount) / 30, // Simplified: monthly
      period_duration: 86400 * 30, // 30 days
      asset_id: assetId,
      start_date: new Date(params.vestingSchedule.startDate),
      end_date: new Date(params.vestingSchedule.endDate),
    });

    // 4. Transition to ACTIVE status
    await streamService.transitionStatus(streamId, "ACTIVE");

    // 5. Create audit log
    await auditLogService.createAuditLog({
      accountId: this.accountId,
      streamId,
      type: "STREAM_CREATED",
      content: {
        message: `Stream "${params.name}" created via wizard`,
        chainId: params.chainId,
        totalAmount: params.totalAmount,
        recipientCount: params.recipients.length,
      },
      isInternal: false,
    });

    return {
      success: true,
      streamId,
    };
  }

  // ===== Account Deletion =====

  async deleteAccount(): Promise<{ success: boolean }> {
    await accountService.deleteAccount(this.accountId, this.userId);
    return { success: true };
  }
}
