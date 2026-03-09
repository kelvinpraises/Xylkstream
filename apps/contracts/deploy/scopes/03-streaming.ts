import { readFileSync } from "fs";
import { join, resolve } from "path";
import type { Address, PublicClient, WalletClient } from "viem";
import { deployFromArtifact, type ScopeResult } from "../utils.js";

const CONTRACTS_ROOT = resolve(import.meta.dirname, "../..");

function loadAbi(artifactPath: string): any[] {
  return JSON.parse(readFileSync(join(CONTRACTS_ROOT, artifactPath), "utf-8")).abi;
}

export async function deployStreaming(
  client: PublicClient,
  walletClient: WalletClient,
  _previousScopes: Record<string, ScopeResult>,
  config: { chain: string; rpc: string; deployer: Address }
): Promise<ScopeResult> {
  const { deployer } = config;

  try {
    const deployedAt = new Date().toISOString();

    // 1. DripsFacetA — constructor: (cycleSecs = 10)
    console.log("\n[03-streaming] Deploying DripsFacetA...");
    const facetA = await deployFromArtifact(
      walletClient,
      client,
      "out/DripsFacetA.sol/DripsFacetA.json",
      [10]
    );

    // 2. DripsFacetB — no constructor args
    console.log("[03-streaming] Deploying DripsFacetB...");
    const facetB = await deployFromArtifact(
      walletClient,
      client,
      "out/DripsFacetB.sol/DripsFacetB.json"
    );

    // 3. DripsRouter — constructor: (facetA, facetB, 0, deployer)
    console.log("[03-streaming] Deploying DripsRouter...");
    const router = await deployFromArtifact(
      walletClient,
      client,
      "out/DripsRouter.sol/DripsRouter.json",
      [facetA, facetB, 0, deployer]
    );

    // 4. ManagedProxy for Drips — constructor: (router, deployer, "")
    console.log("[03-streaming] Deploying ManagedProxy (Drips)...");
    const dripsProxy = await deployFromArtifact(
      walletClient,
      client,
      "out/Managed.sol/ManagedProxy.json",
      [router, deployer, "0x"]
    );
    console.log(`  dripsProxy → ${dripsProxy}`);

    // 5. Caller — no constructor args
    console.log("[03-streaming] Deploying Caller...");
    const caller = await deployFromArtifact(
      walletClient,
      client,
      "out/Caller.sol/Caller.json"
    );

    // Load IDrips ABI for registerDriver / updateDriverAddress calls
    const iDripsAbi = loadAbi("out/IDrips.sol/IDrips.json");

    // 6a. registerDriver(address(1)) — driver ID 0
    console.log("[03-streaming] Registering dummy driver 0 (address(1))...");
    await client.waitForTransactionReceipt({
      hash: await walletClient.writeContract({
        address: dripsProxy,
        abi: iDripsAbi,
        functionName: "registerDriver",
        args: ["0x0000000000000000000000000000000000000001"],
      }),
    });

    // 6b. registerDriver(address(1)) — driver ID 1
    console.log("[03-streaming] Registering dummy driver 1 (address(1))...");
    await client.waitForTransactionReceipt({
      hash: await walletClient.writeContract({
        address: dripsProxy,
        abi: iDripsAbi,
        functionName: "registerDriver",
        args: ["0x0000000000000000000000000000000000000001"],
      }),
    });

    // 6c. registerDriver(deployer) — driver ID 2 (AddressDriver slot)
    console.log("[03-streaming] Registering AddressDriver slot (driver ID 2)...");
    await client.waitForTransactionReceipt({
      hash: await walletClient.writeContract({
        address: dripsProxy,
        abi: iDripsAbi,
        functionName: "registerDriver",
        args: [deployer],
      }),
    });

    const driverId = 2;

    // 7. AddressDriver logic — constructor: (dripsProxy, caller, driverId)
    console.log("[03-streaming] Deploying AddressDriver logic...");
    const addressDriverLogic = await deployFromArtifact(
      walletClient,
      client,
      "out/AddressDriver.sol/AddressDriver.json",
      [dripsProxy, caller, driverId]
    );

    // 8. ManagedProxy for AddressDriver — constructor: (addressDriverLogic, deployer, "")
    console.log("[03-streaming] Deploying ManagedProxy (AddressDriver)...");
    const addressDriverProxy = await deployFromArtifact(
      walletClient,
      client,
      "out/Managed.sol/ManagedProxy.json",
      [addressDriverLogic, deployer, "0x"]
    );
    console.log(`  addressDriverProxy → ${addressDriverProxy}`);

    // 9. Update driver address: dripsProxy.updateDriverAddress(2, addressDriverProxy)
    console.log("[03-streaming] Updating driver address for ID 2...");
    await client.waitForTransactionReceipt({
      hash: await walletClient.writeContract({
        address: dripsProxy,
        abi: iDripsAbi,
        functionName: "updateDriverAddress",
        args: [driverId, addressDriverProxy],
      }),
    });

    // 10. YieldManager — constructor: (dripsProxy)
    console.log("[03-streaming] Deploying YieldManager...");
    const yieldManager = await deployFromArtifact(
      walletClient,
      client,
      "out/YieldManager.sol/YieldManager.json",
      [dripsProxy]
    );

    console.log("\n[03-streaming] All contracts deployed successfully.");

    return {
      status: "completed",
      deployedAt,
      contracts: {
        facetA,
        facetB,
        router,
        dripsProxy,
        caller,
        addressDriverLogic,
        addressDriverProxy,
        yieldManager,
      },
    };
  } catch (err: any) {
    console.error("[03-streaming] Deployment failed:", err);
    return {
      status: "failed",
      error: err?.message ?? String(err),
    };
  }
}
