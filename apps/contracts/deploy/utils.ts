import { createPublicClient, createWalletClient, http, encodeAbiParameters, parseAbiParameters, keccak256, toHex, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";

// Nick's deterministic deployer — present on Anvil and most EVM chains
export const DETERMINISTIC_DEPLOYER = "0x4e59b44847b379578588920cA78FbF26c0B4956C" as Address;

// Compute a fixed salt from a human-readable label
export function labelSalt(label: string): Hex {
  return keccak256(toHex(label));
}

// Compute the CREATE2 address without deploying
export function computeCreate2Address(
  salt: Hex,
  initcode: Hex,
): Address {
  const initcodeHash = keccak256(initcode);
  const factory = DETERMINISTIC_DEPLOYER.slice(2).toLowerCase();
  const payload = `0xff${factory}${salt.slice(2)}${initcodeHash.slice(2)}`;
  const hash = keccak256(payload as Hex);
  return `0x${hash.slice(26)}` as Address;
}

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

// Build initcode = bytecode + abi-encoded constructor args
function buildInitcode(
  artifact: any,
  constructorArgs?: any[],
  libraries?: Record<string, Address>
): Hex {
  let bytecode: Hex = artifact.bytecode.object;

  // Link libraries: replace __$<hash>$__ placeholders
  if (libraries) {
    for (const addr of Object.values(libraries)) {
      const clean = addr.slice(2).toLowerCase();
      bytecode = bytecode.replace(new RegExp(`__\\$[a-f0-9]{34}\\$__`, "g"), clean) as Hex;
    }
  }

  if (!constructorArgs || constructorArgs.length === 0) return bytecode;

  // Encode constructor args
  const ctorInputs = artifact.abi.filter((x: any) => x.type === "constructor")[0]?.inputs ?? [];
  const encoded = encodeAbiParameters(ctorInputs, constructorArgs);
  return (bytecode + encoded.slice(2)) as Hex;
}

// Deploy a contract deterministically via CREATE2.
// Same label + same bytecode + same args = same address on every chain.
// If already deployed at the computed address, skips silently.
export async function deployFromArtifact(
  walletClient: WalletClient,
  publicClient: PublicClient,
  artifactPath: string,
  constructorArgs?: any[],
  libraries?: Record<string, Address>,
  label?: string,
): Promise<Address> {
  const fullPath = join(CONTRACTS_ROOT, artifactPath);
  const artifact = JSON.parse(readFileSync(fullPath, "utf-8"));
  const initcode = buildInitcode(artifact, constructorArgs, libraries);

  // Default label = artifact filename without path/extension
  const salt = labelSalt(label ?? artifactPath);
  const predicted = computeCreate2Address(salt, initcode);

  // Skip if already deployed
  if (await isDeployed(publicClient, predicted)) {
    console.log(`  ✓ ${label ?? artifactPath} already at ${predicted}`);
    return predicted;
  }

  // Deploy via nick's factory: salt + initcode as calldata
  const hash = await walletClient.sendTransaction({
    to: DETERMINISTIC_DEPLOYER,
    data: (salt + initcode.slice(2)) as Hex,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.status || receipt.status === "reverted") {
    throw new Error(`CREATE2 deploy failed for ${label ?? artifactPath}`);
  }

  // Verify
  if (!(await isDeployed(publicClient, predicted))) {
    throw new Error(`CREATE2 deploy did not land at predicted address ${predicted}`);
  }

  console.log(`  Deployed ${label ?? artifactPath} → ${predicted}`);
  return predicted;
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
