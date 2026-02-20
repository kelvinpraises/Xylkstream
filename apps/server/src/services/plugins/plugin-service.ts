import { spawn } from "child_process";
import { promises as fs } from "fs";
import { getRandomPort } from "get-port-please";
import path from "path";
import { fileURLToPath } from "url";

import { db } from "@/infrastructure/database/turso-connection";
import generateCapnp from "@/services/plugins/workerd-capnp-generator";
import { ManagedProcess, PluginConfig } from "@/types/plugin";
import { createConfigHash } from "@/utils/plugin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const activeProcesses = new Map<string, ManagedProcess>();

export const pluginService = {
  async getOrServePlugin(
    accountId: number,
    providerId: string,
    config: PluginConfig,
    streamId?: number,
  ) {
    const hash = createConfigHash(providerId, config);

    if (activeProcesses.has(hash)) {
      console.log(`[plugin-service] Reusing existing worker for hash: ${hash}`);
      const managedProcess = activeProcesses.get(hash)!;
      managedProcess.lastUsed = Date.now();
      activeProcesses.set(hash, managedProcess);
      return { port: managedProcess.port };
    }

    console.log(`[plugin-service] Creating new worker for hash: ${hash}`);
    const registryEntry = await db
      .selectFrom("plugin_registry")
      .selectAll()
      .where("id", "=", providerId)
      .executeTakeFirst();

    if (!registryEntry) {
      throw new Error(`[plugin-service] Provider '${providerId}' not found in registry.`);
    }

    // Resolve logic source (file:// for local, https:// for remote)
    let workerSource: string;
    const logicPath = registryEntry.logic_path;

    if (logicPath.startsWith("file://")) {
      // Local file - read from filesystem
      const filePath = logicPath.replace("file://", "");
      workerSource = await fs.readFile(filePath, "utf-8");
      console.log(`[plugin-service] Loaded local plugin from: ${filePath}`);
    } else {
      // Remote URL - fetch
      const response = await fetch(logicPath);
      if (!response.ok) {
        throw new Error(`Failed to fetch plugin logic: ${response.status}`);
      }
      workerSource = await response.text();
      console.log(`[plugin-service] Fetched remote plugin from: ${logicPath}`);
    }

    // Transform database row to PluginProvider format
    const provider = {
      id: registryEntry.id,
      source: workerSource, // Now contains the actual code, not URL
      type: "module" as const,
      permissions: registryEntry.agx_manifest?.permissions || [],
    };

    const port = await getRandomPort();
    const tempDir = path.join(__dirname, "tmp", hash);
    const capnpConfigPath = path.join(tempDir, "config.capnp");

    try {
      // 1. Generate capnp config
      const capnpContent = await generateCapnp({
        port,
        provider,
        accountId,
        streamId: streamId ?? null,
        rpcUrl: "http://localhost:4848/rpc",
      });
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(capnpConfigPath, capnpContent);
      console.log(`[plugin-service] Generated config at: ${capnpConfigPath}`);

      // 2. Spawn workerd process
      console.log(`[plugin-service] Spawning workerd on port ${port}`);
      
      const workerdProcess = spawn("npx", ["workerd", "serve", capnpConfigPath], {
        stdio: "pipe",
      });

      let stderrBuffer = "";
      
      workerdProcess.stdout.on("data", (data) => {
        const output = data.toString().trim();
        console.log(`[plugin-service] workerd-${hash}-stdout: ${output}`);
      });

      workerdProcess.stderr.on("data", (data) => {
        const output = data.toString();
        stderrBuffer += output;
        console.error(`[plugin-service] workerd-${hash}-stderr: ${output.trim()}`);
      });

      workerdProcess.on("error", (error) => {
        console.error(`[plugin-service] workerd-${hash} process error:`, error);
        activeProcesses.delete(hash);
      });

      workerdProcess.on("exit", (code, signal) => {
        console.log(`[plugin-service] workerd-${hash} exited with code ${code}, signal ${signal}`);
        if (stderrBuffer.trim()) {
          console.error(`[plugin-service] workerd-${hash} stderr output:\n${stderrBuffer.trim()}`);
        }
        activeProcesses.delete(hash);
      });

      const managedProcess: ManagedProcess = {
        process: workerdProcess,
        port,
        hash,
        lastUsed: Date.now(),
        tempDir,
      };
      activeProcesses.set(hash, managedProcess);

      // 3. Wait for workerd to be ready to accept connections
      await this.waitForWorkerdReady(port, hash);

      return { port };
    } catch (error) {
      console.error("[plugin-service] Failed to create worker:", error);
      // Clean up temp dir and process on error
      activeProcesses.delete(hash);
      await fs.rm(tempDir, { recursive: true, force: true });
      throw error;
    }
  },

  async waitForWorkerdReady(port: number, hash: string, maxAttempts = 30): Promise<void> {
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Try to connect to the MCP endpoint (POST /mcp/v1/initialize)
        const response = await fetch(`http://localhost:${port}/mcp/v1/initialize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "health-check", version: "1.0.0" },
            },
          }),
          signal: AbortSignal.timeout(1000),
        });
        
        // Any response (even error) means workerd is running
        if (response.status !== 0) {
          console.log(`[plugin-service] workerd-${hash} is ready on port ${port} (attempt ${attempt})`);
          return;
        }
      } catch (error: any) {
        // Connection refused or timeout - workerd not ready yet
        if (attempt === maxAttempts) {
          throw new Error(`workerd failed to start on port ${port} after ${maxAttempts} attempts. Last error: ${error.message}`);
        }
        if (attempt % 10 === 0) {
          console.log(`[plugin-service] Waiting for workerd-${hash} on port ${port} (attempt ${attempt}/${maxAttempts})...`);
        }
        await delay(100); // Wait 100ms between attempts
      }
    }
  },

  async cleanupUnusedPlugins() {
    const now = Date.now();
    const maxLifetime = 20 * 60 * 1000; // 20 minutes

    console.log("Running cleanup for unused plugins...");
    for (const [hash, managedProcess] of activeProcesses.entries()) {
      if (now - managedProcess.lastUsed > maxLifetime) {
        console.log(
          `Terminating stale worker (hash: ${hash}, port: ${managedProcess.port})`,
        );
        managedProcess.process.kill("SIGTERM");

        // Clean up temp directory after process termination
        if (managedProcess.tempDir) {
          try {
            await fs.rm(managedProcess.tempDir, { recursive: true, force: true });
            console.log(`Cleaned up temp directory: ${managedProcess.tempDir}`);
          } catch (error) {
            console.error(
              `Failed to clean up temp directory ${managedProcess.tempDir}:`,
              error,
            );
          }
        }

        activeProcesses.delete(hash);
      }
    }
    console.log("Cleanup finished.");
  },
};
