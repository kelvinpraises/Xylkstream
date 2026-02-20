import cron from "node-cron";

import { pluginService } from "@/services/plugins/plugin-service";

/**
 * Plugin Cleanup Cron Job
 *
 * Runs every 5 minutes to terminate unused plugin processes.
 */
const pluginCleanupCron = {
  async start() {
    console.log("[plugin-cleanup-cron] Starting plugin cleanup cron job...");

    // Schedule the job to run every 5 minutes
    cron.schedule("*/5 * * * *", async () => {
      console.log("[plugin-cleanup-cron] Running plugin cleanup...");
      await this.runCleanup();
    });

    // Run immediately on startup
    console.log("[plugin-cleanup-cron] Running initial plugin cleanup...");
    await this.runCleanup();
  },

  async runCleanup() {
    try {
      await pluginService.cleanupUnusedPlugins();
      console.log("[plugin-cleanup-cron] Cleanup completed");
    } catch (error) {
      console.error("[plugin-cleanup-cron] Plugin cleanup failed:", error);
    }
  },
};

export default pluginCleanupCron;
