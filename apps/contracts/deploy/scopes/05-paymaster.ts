import type { PublicClient, WalletClient, Address } from "viem";
import { type ScopeResult, deployFromArtifact } from "../utils.js";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { parseEther } from "viem";

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

  // Owner = BUNDLER_EXECUTOR_KEY address (the signer who approves sponsorships)
  const owner = (process.env.BUNDLER_EXECUTOR_ADDRESS ?? config.deployer) as Address;
  console.log(`  EntryPoint: ${entryPoint}`);
  console.log(`  Owner/signer: ${owner}`);

  // 1. Deploy VerifyingPaymaster(entryPoint, verifyingSigner)
  const paymaster = await deployFromArtifact(
    walletClient,
    client,
    "out/VerifyingPaymaster.sol/VerifyingPaymaster.json",
    [entryPoint, owner]
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

  // 3. Stake paymaster — minimal since we run our own bundler
  console.log("  Staking paymaster (0.01 ETH, 1 day unstake delay)...");
  const paymasterAbi = loadAbi("out/VerifyingPaymaster.sol/VerifyingPaymaster.json");
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
