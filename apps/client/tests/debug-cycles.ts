#!/usr/bin/env tsx
/**
 * Debug script to understand cycle timing on Anvil
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
  console.log("\n=== CYCLE TIMING DEBUG ===\n");
  
  const CYCLE_SECS = await publicClient.readContract({
    address: ADDRESSES.dripsProxy,
    abi: CYCLE_SECS_ABI,
    functionName: "CYCLE_SECS",
  }) as number;
  
  console.log(`CYCLE_SECS: ${CYCLE_SECS}`);
  
  // Get current block
  const block = await publicClient.getBlock();
  const currentTime = Number(block.timestamp);
  
  console.log(`Current block number: ${block.number}`);
  console.log(`Current timestamp: ${currentTime}`);
  
  // Calculate current cycle
  const currentCycle = Math.floor(currentTime / CYCLE_SECS);
  const cycleStart = currentCycle * CYCLE_SECS;
  const cycleEnd = (currentCycle + 1) * CYCLE_SECS;
  const timeIntoCycle = currentTime - cycleStart;
  const timeUntilNextCycle = cycleEnd - currentTime;
  
  console.log(`\nCurrent cycle: ${currentCycle}`);
  console.log(`Cycle start: ${cycleStart}`);
  console.log(`Cycle end: ${cycleEnd}`);
  console.log(`Time into current cycle: ${timeIntoCycle}s`);
  console.log(`Time until next cycle: ${timeUntilNextCycle}s`);
  
  console.log(`\nTo receive streams created NOW:`);
  console.log(`  - Stream starts in cycle ${currentCycle}`);
  console.log(`  - First receivable cycle: ${currentCycle + 1}`);
  console.log(`  - Must wait until timestamp: ${cycleEnd}`);
  console.log(`  - That's ${timeUntilNextCycle}s from now`);
  console.log(`  - With 5s block interval, need ${Math.ceil(timeUntilNextCycle / 5)} more blocks`);
  
  console.log(`\nAnvil auto-mines every 5 seconds`);
  console.log(`To guarantee 1 complete cycle:`);
  console.log(`  - Wait at least ${CYCLE_SECS + 5}s (CYCLE_SECS + 5)`);
  console.log(`  - This ensures we cross a cycle boundary + get a block mined after it`);
}

main().catch(console.error);
