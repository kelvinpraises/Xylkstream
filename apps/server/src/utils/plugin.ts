import { createHash } from "crypto";

import { PluginConfig } from "@/types/plugin";

export function createConfigHash(providerId: string, config: PluginConfig): string {
  const hash = createHash("sha256");
  hash.update(providerId);
  hash.update(JSON.stringify(config, Object.keys(config).sort()));
  return hash.digest("hex");
}
