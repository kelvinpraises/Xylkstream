import { db } from "@/infrastructure/database/turso-connection";

/**
 * Plugin Storage Service
 *
 * Provides isolated storage for plugins per account.
 */
export const pluginStorageService = {
  /**
   * Get isolated storage for a plugin
   */
  async getIsolatedStorage(accountId: number, providerId: string): Promise<any | null> {
    const row = await db
      .selectFrom("plugin_isolated_storage")
      .selectAll()
      .where("account_id", "=", accountId)
      .where("provider_id", "=", providerId)
      .executeTakeFirst();

    if (!row) return null;

    return row.storage_json;
  },

  /**
   * Set isolated storage for a plugin (upsert)
   */
  async setIsolatedStorage(
    accountId: number,
    providerId: string,
    data: any,
  ): Promise<void> {
    await db
      .insertInto("plugin_isolated_storage")
      .values({
        account_id: accountId,
        provider_id: providerId,
        storage_json: data,
        updated_at: new Date().toISOString(),
      })
      .onConflict((oc) =>
        oc.columns(["account_id", "provider_id"]).doUpdateSet({
          storage_json: data,
          updated_at: new Date().toISOString(),
        }),
      )
      .execute();
  },

  /**
   * Delete isolated storage for a plugin
   */
  async deleteIsolatedStorage(accountId: number, providerId: string): Promise<void> {
    await db
      .deleteFrom("plugin_isolated_storage")
      .where("account_id", "=", accountId)
      .where("provider_id", "=", providerId)
      .execute();
  },
};
