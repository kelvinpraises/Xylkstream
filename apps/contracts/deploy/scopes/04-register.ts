import type { PublicClient, WalletClient, Address } from "viem";
import { type ScopeResult } from "../utils.js";
import { readFileSync } from "fs";
import { join, resolve } from "path";

// apps/contracts/deploy/scopes → apps/contracts
const CONTRACTS_ROOT = resolve(import.meta.dirname, "../..");

function loadAbi(artifactPath: string) {
  return JSON.parse(readFileSync(join(CONTRACTS_ROOT, artifactPath), "utf-8")).abi;
}

export async function deployRegister(
  client: PublicClient,
  walletClient: WalletClient,
  previousScopes: Record<string, ScopeResult>,
  config: { chain: string; rpc: string; deployer: Address }
): Promise<ScopeResult> {
  console.log("Wiring contracts together...");

  const privacy = previousScopes.privacy;
  const streaming = previousScopes.streaming;

  if (privacy?.status !== "completed" || !privacy.contracts) {
    return { status: "failed", error: "Privacy scope not completed" };
  }
  if (streaming?.status !== "completed" || !streaming.contracts) {
    return { status: "failed", error: "Streaming scope not completed" };
  }

  const { mockUSDC, mockUSDT, zwUSDC, zwUSDT } = privacy.contracts as Record<string, Address>;
  const { dripsProxy } = streaming.contracts as Record<string, Address>;

  // DripsRouter ABI — the proxy delegates to DripsRouter which exposes registerZwToken
  const routerAbi = loadAbi("out/DripsRouter.sol/DripsRouter.json");

  // Register zwUSDC (underlying=mockUSDC, zwToken=zwUSDC)
  console.log("  Registering zwUSDC...");
  const hash1 = await walletClient.writeContract({
    address: dripsProxy,
    abi: routerAbi,
    functionName: "registerZwToken",
    args: [mockUSDC, zwUSDC],
  });
  await client.waitForTransactionReceipt({ hash: hash1 });
  console.log("  zwUSDC registered");

  // Register zwUSDT (underlying=mockUSDT, zwToken=zwUSDT)
  console.log("  Registering zwUSDT...");
  const hash2 = await walletClient.writeContract({
    address: dripsProxy,
    abi: routerAbi,
    functionName: "registerZwToken",
    args: [mockUSDT, zwUSDT],
  });
  await client.waitForTransactionReceipt({ hash: hash2 });
  console.log("  zwUSDT registered");

  return {
    status: "completed",
    deployedAt: new Date().toISOString(),
    contracts: {}, // No new contracts — only cross-scope wiring
  };
}
