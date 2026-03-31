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

  if (!process.env.OPERATOR_ADDRESS) {
    throw new Error(
      `OPERATOR_ADDRESS is required to deploy the paymaster.\n` +
      `It must match the key the server uses to sign UserOps (OPERATOR_KEY).\n\n` +
      `  OPERATOR_ADDRESS=0x... DEPLOYER_PRIVATE_KEY=0x... npm run deploy -- --name ${config.chain}\n\n` +
      `Without this, the paymaster's verifyingSigner will not match the server's signing key → AA34 at runtime.`
    );
  }
  const verifyingSigner = process.env.OPERATOR_ADDRESS as Address;
  console.log(`  EntryPoint: ${entryPoint}`);
  console.log(`  Verifying signer: ${verifyingSigner}`);

  // 1. Deploy VerifyingPaymaster(entryPoint, verifyingSigner)
  // XylkPaymaster: explicit owner (deployer) + verifyingSigner (executor)
  // Needed because CREATE2 sets msg.sender = factory, not deployer
  const paymaster = await deployFromArtifact(
    walletClient, client,
    "out/XylkPaymaster.sol/XylkPaymaster.json",
    [entryPoint, verifyingSigner, config.deployer],
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
