import { createPublicClient, createWalletClient, http, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";

// Types
export type ScopeResult = {
  status: "completed" | "failed";
  deployedAt?: string;
  contracts?: Record<string, string>;
  error?: string;
};

export type DeployState = {
  chain: string;
  chainId: number;
  rpc: string;
  deployedAt: string;
  deployer: string;
  scopes: Record<string, ScopeResult>;
};

export type ScopeFn = (
  client: PublicClient,
  walletClient: WalletClient,
  previousScopes: Record<string, ScopeResult>,
  config: { chain: string; rpc: string; deployer: Address }
) => Promise<ScopeResult>;

// Viem client factory
export function createClients(rpc: string, deployerKey: Hex) {
  const account = privateKeyToAccount(deployerKey);
  const transport = http(rpc);
  const publicClient = createPublicClient({ transport });
  const walletClient = createWalletClient({ account, transport });
  return { publicClient, walletClient, account };
}

// Paths
const CONTRACTS_ROOT = resolve(import.meta.dirname, "..");
const OUTPUT_DIR = resolve(import.meta.dirname, "output");

// Check if contract exists at address
export async function isDeployed(client: PublicClient, address: Address): Promise<boolean> {
  const code = await client.getCode({ address });
  return !!code && code !== "0x";
}

// Read forge artifact and deploy via viem
export async function deployFromArtifact(
  walletClient: WalletClient,
  publicClient: PublicClient,
  artifactPath: string,
  constructorArgs?: any[],
  libraries?: Record<string, Address>
): Promise<Address> {
  const fullPath = join(CONTRACTS_ROOT, artifactPath);
  const artifact = JSON.parse(readFileSync(fullPath, "utf-8"));
  let bytecode: Hex = artifact.bytecode.object;

  // Link libraries if needed
  if (libraries) {
    for (const [placeholder, addr] of Object.entries(libraries)) {
      // Forge uses __$<keccak256(fqn)[:34]>$__ as placeholder
      // But we can also do simple string replacement on the library path hash
      const clean = addr.slice(2).toLowerCase();
      // Replace all library placeholders matching this address
      bytecode = bytecode.replace(new RegExp(`__\\$[a-f0-9]{34}\\$__`, "g"), clean) as Hex;
    }
  }

  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode,
    args: constructorArgs ?? [],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error(`Deploy failed for ${artifactPath}`);
  console.log(`  Deployed ${artifactPath} → ${receipt.contractAddress}`);
  return receipt.contractAddress;
}

// Deploy raw bytecode (for contracts from npm packages like Safe)
export async function deployBytecode(
  walletClient: WalletClient,
  publicClient: PublicClient,
  bytecode: Hex,
  abi?: any[],
  constructorArgs?: any[]
): Promise<Address> {
  const hash = await walletClient.deployContract({
    abi: abi ?? [],
    bytecode,
    args: constructorArgs ?? [],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error("Deploy failed for raw bytecode");
  console.log(`  Deployed raw bytecode → ${receipt.contractAddress}`);
  return receipt.contractAddress;
}

// Read output state
export function readState(name: string): DeployState | null {
  const filePath = join(OUTPUT_DIR, `${name}.json`);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

// Write output state (creates output dir if needed)
export function writeState(name: string, state: DeployState): void {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  const filePath = join(OUTPUT_DIR, `${name}.json`);
  writeFileSync(filePath, JSON.stringify(state, null, 2) + "\n");
  console.log(`  State saved → ${filePath}`);
}
