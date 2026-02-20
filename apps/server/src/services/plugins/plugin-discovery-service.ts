import { createHash } from "crypto";
import { promises as fs } from "fs";
import { sql, type Insertable } from "kysely";
import path from "path";

import type { PluginRegistryTable } from "@/infrastructure/database/schema";
import { db } from "@/infrastructure/database/turso-connection";

interface AGXManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  icon?: string;
  logic: string;
  ui?: {
    entry: string;
    supports_iframe?: boolean;
    responsive?: boolean;
    dimensions?: string;
  };
  permissions?: string[];
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

interface DiscoveredPlugin {
  agx_manifest: AGXManifest;
  folder_name: string;
  source_url: string;
}

interface DiscoveryResult {
  discovered: number;
  updated: string[];
  new: string[];
  errors: Array<{ folder: string; error: string }>;
}

/**
 * Plugin Discovery Service
 *
 * Scans a GitHub repository for plugin providers with AGX.json manifests
 * and updates the plugin_registry table with discovered plugins.
 */
export class PluginDiscoveryService {
  private readonly GITHUB_REPO_URL: string;
  private readonly GITHUB_RAW_BASE: string;
  private readonly LOCAL_PLUGINS_PATH: string;
  private readonly isDevMode: boolean;

  constructor() {
    this.isDevMode =
      process.env.NODE_ENV === "development" || process.env.PLUGINS_MODE === "local";

    this.GITHUB_REPO_URL =
      process.env.PLUGINS_REPO_URL ||
      "https://api.github.com/repos/kelvinpraises/xylkstream-plugins/contents";

    this.GITHUB_RAW_BASE =
      process.env.PLUGINS_RAW_BASE ||
      "https://raw.githubusercontent.com/kelvinpraises/xylkstream-plugins/main";

    // Path to local plugins folder (apps/plugins)
    // Go up from apps/server to workspace root, then to plugins
    const serverDir = process.cwd(); // apps/server
    const workspaceRoot = path.resolve(serverDir, ".."); // apps (one level up from apps/server)
    this.LOCAL_PLUGINS_PATH = path.join(workspaceRoot, "plugins");
  }

  /**
   * Discover plugins from GitHub or local filesystem
   */
  async discoverPlugins(): Promise<DiscoveryResult> {
    if (this.isDevMode) {
      console.log("[plugin-discovery] Running in DEV mode - scanning local plugins");
      return this.discoverLocalPlugins();
    } else {
      console.log("[plugin-discovery] Running in PROD mode - scanning GitHub");
      return this.discoverGitHubPlugins();
    }
  }

