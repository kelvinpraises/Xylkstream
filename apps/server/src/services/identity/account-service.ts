import type { VestingAccount, AccountPolicy } from "@/infrastructure/database/schema";
import { db } from "@/infrastructure/database/turso-connection";

/**
 * Vesting Account Service
 *
 * Centralized service for vesting account operations.
 */
export const accountService = {
  /**
   * Get a vesting account by ID
   */
  async getAccount(accountId: number): Promise<VestingAccount> {
    const account = await db
      .selectFrom("vesting_accounts")
      .selectAll()
      .where("id", "=", accountId)
      .executeTakeFirstOrThrow();

    return account as VestingAccount;
  },

  /**
   * Get account with parsed policy
   */
  async getAccountWithPolicy(
    accountId: number,
  ): Promise<VestingAccount & { policy_json: AccountPolicy }> {
    const account = await this.getAccount(accountId);

    const policy =
      typeof account.policy_json === "string"
        ? JSON.parse(account.policy_json)
        : account.policy_json;

    return {
      ...account,
      policy_json: policy as AccountPolicy,
    };
  },

  /**
   * Update account policy
   */
  async updatePolicy(accountId: number, policy: AccountPolicy): Promise<void> {
    await db
      .updateTable("vesting_accounts")
      .set({
        policy_json: policy as any,
        updated_at: new Date().toISOString(),
      })
      .where("id", "=", accountId)
      .execute();
  },

  /**
   * Update wallet balances
   */
  async updateWalletBalances(
    accountId: number,
    balances: Record<string, string>,
  ): Promise<void> {
    await db
      .updateTable("vesting_accounts")
      .set({
        wallet_balances: balances as any,
        updated_at: new Date().toISOString(),
      })
      .where("id", "=", accountId)
      .execute();
  },

  /**
   * Update last stream created timestamp
   */
  async updateLastStreamCreated(accountId: number): Promise<void> {
    await db
      .updateTable("vesting_accounts")
      .set({
        last_stream_created_at: new Date() as any,
        updated_at: new Date().toISOString(),
      })
      .where("id", "=", accountId)
      .execute();
  },

  /**
   * List all vesting accounts
   */
  async listAccounts(): Promise<VestingAccount[]> {
    return (await db
      .selectFrom("vesting_accounts")
      .selectAll()
      .execute()) as VestingAccount[];
  },

  /**
   * Delete account (cascades to user)
   */
  async deleteAccount(accountId: number, userId: number): Promise<void> {
    // Delete account first (will cascade to related records via DB constraints)
    await db
      .deleteFrom("vesting_accounts")
      .where("id", "=", accountId)
      .where("user_id", "=", userId)
      .execute();

    // Delete user
    await db.deleteFrom("users").where("id", "=", userId).execute();
  },
};
