import type { User } from "@/infrastructure/database/schema";
import { db } from "@/infrastructure/database/turso-connection";

/**
 * User Service
 *
 * Centralized service for user management operations.
 */
export const userService = {
  /**
   * Get user by ID
   */
  async getUserById(userId: number): Promise<User> {
    const user = await db
      .selectFrom("users")
      .selectAll()
      .where("id", "=", userId)
      .executeTakeFirstOrThrow();

    return user as User;
  },

  /**
   * Get user by Privy DID
   */
  async getUserByPrivyDid(privyDid: string): Promise<User | null> {
    const user = await db
      .selectFrom("users")
      .selectAll()
      .where("privy_did", "=", privyDid)
      .executeTakeFirst();

    return user ? (user as User) : null;
  },

  /**
   * Create a new user
   */
  async createUser(data: {
    privyDid: string;
    fid: number;
    username: string;
  }): Promise<User> {
    const user = await db
      .insertInto("users")
      .values({
        privy_did: data.privyDid,
        fid: data.fid,
        username: data.username,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return user as User;
  },

  /**
   * Update user
   */
  async updateUser(userId: number, data: { username?: string }): Promise<void> {
    await db
      .updateTable("users")
      .set({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .where("id", "=", userId)
      .execute();
  },

  /**
   * Delete user
   */
  async deleteUser(userId: number): Promise<void> {
    await db.deleteFrom("users").where("id", "=", userId).execute();
  },
};
