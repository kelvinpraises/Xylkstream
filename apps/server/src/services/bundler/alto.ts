import { spawn, ChildProcess } from "child_process";

export interface AltoConfig {
  entryPointAddress: string;
  rpcUrl: string;
  executorPrivateKey: string;
  port: number;
}

const BASE_PORT = 4337;
const instances = new Map<string, number>();
const processes = new Map<string, ChildProcess>();

export function getAltoPort(chainName: string): number | null {
  return instances.get(chainName) ?? null;
}

export function assignPort(chainName: string): number {
  const existing = instances.get(chainName);
  if (existing) return existing;
  const port = BASE_PORT + instances.size;
  instances.set(chainName, port);
  return port;
}

export async function startAlto(chainName: string, config: AltoConfig): Promise<void> {
  if (instances.has(chainName)) return;

  const port = assignPort(chainName);
  console.log(`[alto]: starting bundler for ${chainName} on port ${port}`);

  const child = spawn("npx", [
    "alto",
    "--entrypoints", config.entryPointAddress,
    "--rpc-url", config.rpcUrl,
    "--executor-private-keys", config.executorPrivateKey,
    "--utility-private-key", config.executorPrivateKey,
    "--port", String(port),
    "--safe-mode", "false",
    "--no-profit-bundling",
    "--log-level", "info",
  ], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  processes.set(chainName, child);

  child.stdout?.on("data", (data: Buffer) => {
    console.log(`[alto:${chainName}]: ${data.toString().trim()}`);
  });

  child.stderr?.on("data", (data: Buffer) => {
    console.error(`[alto:${chainName}]: ${data.toString().trim()}`);
  });

  child.on("exit", (code) => {
    console.error(`[alto]: bundler for ${chainName} exited with code ${code}`);
    instances.delete(chainName);
    processes.delete(chainName);
  });

  // Wait for Alto to bind
  await new Promise((r) => setTimeout(r, 2000));
  console.log(`[alto]: bundler for ${chainName} ready on port ${port}`);
}

process.on("exit", () => {
  for (const [name, child] of processes) {
    console.log(`[alto]: stopping bundler for ${name}`);
    child.kill();
  }
});
