import { db } from "@/infrastructure/database/turso-connection";
import { validateAccountId } from "@/services/wallet/shared/providers/base-provider";

/**
 * Wallet Data Access Layer
 * Simplified for single-chain (Tempo) - uses vesting_accounts table directly
 */
export const walletData = {
  /**
   * Get wallet address for an account
   */
  async getWalletAddress(accountId: number): Promise<string | null> {
    validateAccountId(accountId);

    const account = await db
      .selectFrom("vesting_accounts")
      .select(["wallet_address", "privy_wallet_id"])
      .where("id", "=", accountId)
      .executeTakeFirst();

    return account?.wallet_address ?? null;
  },

  /**
   * Get wallet address or throw
   */
  async getWalletAddressOrThrow(accountId: number): Promise<string> {
    const address = await this.getWalletAddress(accountId);
    if (!address) {
      throw new Error(`No wallet found for account ${accountId}`);
    }
    return address;
  },

  /**
   * Get Privy wallet ID for an account
   */
  async getPrivyWalletId(accountId: number): Promise<string | null> {
    validateAccountId(accountId);

    const account = await db
      .selectFrom("vesting_accounts")
      .select("privy_wallet_id")
      .where("id", "=", accountId)
      .executeTakeFirst();

    return account?.privy_wallet_id ?? null;
  },

  /**
   * Get Privy wallet ID or throw
   */
  async getPrivyWalletIdOrThrow(accountId: number): Promise<string> {
    const id = await this.getPrivyWalletId(accountId);
    if (!id) {
      throw new Error(`No Privy wallet ID found for account ${accountId}`);
    }
    return id;
  },
};
