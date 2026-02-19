import { PrivyClient } from "@privy-io/server-auth";
import { sql } from "kysely";

import { db } from "@/infrastructure/database/turso-connection";
import { User } from "@/models/User";

const privy = new PrivyClient(process.env.PRIVY_APP_ID!, process.env.PRIVY_SECRET!);

export const authService = {
  /**
   * Authenticate user with Privy access token
   */
  async authenticateUser(accessToken: string): Promise<{
    user: User;
    accountId: number;
  }> {
    try {
      // Verify Privy access token
      const claims = await privy.verifyAuthToken(accessToken);
      const privyDid = claims.userId;

      // Get full Privy user data
      const privyUser = await privy.getUser(privyDid);

      // Extract username from email or wallet
      const email = privyUser.email?.address;
      const wallet = privyUser.wallet?.address;
      const username = email || wallet || `user-${privyDid.slice(-8)}`;

      // Get or create user
      const user = await this.getOrCreateUser(privyDid, username);

      // Get or create vesting account
      const account = await this.getOrCreateAccount(user.id);

      return {
        user,
        accountId: account.id,
      };
    } catch (error) {
      throw new Error(`Authentication failed: ${error}`);
    }
  },

  /**
   * Get or create user by Privy DID
   */
  async getOrCreateUser(privyDid: string, username: string): Promise<User> {
    // Check if user exists by Privy DID
    const existingUser = await db
      .selectFrom("users")
      .selectAll()
      .where("privy_did", "=", privyDid)
      .executeTakeFirst();

    if (existingUser) {
      // Update username if changed
      if (existingUser.username !== username) {
        await db
          .updateTable("users")
          .set({
            username,
            updated_at: sql`CURRENT_TIMESTAMP`,
          })
          .where("id", "=", existingUser.id)
          .execute();

        return {
          ...existingUser,
          username,
        };
      }

      return existingUser;
    }

    // Create new user with default fid (0 for non-Farcaster users)
    const result = await db
      .insertInto("users")
      .values({
        privy_did: privyDid,
        fid: 0, // Default FID for non-Farcaster users
        username,
      })
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      throw new Error(`Failed to create user for Privy DID ${privyDid}`);
    }

    return result;
  },

  /**
   * Get or create vesting account for user
   */
  async getOrCreateAccount(userId: number): Promise<{
    id: number;
    wallet_address: string;
    privy_wallet_id: string;
  }> {
    // Check if account exists
    const existingAccount = await db
      .selectFrom("vesting_accounts")
      .select(["id", "wallet_address", "privy_wallet_id"])
      .where("user_id", "=", userId)
      .executeTakeFirst();

    if (existingAccount) {
      return existingAccount;
    }

    // Create wallet via Privy
    const wallet = await privy.walletApi.createWallet({
      chainType: "ethereum",
    });

    // Create default policy
    const defaultPolicy = {
      prompt: "Optimize yield for idle vesting funds while maintaining liquidity for scheduled distributions",
      plugins: [],
      budget_limits: {
        max_stream_budget: 100000,
        daily_limit: 10000,
        monthly_limit: 100000,
      },
    };

    // Create vesting account
    const result = await db
      .insertInto("vesting_accounts")
      .values({
        user_id: userId,
        wallet_address: wallet.address,
        privy_wallet_id: wallet.id,
        policy_json: defaultPolicy,
        wallet_balances: {},
      })
      .returning(["id", "wallet_address", "privy_wallet_id"])
      .executeTakeFirst();

    if (!result) {
      throw new Error(`Failed to create vesting account for user ${userId}`);
    }

    return result;
  },

  /**
   * Get user by ID
   */
  async getUserById(userId: number): Promise<User | undefined> {
    return await db
      .selectFrom("users")
      .selectAll()
      .where("id", "=", userId)
      .executeTakeFirst();
  },

  /**
   * Get user by Privy DID
   */
  async getUserByPrivyDid(privyDid: string): Promise<User | undefined> {
    return await db
      .selectFrom("users")
      .selectAll()
      .where("privy_did", "=", privyDid)
      .executeTakeFirst();
  },

  /**
   * Delete user and all associated data
   */
  async deleteUser(userId: number): Promise<void> {
    // Delete user's vesting account (cascades to vesting_streams, audit_logs, notifications)
    await db.deleteFrom("vesting_accounts").where("user_id", "=", userId).execute();

    // Delete user
    await db.deleteFrom("users").where("id", "=", userId).execute();
  },
};
