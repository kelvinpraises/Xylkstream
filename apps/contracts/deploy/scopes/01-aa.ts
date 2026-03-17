import type { PublicClient, WalletClient, Address, Hex } from "viem";
import { type ScopeResult, isDeployed, deployFromArtifact } from "../utils.js";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const CONTRACTS_ROOT = resolve(import.meta.dirname, "../..");

// Nick's deterministic deployer — present on Anvil and most EVM chains
const DETERMINISTIC_DEPLOYER = "0x4e59b44847b379578588920cA78FbF26c0B4956C" as Address;
// Salt used by eth-infinitism to deploy EntryPoint v0.7 at canonical address
const ENTRYPOINT_SALT = "0x90d8084deab30c2a37c45e8d47f49f2f7965183cb6990a98943ef94940681de3" as Hex;

// Known deterministic addresses (may already be deployed on some chains)
const KNOWN_ADDRESSES: Record<string, Address> = {
  entryPoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  safeProxyFactory: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
  safeSingleton: "0x41675C099F32341bf84BFc5382aF534df5C7461a",
  safe4337Module: "0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226",
  safeModuleSetup: "0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB3b47",
};

// Artifact paths (compiled by Forge from git deps)
const ARTIFACTS: Record<string, { path: string; args?: any[] }> = {
  entryPoint: { path: "out/EntryPoint.sol/EntryPoint.json" },
  safeSingleton: { path: "out/Safe.sol/Safe.json" },
  safeProxyFactory: { path: "out/SafeProxyFactory.sol/SafeProxyFactory.json" },
  safe4337Module: {
    path: "out/Safe4337Module.sol/Safe4337Module.json",
    // Constructor takes EntryPoint address — filled dynamically
  },
  safeModuleSetup: {
    path: "out/SafeModuleSetup.sol/SafeModuleSetup.json",
  },
  multiSend: {
    path: "out/MultiSend.sol/MultiSend.json",
  },
  multiSendCallOnly: {
    path: "out/MultiSendCallOnly.sol/MultiSendCallOnly.json",
  },
  fallbackHandler: {
    path: "out/CompatibilityFallbackHandler.sol/CompatibilityFallbackHandler.json",
  },
  signMessageLib: {
    path: "out/SignMessageLib.sol/SignMessageLib.json",
  },
  createCall: {
    path: "out/CreateCall.sol/CreateCall.json",
  },
  simulateTxAccessor: {
    path: "out/SimulateTxAccessor.sol/SimulateTxAccessor.json",
  },
};

export async function deployAA(
  client: PublicClient,
  walletClient: WalletClient,
  previousScopes: Record<string, ScopeResult>,
  config: { chain: string; rpc: string; deployer: Address }
): Promise<ScopeResult> {
  console.log("Deploying AA infrastructure...");
  const contracts: Record<string, string> = {};

  // Deploy order matters: EntryPoint first (Safe4337Module depends on it)
  const deployOrder = [
    "entryPoint", "safeSingleton", "safeProxyFactory", "safeModuleSetup", "safe4337Module",
    "multiSend", "multiSendCallOnly", "fallbackHandler", "signMessageLib", "createCall", "simulateTxAccessor",
  ];

  for (const name of deployOrder) {
    const known = KNOWN_ADDRESSES[name];

    // Check if already deployed at known address
    if (known && await isDeployed(client, known)) {
      console.log(`  ✓ ${name} already at ${known}`);
      contracts[name] = known;
      continue;
    }

    // EntryPoint MUST be at canonical address — relay-kit checks the exact address.
    // Deploy via CREATE2 using nick's factory with the original Hardhat-compiled initcode
    // and the exact salt eth-infinitism used. Works on any EVM chain.
    if (name === "entryPoint") {
      const canonical = KNOWN_ADDRESSES.entryPoint;
      console.log(`  Deploying EntryPoint v0.7 via CREATE2 at canonical ${canonical}...`);

      // Load the original Hardhat-compiled initcode (from @account-abstraction/contracts@0.7.0 npm)
      const epArtifact = JSON.parse(readFileSync(join(import.meta.dirname, "../entrypoint-v07-initcode.json"), "utf-8"));
      const initcode = epArtifact.bytecode as Hex;

      // Send salt + initcode to nick's deterministic deployer
      const hash = await walletClient.sendTransaction({
        to: DETERMINISTIC_DEPLOYER,
        data: (ENTRYPOINT_SALT + initcode.slice(2)) as Hex,
        gas: 6_000_000n,
      });
      await client.waitForTransactionReceipt({ hash });

      if (await isDeployed(client, canonical)) {
        console.log(`  ✓ ${name} deployed at canonical ${canonical}`);
        contracts[name] = canonical;
      } else {
        throw new Error(`EntryPoint CREATE2 did not produce canonical address ${canonical}`);
      }
      continue;
    }

    // Deploy from artifact
    console.log(`  Deploying ${name}...`);
    const artifact = ARTIFACTS[name];
    let args = artifact.args;

    // Safe4337Module needs EntryPoint address
    if (name === "safe4337Module") {
      args = [contracts.entryPoint];
    }

    const addr = await deployFromArtifact(walletClient, client, artifact.path, args, undefined, `xylkstream.${name}`);
    contracts[name] = addr;
  }

  return {
    status: "completed",
    deployedAt: new Date().toISOString(),
    contracts,
  };
}
