import { ColumnType, Generated, JSONColumnType, Selectable } from "kysely";

export type Timestamp = ColumnType<Date, string | undefined, never>;

export interface UsersTable {
  id: Generated<number>;
  privy_did: string;
  created_at: Timestamp;
}

export interface CirclesTable {
  id: Generated<number>;
  owner_user_id: number;
  name: string;
  invite_code: string;
  encryption_pubkey: string;
  created_at: Timestamp;
}

export interface CircleMembersTable {
  id: Generated<number>;
  circle_id: number;
  user_id: number;
  encrypted_stealth_address: string;
  ephemeral_pubkey: string;
  status: "pending" | "approved" | "rejected";
  joined_at: Timestamp;
}

export interface ProposalsTable {
  id: Generated<number>;
  user_id: number;
  type: string;
  params_json: JSONColumnType<Record<string, any>>;
  status: "pending" | "approved" | "rejected" | "executed";
  agent_reason: string | null;
  created_at: Timestamp;
  executed_at: ColumnType<
    Date | null,
    string | null | undefined,
    string | null | undefined
  >;
}

export interface StrategiesTable {
  id: Generated<number>;
  user_id: number;
  name: string;
  source_code: string;
  bytecode: string | null;
  abi_json: JSONColumnType<any[] | null>;
  status: "pending" | "compiling" | "compiled" | "failed";
  errors: string | null;
  test_status: "untested" | "testing" | "passed" | "failed" | null;
  test_results_json: JSONColumnType<Record<string, any> | null>;
  deployment_address: string | null;
  created_at: Timestamp;
}

export interface DB {
  users: UsersTable;
  circles: CirclesTable;
  circle_members: CircleMembersTable;
  proposals: ProposalsTable;
  strategies: StrategiesTable;
}

export type User = Selectable<UsersTable>;
export type Circle = Selectable<CirclesTable>;
export type CircleMember = Selectable<CircleMembersTable>;
export type Proposal = Selectable<ProposalsTable>;
export type Strategy = Selectable<StrategiesTable>;
