import { ColumnType, Generated, JSONColumnType, Selectable } from "kysely";

// Timestamp helpers
export type Timestamp = ColumnType<Date, string | undefined, never>;
export type UpdateableTimestamp = ColumnType<
  Date,
  string | undefined,
  string | undefined
>;

// Users table - Farcaster-based authentication via Privy
export interface UsersTable {
  id: Generated<number>;
  privy_did: string; // Privy DID (UNIQUE)
  fid: number; // Farcaster ID (UNIQUE)
  username: string;
  created_at: Timestamp;
  updated_at: UpdateableTimestamp;
}

// Account policy structure for vesting accounts
export interface AccountPolicy {
  prompt: string;
  plugins: string[]; // plugin_registry_id references
  budget_limits: {
    max_stream_budget: number;
    daily_limit: number;
    monthly_limit: number;
  };
}

// Vesting accounts - One per user, contains wallet and policy
export interface VestingAccountsTable {
  id: Generated<number>;
  user_id: number; // FK to users (UNIQUE - 1:1 relationship)
  wallet_address: string;
  privy_wallet_id: string;
  policy_json: JSONColumnType<AccountPolicy, AccountPolicy, AccountPolicy>;
  wallet_balances: JSONColumnType<Record<string, string>, Record<string, string>, Record<string, string>>;
  last_stream_created_at: Date | null; // Throttle stream creation (prevent spam)
  created_at: Timestamp;
  updated_at: UpdateableTimestamp;
}

// Vesting stream status state machine
export type VestingStreamStatus =
  | "DRAFTING"
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED";

// Vesting streams - Payment streams with yield optimization
export interface VestingStreamsTable {
  id: Generated<number>;
  account_id: number; // FK to vesting_accounts
  status: VestingStreamStatus;
  recipient_address: string;
  title: string;
  description: string;
  total_amount: number;
  amount_per_period: number;
  period_duration: number; // seconds
  asset_id: string; // Token identifier
  start_date: Date;
  end_date: Date;
  last_distribution_at: Date | null;
  total_distributed: number;
  yield_earned: number; // Accumulated yield from idle funds
  created_at: Timestamp;
  updated_at: UpdateableTimestamp;
  completed_at: Date | null;
}

// Audit log types for transparent decision trail
export type AuditLogType =
  | "STREAM_CREATED"       // Agent created a vesting stream
  | "PLUGIN_ATTACHED"      // Agent attached a plugin
  | "PLUGIN_ERROR"         // Plugin attachment failed
  | "CONTRACT_DEPLOYMENT"  // Contracts deployed to chain
  | "STREAM_STARTED"       // Stream became active
  | "DISTRIBUTION_MADE"    // Payment distributed to recipient
  | "YIELD_EARNED"         // Yield generated from idle funds
  | "AI_OPTIMIZATION"      // Agent optimized yield strategy
  | "USER_FEEDBACK"        // User sent message to agent
  | "AI_THOUGHT"           // Agent reasoning (isInternal=true: hidden, isInternal=false: visible to user)
  | "PLUGIN_UI_ATTACHMENT" // Plugin attached UI visualization
  | "STREAM_PAUSED"        // Stream paused
  | "STREAM_RESUMED"       // Stream resumed
  | "STREAM_COMPLETED"     // Stream finished
  | "STREAM_CANCELLED";    // User cancelled stream

// Audit logs - Immutable decision trail
export interface AuditLogsTable {
  id: Generated<number>;
  account_id: number; // FK to vesting_accounts
  stream_id: number | null; // FK to vesting_streams (nullable for account-level logs)
  type: AuditLogType;
  content: JSONColumnType<Record<string, any>, Record<string, any>, Record<string, any>>; // Reasoning, scores, decisions, metadata
  confidence_score: number | null;
  is_internal: boolean; // Hide from public queries
  created_at: Timestamp;
}

// AGX manifest structure
export interface AgxManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  icon?: string;
  logic: string; // Path to worker script
  ui?: {
    entry: string;
    supports_iframe?: boolean;
    responsive?: boolean;
    dimensions?: string;
  };
  permissions?: string[]; // e.g., ["storage::isolated"]
  features?: string[];
  storage_schema?: Record<string, any>;
  api_endpoints?: Record<string, string>;
  metadata?: {
    created_at?: string;
    last_updated?: string;
    status?: string;
    [key: string]: any;
  };
}

// Plugin registry - Global catalog of discovered plugins
export interface PluginRegistryTable {
  id: string; // Content hash (SHA256) - PRIMARY KEY
  name: string;
  version: string;
  provider_id: string; // Slugified name-author
  author: string;
  logic_path: string; // Path to worker script
  agx_manifest: JSONColumnType<AgxManifest, AgxManifest, AgxManifest>;
  source_url: string;
  discovered_at: Date;
  last_validated_at: Date;
  created_at: Timestamp;
  updated_at: UpdateableTimestamp;
}

// Notification types
export type NotificationType =
  | "LOW_FUNDS"
  | "STREAM_COMPLETED"
  | "DISTRIBUTION_FAILED"
  | "PLUGIN_ERROR"
  | "YIELD_OPPORTUNITY"
  | "SYSTEM_ALERT";

// Notification severity levels
export type NotificationSeverity = "info" | "warning" | "error" | "critical";

// Notifications - Info table for user actionable items
export interface NotificationsTable {
  id: Generated<number>;
  account_id: number; // FK to vesting_accounts
  type: NotificationType;
  message: string;
  severity: NotificationSeverity;
  is_read: boolean;
  metadata: JSONColumnType<Record<string, any>>; // Additional context
  created_at: Timestamp;
}

// Plugin isolated storage - Per-account, per-plugin storage
export interface PluginIsolatedStorageTable {
  account_id: number; // FK to vesting_accounts (composite PK)
  provider_id: string; // Plugin provider ID (composite PK)
  storage_json: JSONColumnType<any, any, any>; // Plugin-specific data
  updated_at: UpdateableTimestamp;
}

// Contract deployments - Track deployed contracts per chain
export interface ContractDeploymentsTable {
  id: Generated<number>;
  account_id: number; // FK to vesting_accounts
  chain_id: string; // Chain identifier
  contracts_json: JSONColumnType<Record<string, string>, Record<string, string>, Record<string, string>>; // Contract addresses
  tx_hashes_json: JSONColumnType<string[], string[], string[]>; // Deployment transaction hashes
  deployed_at: Date;
  created_at: Timestamp;
}

// Database interface
export interface DB {
  users: UsersTable;
  vesting_accounts: VestingAccountsTable;
  vesting_streams: VestingStreamsTable;
  audit_logs: AuditLogsTable;
  plugin_registry: PluginRegistryTable;
  notifications: NotificationsTable;
  plugin_isolated_storage: PluginIsolatedStorageTable;
  contract_deployments: ContractDeploymentsTable;
}

// Selectable types for queries
export type User = Selectable<UsersTable>;
export type VestingAccount = Selectable<VestingAccountsTable>;
export type VestingStream = Selectable<VestingStreamsTable>;
export type AuditLog = Selectable<AuditLogsTable>;
export type PluginRegistry = Selectable<PluginRegistryTable>;
export type Notification = Selectable<NotificationsTable>;
export type ContractDeployment = Selectable<ContractDeploymentsTable>;
