import {
  VestingAccount,
  VestingStream,
  VestingStreamStatus,
} from "@/infrastructure/database/schema";
import { db } from "@/infrastructure/database/turso-connection";
import { auditLogService } from "@/services/infra/audit-log-service";
import { enqueueScheduledEvent } from "@/utils/scheduled-events";
import { PrivyClient } from "@privy-io/server-auth";

// EVM deployer
import {
  evmDeployer,
  type DeploymentResult,
} from "@/services/streams/chains/evm/evm-deployer";

// EVM stream operations
import { evmStreamOperations } from "@/services/streams/chains/evm/evm-stream-operations";

export type { DeploymentResult };

// Re-export chain operations for convenient access
export { evmStreamOperations };

/**
 * Stream Service
 *
 * The Single Source of Truth for:
 * 1. Stream Lifecycle (Draft, Active, Completed)
 * 2. Contract Deployment (EVM/Tempo)
 */
export const streamService = {
  // ===========================================================================
  // 1. STREAM LIFECYCLE MANAGEMENT
  // ===========================================================================

  /**
   * Create new vesting stream in DRAFTING status
   */
  async createDraft(
    accountId: number,
    initialData?: Partial<VestingStream>,
  ): Promise<number> {
    const result = await db
      .insertInto("vesting_streams")
      .values({
        account_id: accountId,
        status: "DRAFTING",
        recipient_address: initialData?.recipient_address || "",
        title: initialData?.title || "",
        description: initialData?.description || "",
        total_amount: initialData?.total_amount || 0,
        amount_per_period: initialData?.amount_per_period || 0,
        period_duration: initialData?.period_duration || 0,
        asset_id: initialData?.asset_id || "",
        start_date: initialData?.start_date || new Date(),
        end_date: initialData?.end_date || new Date(),
        total_distributed: 0,
        yield_earned: 0,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const streamId = result.id;

    await enqueueScheduledEvent({
      eventType: "draft.timeout",
      entityType: "vesting_stream",
      entityId: streamId,
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      metadata: {
        accountId,
      },
      description: `Clean up stale draft (24h timeout)`,
    });

    return streamId;
  },

  /**
   * Update vesting stream fields
   */
  async updateStream(
    id: number,
    updates: Partial<Omit<VestingStream, "id" | "created_at">>,
  ): Promise<void> {
    const updateData: any = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    // Convert Date objects to ISO strings
    if (updates.start_date instanceof Date) {
      updateData.start_date = updates.start_date.toISOString();
    }
    if (updates.end_date instanceof Date) {
      updateData.end_date = updates.end_date.toISOString();
    }
    if (updates.last_distribution_at instanceof Date) {
      updateData.last_distribution_at = updates.last_distribution_at.toISOString();
    }
    if (updates.completed_at instanceof Date) {
      updateData.completed_at = updates.completed_at.toISOString();
    }

    await db.updateTable("vesting_streams").set(updateData).where("id", "=", id).execute();
  },

  /**
   * Get vesting stream by ID
   */
  async getStream(id: number): Promise<VestingStream> {
    const stream = await db
      .selectFrom("vesting_streams")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirstOrThrow();

    return stream;
  },

  /**
   * List streams for an account
   */
  async listStreamsForAccount(
    accountId: number,
    options?: {
      status?: VestingStreamStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<VestingStream[]> {
    let query = db
      .selectFrom("vesting_streams")
      .selectAll()
      .where("account_id", "=", accountId)
      .orderBy("created_at", "desc");

    if (options?.status) {
      query = query.where("status", "=", options.status);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.offset(options.offset);
    }

    return (await query.execute()) as VestingStream[];
  },

  async verifyStreamOwnership(streamId: number, accountId: number): Promise<boolean> {
    const stream = await db
      .selectFrom("vesting_streams")
      .select("id")
      .where("id", "=", streamId)
      .where("account_id", "=", accountId)
      .executeTakeFirst();

    return !!stream;
  },

  async getAuditLogsForStream(
    streamId: number,
    includeInternal: boolean = false,
  ): Promise<
    Array<{
      id: number;
      type: string;
      content: Record<string, any>;
      confidence_score: number | null;
      is_internal: boolean;
      created_at: Date;
    }>
  > {
    return await auditLogService.getAuditLogsForStream(streamId, includeInternal);
  },

  /**
   * Get account with policy for agent context
   */
  async getAccountWithPolicy(accountId: number): Promise<VestingAccount> {
    const account = await db
      .selectFrom("vesting_accounts")
      .selectAll()
      .where("id", "=", accountId)
      .executeTakeFirstOrThrow();

    // Parse JSON fields if they're strings (SQLite stores as TEXT)
    if (typeof account.policy_json === "string") {
      account.policy_json = JSON.parse(account.policy_json) as any;
    }
    if (typeof account.wallet_balances === "string") {
      account.wallet_balances = JSON.parse(account.wallet_balances) as any;
    }

    return account;
  },

  /**
   * Transition status with validation
   */
  async transitionStatus(id: number, newStatus: VestingStreamStatus): Promise<void> {
    const stream = await this.getStream(id);

    // Validate state transitions
    const validTransitions: Record<VestingStreamStatus, VestingStreamStatus[]> = {
      DRAFTING: ["ACTIVE", "CANCELLED"],
      ACTIVE: ["PAUSED", "COMPLETED", "CANCELLED"],
      PAUSED: ["ACTIVE", "CANCELLED"],
      COMPLETED: [], // Terminal state
      CANCELLED: [], // Terminal state
    };

    const allowedTransitions = validTransitions[stream.status];
    if (!allowedTransitions.includes(newStatus)) {
      throw new Error(`Invalid status transition: ${stream.status} -> ${newStatus}`);
    }

    const now = new Date().toISOString();
    const updateData: any = {
      status: newStatus,
      updated_at: now,
    };

    // Set timestamps for specific transitions
    if (newStatus === "COMPLETED") {
      updateData.completed_at = now;
    }

    await db.updateTable("vesting_streams").set(updateData).where("id", "=", id).execute();
  },

  /**
   * Update last_distribution_at timestamp
   */
  async markDistributed(id: number, amount: number): Promise<void> {
    const stream = await this.getStream(id);
    const now = new Date().toISOString();

    await db
      .updateTable("vesting_streams")
      .set({
        last_distribution_at: now as any,
        total_distributed: stream.total_distributed + amount,
        updated_at: now,
      })
      .where("id", "=", id)
      .execute();
  },

  /**
   * Update yield earned
   */
  async addYieldEarned(id: number, yieldAmount: number): Promise<void> {
    const stream = await this.getStream(id);
    const now = new Date().toISOString();

    await db
      .updateTable("vesting_streams")
      .set({
        yield_earned: stream.yield_earned + yieldAmount,
        updated_at: now,
      })
      .where("id", "=", id)
      .execute();
  },

  /**
   * Get active streams ready for distribution
   */
  async getStreamsForDistribution(): Promise<VestingStream[]> {
    const now = new Date();
    const streams = await db
      .selectFrom("vesting_streams")
      .selectAll()
      .where("status", "=", "ACTIVE")
      .where("end_date", ">", now)
      .execute();

    return streams;
  },

  /**
   * Get completed streams (end date passed)
   */
  async getCompletedStreams(): Promise<VestingStream[]> {
    const now = new Date();
    const streams = await db
      .selectFrom("vesting_streams")
      .selectAll()
      .where("end_date", "<", now)
      .where("status", "in", ["ACTIVE", "PAUSED"])
      .execute();

    return streams;
  },

  /**
   * Check if account can create new stream (budget limits)
   */
  async canCreateStream(accountId: number, streamAmount: number): Promise<boolean> {
    const account = await this.getAccountWithPolicy(accountId);
    const policy = account.policy_json;

    // Check max stream budget
    if (streamAmount > policy.budget_limits.max_stream_budget) {
      return false;
    }

    // Check daily limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dailySpent = await db
      .selectFrom("vesting_streams")
      .select((eb) => eb.fn.sum<number>("total_amount").as("total"))
      .where("account_id", "=", accountId)
      .where("created_at", ">=", today)
      .executeTakeFirst();

    if (dailySpent?.total && dailySpent.total >= policy.budget_limits.daily_limit) {
      return false;
    }

    // Check monthly limit
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthlySpent = await db
      .selectFrom("vesting_streams")
      .select((eb) => eb.fn.sum<number>("total_amount").as("total"))
      .where("account_id", "=", accountId)
      .where("created_at", ">=", monthStart)
      .executeTakeFirst();

    if (monthlySpent?.total && monthlySpent.total >= policy.budget_limits.monthly_limit) {
      return false;
    }

    return true;
  },

  // ===========================================================================
  // 2. BLOCKCHAIN & DEPLOYMENT MANAGEMENT
  // ===========================================================================

  /**
   * Deploy contracts for an account on Tempo
   */
  async deployContracts(
    accountId: number,
    privyClient: PrivyClient,
  ): Promise<DeploymentResult> {
    const chainId = "tempo";

    // Check if already deployed
    const existing = await this.getDeployment(accountId, chainId);
    if (existing) {
      throw new Error(`Contracts already deployed on ${chainId}`);
    }

    const result = await evmDeployer.deploy(accountId, privyClient);

    // Store deployment in database
    await this.saveDeployment(accountId, result);

    // Audit Log
    await auditLogService.createAuditLog({
      accountId,
      streamId: null,
      type: "CONTRACT_DEPLOYMENT",
      content: {
        chainId,
        contracts: result.contracts,
        txHashes: result.txHashes,
      },
      isInternal: true,
    });

    return result;
  },

  /**
   * Get existing deployment for an account
   */
  async getDeployment(
    accountId: number,
    chainId: string,
  ): Promise<DeploymentResult | null> {
    const deployment = await db
      .selectFrom("contract_deployments")
      .where("account_id", "=", accountId)
      .where("chain_id", "=", chainId)
      .selectAll()
      .executeTakeFirst();

    if (!deployment) return null;

    return {
      chainId: deployment.chain_id,
      contracts: deployment.contracts_json,
      txHashes: deployment.tx_hashes_json,
      deployedAt: deployment.deployed_at,
    };
  },

  /**
   * List all deployments for an account
   */
  async listDeployments(accountId: number): Promise<DeploymentResult[]> {
    const deployments = await db
      .selectFrom("contract_deployments")
      .where("account_id", "=", accountId)
      .selectAll()
      .execute();

    return deployments.map((d) => ({
      chainId: d.chain_id,
      contracts: d.contracts_json,
      txHashes: d.tx_hashes_json,
      deployedAt: d.deployed_at,
    }));
  },

  /**
   * Save deployment to database (Internal)
   */
  async saveDeployment(accountId: number, result: DeploymentResult): Promise<void> {
    await db
      .insertInto("contract_deployments")
      .values({
        account_id: accountId,
        chain_id: result.chainId,
        contracts_json: result.contracts,
        tx_hashes_json: result.txHashes,
        deployed_at: result.deployedAt,
      })
      .execute();
  },
};
