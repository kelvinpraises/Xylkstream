import { ChildProcess } from "child_process";

import { PluginRegistryTable } from "@/infrastructure/database/schema";

export type PluginConfig = Record<string, any>;

export interface ManagedProcess {
  process: ChildProcess;
  port: number;
  hash: string;
  lastUsed: number;
  tempDir?: string;
}

export type PluginProvider = {
  id: string;
  source: string;
  type: "module" | "script";
  permissions: string[]; // Format: "resource::scope" e.g., "storage::isolated"
};
