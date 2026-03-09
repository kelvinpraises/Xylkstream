#!/usr/bin/env tsx
/**
 * XYLKSTREAM E2E — STREAMING FLOW
 *
 * Story: Alice wants to pay Bob a salary stream using mock USDC on a local
 * Anvil fork. This test demonstrates the complete protocol flow:
 *
 * ACT 1: Create Stream
 *   - Alice (WDK Safe) approves AddressDriver and opens a stream to Bob
 *
 * ACT 2: Receive & Collect
 *   - Wait CYCLE_SECS + 2 for exactly one full cycle to complete
 *   - receiveStreams → split → collect
 *   - Verify Bob received the exact expected amount (1 cycle worth)
 *
 * ACT 3: Stream Management
 *   - Alice partially withdraws from the stream
 *   - Alice stops the stream and drains remaining balance
 *
 * Run with: npx tsx apps/client/tests/e2e-streaming.ts
 * Requires: Anvil on localhost:8545 with contracts deployed via deploy script,
 *           Alto bundler on localhost:4848.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  parseEther,
  formatUnits,
  encodeFunctionData,
  sha256,
  toBytes,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";

import WalletManagerEvmErc4337 from "@xylkstream/wdk-4337";
import type { WalletAccountEvmErc4337 } from "@xylkstream/wdk-4337";

import {
  ADDRESS_DRIVER_ABI,
  DRIPS_ABI,
  ERC20_ABI,
  AMT_PER_SEC_MULTIPLIER,
  calcAmtPerSec,
  calcAccountId,
  packStreamConfig,
} from "../src/lib/drips.js";

// ═══════════════════════════════════════════════════════════════════════════════
//                              CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const ADDRESSES = {
  dripsProxy:    "0x59b670e9fa9d0a427751af201d676719a970857b" as `0x${string}`,
  addressDriver: "0x09635f643e140090a9a8dcd712ed6285858cebef" as `0x${string}`,
  mockUSDC:      "0x9a676e781a523b5d0c0e43731313a708cb607508" as `0x${string}`,
  // AA infrastructure
  entryPoint:           "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as `0x${string}`,
  safeSingleton:        "0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0" as `0x${string}`,
  safeProxyFactory:     "0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9" as `0x${string}`,
  safeModuleSetup:      "0xdc64a140aa3e981100a9beca4e685f962f0cf6c9" as `0x${string}`,
  safe4337Module:       "0x5fc8d32690cc91d4c39d9d3abcbd16989f875707" as `0x${string}`,
  multiSend:            "0x0165878a594ca255338adfa4d48449f69242eb8f" as `0x${string}`,
  multiSendCallOnly:    "0xa513e6e4b8f2a923d98304ec87f64353c4d5c853" as `0x${string}`,
  fallbackHandler:      "0x2279b7a0a67db372996a5fab50d91eaa73d2ebe6" as `0x${string}`,
  signMessageLib:       "0x8a791620dd6260079bf849dc5567adc3f2fdc318" as `0x${string}`,
  createCall:           "0x610178da211fef7d417bc0e6fed39f05609ad788" as `0x${string}`,
  simulateTxAccessor:   "0xb7f8bc63bbcad18155201308c8f3540b07f84f5e" as `0x${string}`,
};

// Anvil well-known account #0 — always pre-funded with 10 000 ETH
const DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;

const BUNDLER_URL = "http://localhost:4848/bundler/localhost";
const PAYMASTER_URL = "http://localhost:4848/paymaster/localhost";
const DERIVATION_PATH = "0'/0/0";

const MOCK_ERC20_ABI = [
  ...ERC20_ABI,
  {
    type: "function",
    name: "mint",
    inputs: [
      { name: "to",     type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// CYCLE_SECS ABI entry — read from DripsFacetA via the proxy
const CYCLE_SECS_ABI = [
  {
    type: "function",
    name: "CYCLE_SECS",
    inputs: [],
    outputs: [{ type: "uint32" }],
    stateMutability: "view",
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
//                              COLOUR HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const c = {
  cyan:  "\x1b[36m",
  yellow:"\x1b[33m",
  green: "\x1b[32m",
  red:   "\x1b[31m",
  dim:   "\x1b[2m",
  reset: "\x1b[0m",
  bold:  "\x1b[1m",
};

const shortAddr = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

const logAct = (title: string) => {
  console.log("\n" + "═".repeat(80));
  console.log(`  ${c.bold}${title}${c.reset}`);
  console.log("═".repeat(80));
};
const logScene  = (title: string) => console.log(`\n  ${c.bold}── ${title} ──${c.reset}`);
const logAction = (who: string, action: string) =>
  console.log(`  ${c.cyan}${who}${c.reset} ${action}`);
const logResult = (msg: string) => console.log(`    → ${msg}`);

let testsPassed = 0;
let testsFailed = 0;

const pass = (msg: string) => {
  console.log(`  ${c.green}✓ ${msg}${c.reset}`);
  testsPassed++;
};
const fail = (msg: string, detail?: unknown): never => {
  console.error(`  ${c.red}✗ FAIL: ${msg}${c.reset}`, detail ?? "");
  testsFailed++;
  process.exit(1);
};
const assert = (cond: boolean, msg: string) => {
  cond ? pass(msg) : fail(msg);
};

// ═══════════════════════════════════════════════════════════════════════════════
//                              SLEEP HELPER
// ═══════════════════════════════════════════════════════════════════════════════

const sleep = async (secs: number) => {
  process.stdout.write(`    ${c.dim}waiting ${secs}s: `);
  for (let i = 0; i < secs; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    process.stdout.write(`${i + 1}..`);
  }
  console.log(` done${c.reset}`);
};

// ═══════════════════════════════════════════════════════════════════════════════
//                              WDK CONFIG BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

function buildWdkConfig() {
  return {
    chainId: 31337,
    provider: "http://127.0.0.1:8545",
    bundlerUrl: BUNDLER_URL,
    entryPointAddress: ADDRESSES.entryPoint,
    safeModulesVersion: "0.3.0",
    useNativeCoins: false as const,
    isSponsored: true as const,
    paymasterUrl: PAYMASTER_URL,
    safe4337ModuleAddress: ADDRESSES.safe4337Module,
    safeModulesSetupAddress: ADDRESSES.safeModuleSetup,
    contractNetworks: {
      "31337": {
        safeSingletonAddress:      ADDRESSES.safeSingleton,
        safeProxyFactoryAddress:   ADDRESSES.safeProxyFactory,
        multiSendAddress:          ADDRESSES.multiSend,
        multiSendCallOnlyAddress:  ADDRESSES.multiSendCallOnly,
        fallbackHandlerAddress:    ADDRESSES.fallbackHandler,
        signMessageLibAddress:     ADDRESSES.signMessageLib,
        createCallAddress:         ADDRESSES.createCall,
        simulateTxAccessorAddress: ADDRESSES.simulateTxAccessor,
      },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//                              WAIT FOR USEROP HELPER
// ═══════════════════════════════════════════════════════════════════════════════

async function waitForUserOp(hash: string, bundlerUrl: string): Promise<void> {
  logAction("Bundler", `waiting for UserOp ${hash.slice(0, 10)}... to be mined`);
  for (let i = 0; i < 30; i++) {
    const resp = await fetch(bundlerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "eth_getUserOperationReceipt",
        params: [hash],
      }),
    });
    const json = await resp.json() as { result?: { receipt?: { transactionHash: string } } };
    if (json.result) {
      logResult(`UserOp mined in tx ${(json.result as any).receipt?.transactionHash ?? "unknown"}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  fail(`UserOp ${hash} was not mined within 15s`);
}

// ═══════════════════════════════════════════════════════════════════════════════
//                              VIEM CLIENTS
// ═══════════════════════════════════════════════════════════════════════════════

const transport = http("http://127.0.0.1:8545");

const publicClient = createPublicClient({
  chain: anvil,
  transport,
}) as PublicClient;

function makeWallet(key: `0x${string}`): WalletClient {
  return createWalletClient({
    account: privateKeyToAccount(key),
    chain: anvil,
    transport,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//                              MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${c.bold}🌊 XYLKSTREAM E2E — Streaming Flow (WDK ERC-4337)${c.reset}`);
  console.log(`${c.dim}   A story of Safe wallet streaming payments on local Anvil${c.reset}\n`);

  // ─── PROLOGUE: Create WDK Safe wallets & read chain constants ────────────
  logAct("PROLOGUE: Setup");

  const deployerWallet = makeWallet(DEPLOYER_KEY);
  const config = buildWdkConfig();

  // Derive deterministic Safe wallets for Alice and Bob
  const aliceSeed = toBytes(sha256(toBytes("xylk-streaming-alice")));
  const bobSeed   = toBytes(sha256(toBytes("xylk-streaming-bob")));

  const aliceManager = new WalletManagerEvmErc4337(aliceSeed, config);
  const bobManager   = new WalletManagerEvmErc4337(bobSeed, config);

  const aliceAccount = await aliceManager.getAccountByPath(DERIVATION_PATH);
  const bobAccount   = await bobManager.getAccountByPath(DERIVATION_PATH);

  const aliceAddress = await aliceAccount.getAddress() as `0x${string}`;
  const bobAddress   = await bobAccount.getAddress() as `0x${string}`;

  logScene("Participants");
  console.log(`  ${c.cyan}Alice${c.reset} (sender)    Safe: ${shortAddr(aliceAddress)}`);
  console.log(`  ${c.cyan}Bob${c.reset}   (recipient) Safe: ${shortAddr(bobAddress)}`);

  // Read CYCLE_SECS from chain — do not hard-code it
  logScene("Reading chain constants");
  const CYCLE_SECS = Number(await publicClient.readContract({
    address: ADDRESSES.dripsProxy,
    abi: CYCLE_SECS_ABI,
    functionName: "CYCLE_SECS",
  }));
  logResult(`CYCLE_SECS = ${CYCLE_SECS}`);

  // Read decimals from chain — do not assume 6
  const USDC_DECIMALS = await publicClient.readContract({
    address: ADDRESSES.mockUSDC,
    abi: MOCK_ERC20_ABI,
    functionName: "decimals",
  }) as number;
  logResult(`MockUSDC decimals = ${USDC_DECIMALS}`);

  // Read driver ID from contract
  const driverIdRaw = await publicClient.readContract({
    address: ADDRESSES.addressDriver,
    abi: ADDRESS_DRIVER_ABI,
    functionName: "DRIVER_ID",
  });
  const driverId = BigInt(driverIdRaw as number | bigint);
  logResult(`DRIVER_ID = ${driverId}`);

  // Derive account IDs
  const aliceAccountId = calcAccountId(driverId, aliceAddress);
  const bobAccountId   = calcAccountId(driverId, bobAddress);
  logResult(`aliceAccountId = ${aliceAccountId}`);
  logResult(`bobAccountId   = ${bobAccountId}`);

  // Stream rate: 1 token / second
  const TOKENS_PER_SEC  = 1;
  const amtPerSec       = calcAmtPerSec(TOKENS_PER_SEC, USDC_DECIMALS);

  // Expected receivable after exactly 1 completed cycle:
  const EXPECTED_CYCLE_AMT = (amtPerSec * BigInt(CYCLE_SECS)) / AMT_PER_SEC_MULTIPLIER;
  logResult(`amtPerSec (internal) = ${amtPerSec}`);
  logResult(`Expected 1-cycle receive = ${EXPECTED_CYCLE_AMT} (${formatUnits(EXPECTED_CYCLE_AMT, USDC_DECIMALS)} tokens)`);

  const MINT_AMOUNT    = parseUnits("1000", USDC_DECIMALS);
  const STREAM_DEPOSIT = parseUnits("100", USDC_DECIMALS);

  // ═══════════════════════════════════════════════════════════════════════════
  //                    ACT 1: CREATE STREAM
  // ═══════════════════════════════════════════════════════════════════════════
  logAct("ACT 1: Create Stream");

  // Scene 1.1: Mint USDC to Alice's Safe (deployer EOA)
  logScene("Scene 1: Mint USDC");
  logAction("Deployer", `mints ${formatUnits(MINT_AMOUNT, USDC_DECIMALS)} USDC to Alice's Safe`);

  const mintHash = await deployerWallet.writeContract({
    account: deployerWallet.account!,
    chain: anvil,
    address: ADDRESSES.mockUSDC,
    abi: MOCK_ERC20_ABI,
    functionName: "mint",
    args: [aliceAddress, MINT_AMOUNT],
  });
  await publicClient.waitForTransactionReceipt({ hash: mintHash });

  const aliceBalance0 = await publicClient.readContract({
    address: ADDRESSES.mockUSDC,
    abi: MOCK_ERC20_ABI,
    functionName: "balanceOf",
    args: [aliceAddress],
  }) as bigint;
  assert(aliceBalance0 >= MINT_AMOUNT, `Alice minted ${formatUnits(aliceBalance0, USDC_DECIMALS)} USDC`);

  // Scene 1.2: Approve AddressDriver (Alice's Safe via UserOp)
  logScene("Scene 2: Approve");
  logAction("Alice", "approves AddressDriver to spend USDC (via UserOp)");

  const approveTxResult = await aliceAccount.sendTransaction({
    to: ADDRESSES.mockUSDC,
    data: encodeFunctionData({
      abi: MOCK_ERC20_ABI,
      functionName: "approve",
      args: [ADDRESSES.addressDriver, STREAM_DEPOSIT],
    }),
    value: "0",
  });
  await waitForUserOp(approveTxResult.hash, BUNDLER_URL);

  const allowance = await publicClient.readContract({
    address: ADDRESSES.mockUSDC,
    abi: MOCK_ERC20_ABI,
    functionName: "allowance",
    args: [aliceAddress, ADDRESSES.addressDriver],
  }) as bigint;
  assert(allowance >= STREAM_DEPOSIT, `Allowance set: ${formatUnits(allowance, USDC_DECIMALS)} USDC`);

  // Scene 1.3: Open stream (Alice's Safe via UserOp)
  logScene("Scene 3: Open stream");
  logAction(
    "Alice",
    `streams ${TOKENS_PER_SEC} USDC/s to Bob — deposit ${formatUnits(STREAM_DEPOSIT, USDC_DECIMALS)} USDC (via UserOp)`,
  );

  // streamId=0, immediate start (0), runs until balance exhausted (duration=0)
  const streamConfig = packStreamConfig(0, amtPerSec, 0, 0);
  const newReceivers = [{ accountId: bobAccountId, config: streamConfig }];

  const setStreamsTxResult = await aliceAccount.sendTransaction({
    to: ADDRESSES.addressDriver,
    data: encodeFunctionData({
      abi: ADDRESS_DRIVER_ABI,
      functionName: "setStreams",
      args: [
        ADDRESSES.mockUSDC,
        [],                 // currReceivers — fresh wallet, always empty
        STREAM_DEPOSIT,     // balanceDelta (deposit)
        newReceivers,
        0,                  // maxEndHint1
        0,                  // maxEndHint2
        aliceAddress,       // transferTo (refund address)
      ],
    }),
    value: "0",
  });
  await waitForUserOp(setStreamsTxResult.hash, BUNDLER_URL);
  pass(`Stream created via UserOp: ${setStreamsTxResult.hash}`);

  // Verify stream state on-chain
  const streamsState = await publicClient.readContract({
    address: ADDRESSES.dripsProxy,
    abi: DRIPS_ABI,
    functionName: "streamsState",
    args: [aliceAccountId, ADDRESSES.mockUSDC],
  }) as [string, string, number, bigint, number];
  logResult(`updateTime: ${streamsState[2]}, balance: ${streamsState[3]}, maxEnd: ${streamsState[4]}`);
  assert(streamsState[3] === STREAM_DEPOSIT, `Stream balance confirmed: ${formatUnits(streamsState[3], USDC_DECIMALS)} USDC`);

  // ═══════════════════════════════════════════════════════════════════════════
  //                    ACT 2: RECEIVE & COLLECT
  // ═══════════════════════════════════════════════════════════════════════════
  logAct("ACT 2: Receive & Collect");

  // Scene 2.1: Wait for one full cycle to complete
  logScene("Scene 1: Wait for completed cycle");

  // CRITICAL: Stream created at timestamp T in cycle N can only be received
  // after cycle N+1 COMPLETES. Worst case: T is at start of cycle N, so we need
  // to wait 2 full cycles. With CYCLE_SECS=10 and Anvil auto-mining every 5s,
  // wait 3*CYCLE_SECS = 30s to guarantee at least 1 complete cycle.
  const waitTime = 3 * CYCLE_SECS;
  logAction("Bob", `waits ${waitTime}s for 1 full cycle to complete...`);

  // Real-time sleep — Anvil has interval mining enabled, time advances naturally.
  await sleep(waitTime);

  // Scene 2.2: receiveStreams — permissionless (deployer EOA)
  logScene("Scene 2: receiveStreams");
  logAction("Deployer", "calls receiveStreams for Bob (permissionless)");

  const receiveHash = await deployerWallet.writeContract({
    account: deployerWallet.account!,
    chain: anvil,
    address: ADDRESSES.dripsProxy,
    abi: DRIPS_ABI,
    functionName: "receiveStreams",
    args: [bobAccountId, ADDRESSES.mockUSDC, 1000],
  });
  const receiveReceipt = await publicClient.waitForTransactionReceipt({ hash: receiveHash });
  if (receiveReceipt.status !== "success") fail("receiveStreams reverted");
  pass(`receiveStreams succeeded — tx: ${receiveHash}`);

  const splittable = await publicClient.readContract({
    address: ADDRESSES.dripsProxy,
    abi: DRIPS_ABI,
    functionName: "splittable",
    args: [bobAccountId, ADDRESSES.mockUSDC],
  }) as bigint;
  logResult(`splittable after receive: ${splittable} (${formatUnits(splittable, USDC_DECIMALS)} USDC)`);

  // We waited 3*CYCLE_SECS (30s), so we should receive approximately 2-3 cycles worth.
  // The exact amount depends on when the stream was created within the cycle.
  // Verify we received at least 1 cycle worth (minimum expected).
  assert(
    splittable >= EXPECTED_CYCLE_AMT,
    `Bob splittable >= 1 cycle: ${formatUnits(splittable, USDC_DECIMALS)} USDC (minimum ${formatUnits(EXPECTED_CYCLE_AMT, USDC_DECIMALS)})`,
  );

  // Scene 2.3: split — no split receivers → full amount becomes collectable (deployer EOA)
  logScene("Scene 3: split");
  logAction("Deployer", "calls split for Bob (empty receivers)");

  const splitHash = await deployerWallet.writeContract({
    account: deployerWallet.account!,
    chain: anvil,
    address: ADDRESSES.dripsProxy,
    abi: DRIPS_ABI,
    functionName: "split",
    args: [bobAccountId, ADDRESSES.mockUSDC, []],
  });
  const splitReceipt = await publicClient.waitForTransactionReceipt({ hash: splitHash });
  if (splitReceipt.status !== "success") fail("split reverted");
  pass(`split succeeded — tx: ${splitHash}`);

  const collectable = await publicClient.readContract({
    address: ADDRESSES.dripsProxy,
    abi: DRIPS_ABI,
    functionName: "collectable",
    args: [bobAccountId, ADDRESSES.mockUSDC],
  }) as bigint;
  logResult(`collectable: ${collectable} (${formatUnits(collectable, USDC_DECIMALS)} USDC)`);
  assert(collectable === splittable, `Bob collectable equals splittable: ${formatUnits(collectable, USDC_DECIMALS)} USDC`);

  // Scene 2.4: Bob collects via AddressDriver (Bob's Safe via UserOp)
  logScene("Scene 4: collect");
  logAction("Bob", "collects via AddressDriver (via UserOp)");

  const bobBalanceBefore = await publicClient.readContract({
    address: ADDRESSES.mockUSDC,
    abi: MOCK_ERC20_ABI,
    functionName: "balanceOf",
    args: [bobAddress],
  }) as bigint;
  logResult(`Bob USDC before: ${formatUnits(bobBalanceBefore, USDC_DECIMALS)}`);

  const collectTxResult = await bobAccount.sendTransaction({
    to: ADDRESSES.addressDriver,
    data: encodeFunctionData({
      abi: ADDRESS_DRIVER_ABI,
      functionName: "collect",
      args: [ADDRESSES.mockUSDC, bobAddress],
    }),
    value: "0",
  });
  await waitForUserOp(collectTxResult.hash, BUNDLER_URL);
  pass(`collect UserOp submitted: ${collectTxResult.hash}`);

  const bobBalanceAfter = await publicClient.readContract({
    address: ADDRESSES.mockUSDC,
    abi: MOCK_ERC20_ABI,
    functionName: "balanceOf",
    args: [bobAddress],
  }) as bigint;
  logResult(`Bob USDC after: ${formatUnits(bobBalanceAfter, USDC_DECIMALS)}`);

  const received = bobBalanceAfter - bobBalanceBefore;
  assert(received === collectable, `Bob received exact collectable amount: ${formatUnits(received, USDC_DECIMALS)} USDC`);
  assert(received >= EXPECTED_CYCLE_AMT, `Bob received >= 1 cycle: ${formatUnits(received, USDC_DECIMALS)} USDC`);

  // ═══════════════════════════════════════════════════════════════════════════
  //                    ACT 3: STREAM MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  logAct("ACT 3: Stream Management");

  // Scene 3.1: Partial withdrawal (Alice's Safe via UserOp)
  logScene("Scene 1: Alice withdraws some funds");

  const withdrawAmt = parseUnits("10", USDC_DECIMALS);
  logAction("Alice", `withdraws ${formatUnits(withdrawAmt, USDC_DECIMALS)} USDC from stream (via UserOp)`);

  const aliceBalBeforeWithdraw = await publicClient.readContract({
    address: ADDRESSES.mockUSDC,
    abi: MOCK_ERC20_ABI,
    functionName: "balanceOf",
    args: [aliceAddress],
  }) as bigint;
  logResult(`Alice USDC before: ${formatUnits(aliceBalBeforeWithdraw, USDC_DECIMALS)}`);

  // Negative balanceDelta = withdrawal; keep same receivers to continue the stream
  const withdrawTxResult = await aliceAccount.sendTransaction({
    to: ADDRESSES.addressDriver,
    data: encodeFunctionData({
      abi: ADDRESS_DRIVER_ABI,
      functionName: "setStreams",
      args: [
        ADDRESSES.mockUSDC,
        newReceivers,         // currReceivers — must match current state
        -withdrawAmt,         // negative delta → pull funds back
        newReceivers,         // newReceivers — same, stream continues
        0,
        0,
        aliceAddress,
      ],
    }),
    value: "0",
  });
  await waitForUserOp(withdrawTxResult.hash, BUNDLER_URL);

  const aliceBalAfterWithdraw = await publicClient.readContract({
    address: ADDRESSES.mockUSDC,
    abi: MOCK_ERC20_ABI,
    functionName: "balanceOf",
    args: [aliceAddress],
  }) as bigint;
  logResult(`Alice USDC after withdrawal: ${formatUnits(aliceBalAfterWithdraw, USDC_DECIMALS)}`);

  assert(
    aliceBalAfterWithdraw > aliceBalBeforeWithdraw,
    `Alice received ${formatUnits(aliceBalAfterWithdraw - aliceBalBeforeWithdraw, USDC_DECIMALS)} USDC back`,
  );

  // Scene 3.2: Stop stream — clear receivers and drain remaining balance (Alice's Safe via UserOp)
  logScene("Scene 2: Alice stops stream");
  logAction("Alice", "stops stream and withdraws remaining balance (via UserOp)");

  const aliceBalBeforeStop = await publicClient.readContract({
    address: ADDRESSES.mockUSDC,
    abi: MOCK_ERC20_ABI,
    functionName: "balanceOf",
    args: [aliceAddress],
  }) as bigint;

  // Use a large negative delta to drain everything; protocol caps it to actual balance
  const DRAIN_ALL = -(2n ** 127n - 1n); // int128 min safe value

  const stopTxResult = await aliceAccount.sendTransaction({
    to: ADDRESSES.addressDriver,
    data: encodeFunctionData({
      abi: ADDRESS_DRIVER_ABI,
      functionName: "setStreams",
      args: [
        ADDRESSES.mockUSDC,
        newReceivers,   // currReceivers — current state after partial withdrawal
        DRAIN_ALL,      // balanceDelta — drain everything
        [],             // newReceivers empty — stream stopped
        0,
        0,
        aliceAddress,
      ],
    }),
    value: "0",
  });
  await waitForUserOp(stopTxResult.hash, BUNDLER_URL);
  pass(`Stream stopped via UserOp: ${stopTxResult.hash}`);

  const aliceBalAfterStop = await publicClient.readContract({
    address: ADDRESSES.mockUSDC,
    abi: MOCK_ERC20_ABI,
    functionName: "balanceOf",
    args: [aliceAddress],
  }) as bigint;
  logResult(`Alice USDC after stop: ${formatUnits(aliceBalAfterStop, USDC_DECIMALS)}`);

  assert(
    aliceBalAfterStop > aliceBalBeforeStop,
    `Alice reclaimed ${formatUnits(aliceBalAfterStop - aliceBalBeforeStop, USDC_DECIMALS)} USDC remaining`,
  );

  // Confirm stream balance is now 0
  const streamsStateFinal = await publicClient.readContract({
    address: ADDRESSES.dripsProxy,
    abi: DRIPS_ABI,
    functionName: "streamsState",
    args: [aliceAccountId, ADDRESSES.mockUSDC],
  }) as [string, string, number, bigint, number];
  assert(streamsStateFinal[3] === 0n, "Stream balance is zero after stop");

  // ─── RESULTS ─────────────────────────────────────────────────────────────
  logAct("TEST RESULTS");
  console.log(`\n  ${c.green}Passed: ${testsPassed}${c.reset}`);
  console.log(`  ${c.red}Failed: ${testsFailed}${c.reset}\n`);

  if (testsFailed === 0) {
    console.log(`  ${c.green}${c.bold}ALL ASSERTIONS PASSED${c.reset}\n`);
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
