#!/usr/bin/env tsx
/**
 * Quick timing verification script
 * Run this to verify Anvil is mining blocks and cycles are progressing
 */

import { createPublicClient, http } from "viem";
import { anvil } from "viem/chains";

const ADDRESSES = {
  dripsProxy: "0x9a676e781a523b5d0c0e43731313a708cb607508" as `0x${string}`,
};

const CYCLE_SECS_ABI = [
  {
    type: "function",
    name: "CYCLE_SECS",
    inputs: [],
    outputs: [{ type: "uint32" }],
    stateMutability: "view",
  },
] as const;

const publicClient = createPublicClient({
  chain: anvil,
  transport: http("http://127.0.0.1:8545"),
});

async function main() {
  console.log("\n=== TIMING VERIFICATION ===\n");
  
  const CYCLE_SECS = await publicClient.readContract({
    address: ADDRESSES.dripsProxy,
    abi: CYCLE_SECS_ABI,
    functionName: "CYCLE_SECS",
  }) as number;
  
  console.log(`CYCLE_SECS: ${CYCLE_SECS}`);
  
  // Sample 3 blocks over 15 seconds
  for (let i = 0; i < 3; i++) {
    const block = await publicClient.getBlock();
    const currentTime = Number(block.timestamp);
    const currentCycle = Math.floor(currentTime / CYCLE_SECS);
    
    console.log(`\nSample ${i + 1}:`);
    console.log(`  Block: ${block.number}`);
    console.log(`  Timestamp: ${currentTime}`);
    console.log(`  Cycle: ${currentCycle}`);
    
    if (i < 2) {
      console.log(`  Waiting 7 seconds...`);
      await new Promise(r => setTimeout(r, 7000));
    }
  }
  
  console.log(`\n✓ If blocks and timestamps are increasing, Anvil is mining correctly`);
  console.log(`✓ Tests should wait 3*CYCLE_SECS (${3 * CYCLE_SECS}s) to guarantee cycle completion\n`);
}

main().catch(console.error);
