import cron from "node-cron";

import { pluginDiscoveryService } from "@/services/plugins/plugin-discovery-service";

/**
 * Plugin Discovery Cron Job
 *
 * Runs every 5 minutes to discover new plugins from GitHub repository.
 */
const pluginDiscoveryCron = {
  async start() {
    console.log("[plugin-discovery-cron] Starting plugin discovery cron job...");

    // Schedule the job to run every 5 minutes
    cron.schedule("*/5 * * * *", async () => {
      console.log("[plugin-discovery-cron] Running plugin discovery...");
      await this.runDiscovery();
    });

    // Run immediately on startup
    console.log("[plugin-discovery-cron] Running initial plugin discovery...");
    await this.runDiscovery();
  },

  async runDiscovery() {
    try {
      const result = await pluginDiscoveryService.discoverPlugins();

      console.log(
        `[plugin-discovery-cron] Discovery completed: ${result.discovered} plugins discovered, ` +
          `${result.new.length} new, ${result.updated.length} updated`,
      );

      if (result.errors.length > 0) {
        console.warn(
          `[plugin-discovery-cron] Encountered ${result.errors.length} errors during discovery:`,
        );
        result.errors.forEach((err) => {
          console.warn(`  - ${err.folder}: ${err.error}`);
        });
      }
    } catch (error) {
      console.error("[plugin-discovery-cron] Plugin discovery failed:", error);
    }
  },
};

export default pluginDiscoveryCron;
