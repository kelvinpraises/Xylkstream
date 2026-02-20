import type { PluginRegistry } from "@/infrastructure/database/schema";
import { db } from "@/infrastructure/database/turso-connection";

/**
 * Plugin Registry Service
 *
 * Centralized service for plugin registry queries.
 */
export const pluginRegistryService = {
  /**
   * List all available plugins
   */
  async listPlugins(options?: {
    limit?: number;
    offset?: number;
  }): Promise<PluginRegistry[]> {
    let query = db.selectFrom("plugin_registry").selectAll().orderBy("name", "asc");

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.offset(options.offset);
    }

    return (await query.execute()) as PluginRegistry[];
  },

  /**
   * Get plugin by ID
   */
  async getPluginById(pluginId: string): Promise<PluginRegistry> {
    const plugin = await db
      .selectFrom("plugin_registry")
      .selectAll()
      .where("id", "=", pluginId)
      .executeTakeFirstOrThrow();

    return plugin as PluginRegistry;
  },

  /**
   * Get plugin by provider ID
   */
  async getPluginByProviderId(providerId: string): Promise<PluginRegistry | null> {
    const plugin = await db
      .selectFrom("plugin_registry")
      .selectAll()
      .where("provider_id", "=", providerId)
      .executeTakeFirst();

    return plugin ? (plugin as PluginRegistry) : null;
  },
};