  /**
   * Discover plugins from local filesystem (dev mode)
   */
  private async discoverLocalPlugins(): Promise<DiscoveryResult> {
    const result: DiscoveryResult = {
      discovered: 0,
      updated: [],
      new: [],
      errors: [],
    };

    try {
      // Check if plugins directory exists
      try {
        await fs.access(this.LOCAL_PLUGINS_PATH);
      } catch {
        console.log(
          `[plugin-discovery] Plugins directory not found: ${this.LOCAL_PLUGINS_PATH}`,
        );
        return result;
      }

      // Read all folders in apps/plugins
      const entries = await fs.readdir(this.LOCAL_PLUGINS_PATH, { withFileTypes: true });
      const pluginFolders = entries.filter(
        (entry) => entry.isDirectory() && !entry.name.startsWith("."),
      );

      console.log(`[plugin-discovery] Found ${pluginFolders.length} potential plugin folders`);

      // Process each folder
      for (const folder of pluginFolders) {
        try {
          const discovered = await this.processLocalPluginFolder(folder.name);

          if (discovered) {
            result.discovered++;

            // Compute content hash and upsert
            const registryId = this.computeContentHash(discovered.agx_manifest);
            const inserted = await this.upsertPluginRegistry(registryId, discovered);

            if (inserted) {
              result.new.push(registryId);
            } else {
              result.updated.push(registryId);
            }
          }
        } catch (error) {
          result.errors.push({
            folder: folder.name,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          console.error(`[plugin-discovery] Error processing folder ${folder.name}:`, error);
        }
      }

      console.log("[plugin-discovery] Local discovery completed:", result);
      return result;
    } catch (error) {
      console.error("[plugin-discovery] Local discovery failed:", error);
      throw error;
    }
  }

  /**
   * Process a local plugin folder
   */
  private async processLocalPluginFolder(
    folderName: string,
  ): Promise<DiscoveredPlugin | null> {
    const pluginPath = path.join(this.LOCAL_PLUGINS_PATH, folderName);
    const agxJsonPath = path.join(pluginPath, "agx.json");

    // Check if agx.json exists
    try {
      await fs.access(agxJsonPath);
    } catch {
      console.log(`[plugin-discovery] Skipping ${folderName}: No agx.json found`);
      return null;
    }

    // Read and parse agx.json
    const agxContent = await fs.readFile(agxJsonPath, "utf-8");
    const agxManifest = JSON.parse(agxContent) as AGXManifest;

    // Validate manifest
    this.validateManifest(agxManifest, folderName);

    // Resolve logic path (relative to plugin folder)
    const logicPath = path.join(pluginPath, agxManifest.logic);

    // Check if logic file exists
    try {
      await fs.access(logicPath);
    } catch {
      throw new Error(`Logic file not found: ${agxManifest.logic}`);
    }

    // Convert to file:// URL for local access
    const logicUrl = `file://${logicPath}`;

    return {
      agx_manifest: { ...agxManifest, logic: logicUrl },
      folder_name: folderName,
      source_url: `local://${pluginPath}`,
    };
  }

  /**
   * Discover plugins from GitHub repository (prod mode)
   */
  private async discoverGitHubPlugins(): Promise<DiscoveryResult> {
    const result: DiscoveryResult = {
      discovered: 0,
      updated: [],
      new: [],
      errors: [],
    };

    try {
      // Fetch root directory contents
      const response = await fetch(this.GITHUB_REPO_URL, {
        headers: {
          Accept: "application/vnd.github.v3+json",
          ...(process.env.GITHUB_TOKEN && {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          }),
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const contents = (await response.json()) as Array<{
        name: string;
        type: string;
        path: string;
      }>;

      // Filter for directories (potential plugin folders)
      const pluginFolders = contents.filter(
        (item) => item.type === "dir" && !item.name.startsWith("."),
      );

      console.log(`Found ${pluginFolders.length} potential plugin folders`);

      // Process each folder
      for (const folder of pluginFolders) {
        try {
          const discovered = await this.processGitHubPluginFolder(folder.name, folder.path);

          if (discovered) {
            result.discovered++;

            // Compute content hash and upsert
            const registryId = this.computeContentHash(discovered.agx_manifest);
            const inserted = await this.upsertPluginRegistry(registryId, discovered);

            if (inserted) {
              result.new.push(registryId);
            } else {
              result.updated.push(registryId);
            }
          }
        } catch (error) {
          result.errors.push({
            folder: folder.name,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          console.error(`Error processing folder ${folder.name}:`, error);
        }
      }

      console.log("Plugin discovery completed:", result);
      return result;
    } catch (error) {
      console.error("Plugin discovery failed:", error);
      throw error;
    }
  }

  /**
   * Process a GitHub plugin folder
   */
  private async processGitHubPluginFolder(
    folderName: string,
    folderPath: string,
  ): Promise<DiscoveredPlugin | null> {
    // Fetch agx.json from the folder (lowercase)
    const agxJsonUrl = `${this.GITHUB_RAW_BASE}/${folderPath}/agx.json`;

    const response = await fetch(agxJsonUrl, {
      headers: {
        ...(process.env.GITHUB_TOKEN && {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        }),
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`Skipping ${folderName}: No agx.json found`);
        return null;
      }
      throw new Error(`Failed to fetch agx.json: ${response.status}`);
    }

    const agxManifest = (await response.json()) as AGXManifest;

    // Validate manifest
    this.validateManifest(agxManifest, folderName);

    // Convert logic path to full URL
    const logicUrl = `${this.GITHUB_RAW_BASE}/${folderPath}/${agxManifest.logic}`;

    return {
      agx_manifest: { ...agxManifest, logic: logicUrl },
      folder_name: folderName,
      source_url: `${this.GITHUB_REPO_URL}/../blob/main/${folderPath}`,
    };
  }

  /**
   * Validate agx.json manifest structure
   */
  private validateManifest(manifest: AGXManifest, folderName: string): void {
    const required = ["name", "version", "description", "author", "logic"];

    for (const field of required) {
      if (!(field in manifest)) {
        throw new Error(`Missing required field '${field}' in ${folderName}/agx.json`);
      }
    }
  }

  /**
   * Compute content hash for versioning (SHA256 of AGX.json)
   */
  private computeContentHash(manifest: AGXManifest): string {
    const content = JSON.stringify(manifest, Object.keys(manifest).sort());
    return createHash("sha256").update(content).digest("hex");
  }

  /**
   * Generate provider_id from name and author (slugified)
   */
  private generateProviderId(name: string, author: string): string {
    const slugify = (text: string) =>
      text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return `${slugify(name)}-${slugify(author)}`;
  }

  /**
   * Upsert plugin to registry
   * Returns true if new entry was created, false if updated
   */
  private async upsertPluginRegistry(
    registryId: string,
    discovered: DiscoveredPlugin,
  ): Promise<boolean> {
    const { agx_manifest, source_url } = discovered;

    // Check if exists
    const existing = await db
      .selectFrom("plugin_registry")
      .select("id")
      .where("id", "=", registryId)
      .executeTakeFirst();

    const providerId = this.generateProviderId(agx_manifest.name, agx_manifest.author);

    const registryData: Omit<Insertable<PluginRegistryTable>, "discovered_at"> = {
      id: registryId,
      name: agx_manifest.name,
      version: agx_manifest.version,
      provider_id: providerId,
      author: agx_manifest.author,
      logic_path: agx_manifest.logic,
      agx_manifest: agx_manifest,
      source_url,
      last_validated_at: new Date() as any,
    };

    if (existing) {
      // Update existing entry - exclude auto-generated fields
      const { created_at, updated_at, ...updateData } = registryData;
      await db
        .updateTable("plugin_registry")
        .set({
          ...updateData,
          last_validated_at: sql`CURRENT_TIMESTAMP`,
        })
        .where("id", "=", registryId)
        .execute();

      console.log(`Updated plugin registry: ${agx_manifest.name} (${registryId})`);
      return false;
    } else {
      // Insert new entry
      await db
        .insertInto("plugin_registry")
        .values(registryData as any)
        .execute();

      console.log(`Inserted new plugin: ${agx_manifest.name} (${registryId})`);
      return true;
    }
  }

  /**
   * Get all plugins from registry
   */
  async getAllPlugins() {
    return await db.selectFrom("plugin_registry").selectAll().execute();
  }

  /**
   * Get plugin by ID
   */
  async getPluginById(id: string) {
    return await db
      .selectFrom("plugin_registry")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  }
}

// Export singleton instance
export const pluginDiscoveryService = new PluginDiscoveryService();
