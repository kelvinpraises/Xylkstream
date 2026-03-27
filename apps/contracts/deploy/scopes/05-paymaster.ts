import type { PublicClient, WalletClient, Address, Hex } from "viem";
import { createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { type ScopeResult, deployFromArtifact } from "../utils.js";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const CONTRACTS_ROOT = resolve(import.meta.dirname, "../..");

function loadAbi(artifactPath: string) {
  return JSON.parse(readFileSync(join(CONTRACTS_ROOT, artifactPath), "utf-8")).abi;
}

export async function deployPaymaster(
  client: PublicClient,
  walletClient: WalletClient,
  previousScopes: Record<string, ScopeResult>,
  config: { chain: string; rpc: string; deployer: Address }
): Promise<ScopeResult> {
  console.log("Deploying VerifyingPaymaster...");

  const aa = previousScopes.aa;
  if (aa?.status !== "completed" || !aa.contracts) {
    return { status: "failed", error: "AA scope not completed" };
  }

  const entryPoint = aa.contracts.entryPoint as Address;

  // Owner/signer = OPERATOR_ADDRESS (same key does deploying, bundling, and paymaster signing)
  const owner = (process.env.OPERATOR_ADDRESS ?? config.deployer) as Address;
  console.log(`  EntryPoint: ${entryPoint}`);
  console.log(`  Owner/signer: ${owner}`);

  // 1. Deploy VerifyingPaymaster(entryPoint, verifyingSigner)
  // XylkPaymaster: explicit owner (deployer) + verifyingSigner (executor)
  // Needed because CREATE2 sets msg.sender = factory, not deployer
  const paymaster = await deployFromArtifact(
    walletClient, client,
    "out/XylkPaymaster.sol/XylkPaymaster.json",
    [entryPoint, owner, config.deployer],
    undefined, "xylkstream.verifyingPaymaster"
  );

  // 2. Fund paymaster on EntryPoint — actual gas fund
  console.log("  Funding paymaster (0.05 ETH deposit)...");
  const epAbi = loadAbi("out/EntryPoint.sol/EntryPoint.json");
  const depositHash = await walletClient.writeContract({
    address: entryPoint,
    abi: epAbi,
    functionName: "depositTo",
    args: [paymaster],
    value: parseEther("0.05"),
  });
  await client.waitForTransactionReceipt({ hash: depositHash });
  console.log("  ✓ Deposited 0.05 ETH");

  // 3. Stake paymaster — owner is msg.sender at deploy time (deployer key)
  console.log("  Staking paymaster (0.01 ETH, 1 day unstake delay)...");
  const paymasterAbi = loadAbi("out/XylkPaymaster.sol/XylkPaymaster.json");
  const stakeHash = await walletClient.writeContract({
    address: paymaster,
    abi: paymasterAbi,
    functionName: "addStake",
    args: [86400],
    value: parseEther("0.01"),
  });
  await client.waitForTransactionReceipt({ hash: stakeHash });
  console.log("  ✓ Staked 0.01 ETH");

  return {
    status: "completed",
    deployedAt: new Date().toISOString(),
    contracts: {
      verifyingPaymaster: paymaster,
    },
  };
}
