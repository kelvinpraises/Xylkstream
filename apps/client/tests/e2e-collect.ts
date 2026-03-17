#!/usr/bin/env tsx
/**
 * XYLKSTREAM — E2E COLLECT FLOW TEST (WDK ERC-4337)
 *
 * Story: Alice streams USDC to Bob. Bob collects. Then Charlie (a third party)
 * permissionlessly force-collects for Bob by calling receiveStreams + split.
 * Bob collects again to receive the newly unlocked funds.
 *
 * All three participants (Alice, Bob, Charlie) are WDK Safe wallets.
 * Gas is sponsored via paymaster — no ETH funding needed.
 * Deployer EOA is only used for minting USDC and permissionless protocol calls.
 *
 * Run with: npx tsx apps/client/tests/e2e-collect.ts
 * Requires: Anvil on localhost:8545, Alto bundler on localhost:4848.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
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

import {
  addressDriverAbi,
  iDripsAbi,
  erc20Abi,
  AMT_PER_SEC_MULTIPLIER,
  calcAmtPerSec,
  calcAccountId,
  packStreamConfig,
} from "../src/utils/streams.js";

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

const BUNDLER_URL  = "http://localhost:4848/bundler/localhost";
const PAYMASTER_URL = "http://localhost:4848/paymaster/localhost";
const DERIVATION_PATH = "0'/0/0";

const MOCK_ERC20_ABI = [
  ...erc20Abi,
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
//                              FORMATTING & LOGS
// ═══════════════════════════════════════════════════════════════════════════════

const c = {
  cyan:   "\x1b[36m",
  yellow: "\x1b[33m",
  green:  "\x1b[32m",
  red:    "\x1b[31m",
  dim:    "\x1b[2m",
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
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
//                              HELPERS
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
//                              MAIN TEST
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${c.bold}🌊 XYLKSTREAM E2E — Collect Flow (WDK ERC-4337)${c.reset}`);
  console.log(`${c.dim}   Alice streams to Bob. Bob and Charlie (force) collect via Safe wallets.${c.reset}\n`);

  // ═══════════════════════════════════════════════════════════════════════════
  //                      PROLOGUE: SETUP
  // ═══════════════════════════════════════════════════════════════════════════
  logAct("PROLOGUE: Setup");

  const deployerWallet = makeWallet(DEPLOYER_KEY);
  const config = buildWdkConfig();

  // Derive deterministic Safe wallets for Alice, Bob, Charlie
  const aliceSeed   = toBytes(sha256(toBytes("xylk-collect-alice")));
  const bobSeed     = toBytes(sha256(toBytes("xylk-collect-bob")));
  const charlieSeed = toBytes(sha256(toBytes("xylk-collect-charlie")));

  const aliceManager   = new WalletManagerEvmErc4337(aliceSeed, config);
  const bobManager     = new WalletManagerEvmErc4337(bobSeed, config);
  const charlieManager = new WalletManagerEvmErc4337(charlieSeed, config);

  const aliceAccount   = await aliceManager.getAccountByPath(DERIVATION_PATH);
  const bobAccount     = await bobManager.getAccountByPath(DERIVATION_PATH);
  const charlieAccount = await charlieManager.getAccountByPath(DERIVATION_PATH);

  const aliceAddress   = await aliceAccount.getAddress() as `0x${string}`;
  const bobAddress     = await bobAccount.getAddress() as `0x${string}`;
  const charlieAddress = await charlieAccount.getAddress() as `0x${string}`;

  logScene("Participants");
  console.log(`  ${c.cyan}Alice${c.reset}   (sender)    Safe: ${shortAddr(aliceAddress)}`);
  console.log(`  ${c.cyan}Bob${c.reset}     (recipient) Safe: ${shortAddr(bobAddress)}`);
  console.log(`  ${c.cyan}Charlie${c.reset} (force)     Safe: ${shortAddr(charlieAddress)}`);

  logScene("Reading chain constants");
  const CYCLE_SECS = Number(await publicClient.readContract({
    address: ADDRESSES.dripsProxy,
    abi: CYCLE_SECS_ABI,
    functionName: "CYCLE_SECS",
  }));
  logResult(`CYCLE_SECS = ${CYCLE_SECS}s (from chain)`);

  const USDC_DECIMALS = await publicClient.readContract({
    address: ADDRESSES.mockUSDC,
    abi: MOCK_ERC20_ABI,
    functionName: "decimals",
  }) as number;
  logResult(`MockUSDC decimals = ${USDC_DECIMALS} (from chain)`);

  const driverIdRaw = await publicClient.readContract({
    address: ADDRESSES.addressDriver,
    abi: addressDriverAbi,
    functionName: "DRIVER_ID",
  });
  const driverId = BigInt(driverIdRaw as number | bigint);
  logResult(`DRIVER_ID = ${driverId}`);

  const aliceAccountId   = calcAccountId(driverId, aliceAddress);
  const bobAccountId     = calcAccountId(driverId, bobAddress);
  const charlieAccountId = calcAccountId(driverId, charlieAddress);

  logResult(`Alice accountId:   ${aliceAccountId}`);
  logResult(`Bob accountId:     ${bobAccountId}`);
  logResult(`Charlie accountId: ${charlieAccountId}`);

  const RATE_PER_SEC  = 2;
  const amtPerSec     = calcAmtPerSec(RATE_PER_SEC, USDC_DECIMALS);
  const streamConfig  = packStreamConfig(0, amtPerSec, 0, 0);
  const MINT_AMOUNT   = parseUnits("10000", USDC_DECIMALS);
  const STREAM_AMOUNT = parseUnits("2000",  USDC_DECIMALS);

  // Expected per cycle (internal units → token units)
  const expectedOneCycle = (amtPerSec * BigInt(CYCLE_SECS)) / AMT_PER_SEC_MULTIPLIER;
  logResult(`Expected 1-cycle receive = ${expectedOneCycle} (${formatUnits(expectedOneCycle, USDC_DECIMALS)} tokens)`);

  logScene("Minting USDC to Alice's Safe");
  logAction("Deployer", `mints ${formatUnits(MINT_AMOUNT, USDC_DECIMALS)} USDC to Alice`);

  const mintHash = await deployerWallet.writeContract({
    account: deployerWallet.account!,
    chain: anvil,
    address: ADDRESSES.mockUSDC,
    abi: MOCK_ERC20_ABI,
    functionName: "mint",
    args: [aliceAddress, MINT_AMOUNT],
  });
  await publicClient.waitForTransactionReceipt({ hash: mintHash });
  pass(`Minted ${formatUnits(MINT_AMOUNT, USDC_DECIMALS)} USDC to Alice`);

  logScene("Alice approves AddressDriver (via UserOp)");
  logAction("Alice", "approves AddressDriver to spend USDC");

  const approveTxResult = await aliceAccount.sendTransaction({
    to: ADDRESSES.mockUSDC,
    data: encodeFunctionData({
      abi: MOCK_ERC20_ABI,
      functionName: "approve",
      args: [ADDRESSES.addressDriver, STREAM_AMOUNT],
    }),
    value: 0,
  });
  await waitForUserOp(approveTxResult.hash, BUNDLER_URL);

  const allowance = await publicClient.readContract({
    address: ADDRESSES.mockUSDC,
    abi: MOCK_ERC20_ABI,
    functionName: "allowance",
    args: [aliceAddress, ADDRESSES.addressDriver],
  }) as bigint;
  assert(allowance >= STREAM_AMOUNT, `Alice approved AddressDriver for ${formatUnits(allowance, USDC_DECIMALS)} USDC`);

  logScene("Stream Creation (via UserOp)");
  logAction("Alice", `starts stream to Bob at ${RATE_PER_SEC} USDC/s, deposit ${formatUnits(STREAM_AMOUNT, USDC_DECIMALS)} USDC`);

  const newReceivers = [{ accountId: bobAccountId, config: streamConfig }];

  const setStreamsTxResult = await aliceAccount.sendTransaction({
    to: ADDRESSES.addressDriver,
    data: encodeFunctionData({
      abi: addressDriverAbi,
      functionName: "setStreams",
      args: [
        ADDRESSES.mockUSDC,
        [],
        STREAM_AMOUNT,
        newReceivers,
        0,
        0,
        aliceAddress,
      ],
    }),
    value: 0,
  });
  await waitForUserOp(setStreamsTxResult.hash, BUNDLER_URL);
  pass(`Stream created via UserOp: Alice → Bob at ${RATE_PER_SEC} USDC/s`);

  // ═══════════════════════════════════════════════════════════════════════════
  //                      ACT 1: BOB COLLECTS
  // ═══════════════════════════════════════════════════════════════════════════
  logAct("ACT 1: Bob Collects (after 1 cycle)");

  logScene("Scene 1: Wait for 1 cycle");
  // Stream created at timestamp T in cycle N can only be received after cycle N+1 COMPLETES.
  // Worst case: T is at start of cycle N, need to wait 2 full cycles + buffer.
  // CYCLE_SECS=10, Anvil mines every 5s, so wait 3*CYCLE_SECS = 30s to be safe
  const waitTime1 = 3 * CYCLE_SECS;
  logAction("Bob", `waits ${waitTime1}s (3*CYCLE_SECS — ensures at least 1 full cycle completes)...`);
  await sleep(waitTime1);

  logScene("Scene 2: receiveStreams (deployer EOA, permissionless)");
  logAction("Deployer", "calls receiveStreams for Bob (permissionless)");

  const receiveHash = await deployerWallet.writeContract({
    account: deployerWallet.account!,
    chain: anvil,
    address: ADDRESSES.dripsProxy,
    abi: iDripsAbi,
    functionName: "receiveStreams",
    args: [bobAccountId, ADDRESSES.mockUSDC, 1000],
  });
  const receiveReceipt = await publicClient.waitForTransactionReceipt({ hash: receiveHash });
  if (receiveReceipt.status !== "success") fail("receiveStreams reverted");
  pass("receiveStreams succeeded");

  const splittable = await publicClient.readContract({
    address: ADDRESSES.dripsProxy,
    abi: iDripsAbi,
    functionName: "splittable",
    args: [bobAccountId, ADDRESSES.mockUSDC],
  }) as bigint;
  logResult(`splittable = ${formatUnits(splittable, USDC_DECIMALS)} USDC (expected ≥ ${formatUnits(expectedOneCycle, USDC_DECIMALS)})`);
  assert(splittable >= expectedOneCycle, `splittable (${splittable}) ≥ 1 cycle worth (${expectedOneCycle})`);

  logScene("Scene 3: split (empty receivers → all collectable)");
  logAction("Deployer", "calls split for Bob with empty receivers (permissionless)");

  const splitHash = await deployerWallet.writeContract({
    account: deployerWallet.account!,
    chain: anvil,
    address: ADDRESSES.dripsProxy,
    abi: iDripsAbi,
    functionName: "split",
    args: [bobAccountId, ADDRESSES.mockUSDC, []],
  });
  const splitReceipt = await publicClient.waitForTransactionReceipt({ hash: splitHash });
  if (splitReceipt.status !== "success") fail("split reverted");
  pass("split succeeded");

  const collectable = await publicClient.readContract({
    address: ADDRESSES.dripsProxy,
    abi: iDripsAbi,
    functionName: "collectable",
    args: [bobAccountId, ADDRESSES.mockUSDC],
  }) as bigint;
  logResult(`collectable = ${formatUnits(collectable, USDC_DECIMALS)} USDC`);
  assert(collectable === splittable, `collectable (${collectable}) equals splittable (${splittable})`);

  logScene("Scene 4: Bob collects (via UserOp)");
  logAction("Bob", "calls collect → wallet (via UserOp)");

  const bobBalanceBefore = await publicClient.readContract({
    address: ADDRESSES.mockUSDC,
    abi: MOCK_ERC20_ABI,
    functionName: "balanceOf",
    args: [bobAddress],
  }) as bigint;
  logResult(`Bob balance before collect: ${formatUnits(bobBalanceBefore, USDC_DECIMALS)} USDC`);

  const collectTxResult = await bobAccount.sendTransaction({
    to: ADDRESSES.addressDriver,
    data: encodeFunctionData({
      abi: addressDriverAbi,
      functionName: "collect",
      args: [ADDRESSES.mockUSDC, bobAddress],
    }),
    value: 0,
  });
  await waitForUserOp(collectTxResult.hash, BUNDLER_URL);
  pass(`collect UserOp submitted: ${collectTxResult.hash}`);

  const bobBalanceAfter = await publicClient.readContract({
    address: ADDRESSES.mockUSDC,
    abi: MOCK_ERC20_ABI,
    functionName: "balanceOf",
    args: [bobAddress],
  }) as bigint;
  logResult(`Bob balance after collect: ${formatUnits(bobBalanceAfter, USDC_DECIMALS)} USDC`);

  const received1 = bobBalanceAfter - bobBalanceBefore;
  assert(
    received1 === collectable,
    `Bob received exactly collectable amount: ${formatUnits(received1, USDC_DECIMALS)} USDC`,
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //                      ACT 2: CHARLIE FORCE-COLLECTS FOR BOB
  // ═══════════════════════════════════════════════════════════════════════════
  logAct("ACT 2: Force-Collect (Charlie triggers for Bob, permissionless via UserOp)");

  logScene("Scene 1: Wait another cycle");
  // After first receiveStreams, wait for 1 MORE complete cycle.
  const waitTime2 = 2 * CYCLE_SECS;
  logAction("Charlie", `waits ${waitTime2}s (2*CYCLE_SECS — ensures 1 more cycle completes)...`);
  await sleep(waitTime2);

  logScene("Scene 2: Charlie calls receiveStreams for Bob (via UserOp)");
  logAction("Charlie", "calls receiveStreams for Bob (third party, permissionless, via UserOp)");

  const receiveHash2TxResult = await charlieAccount.sendTransaction({
    to: ADDRESSES.dripsProxy,
    data: encodeFunctionData({
      abi: iDripsAbi,
      functionName: "receiveStreams",
      args: [bobAccountId, ADDRESSES.mockUSDC, 1000],
    }),
    value: 0,
  });
  await waitForUserOp(receiveHash2TxResult.hash, BUNDLER_URL);
  pass("Force-collect: Charlie called receiveStreams for Bob (via UserOp)");

  const splittable2 = await publicClient.readContract({
    address: ADDRESSES.dripsProxy,
    abi: iDripsAbi,
    functionName: "splittable",
    args: [bobAccountId, ADDRESSES.mockUSDC],
  }) as bigint;
  logResult(`splittable after Charlie's receiveStreams = ${formatUnits(splittable2, USDC_DECIMALS)} USDC`);
  assert(splittable2 >= expectedOneCycle, `splittable2 (${splittable2}) ≥ 1 cycle worth (${expectedOneCycle})`);

  logScene("Scene 3: Charlie calls split for Bob (via UserOp)");
  logAction("Charlie", "calls split for Bob (third party, permissionless, via UserOp)");

  const splitHash2TxResult = await charlieAccount.sendTransaction({
    to: ADDRESSES.dripsProxy,
    data: encodeFunctionData({
      abi: iDripsAbi,
      functionName: "split",
      args: [bobAccountId, ADDRESSES.mockUSDC, []],
    }),
    value: 0,
  });
  await waitForUserOp(splitHash2TxResult.hash, BUNDLER_URL);
  pass("Force-collect: Charlie called split for Bob (via UserOp)");

  const collectable2 = await publicClient.readContract({
    address: ADDRESSES.dripsProxy,
    abi: iDripsAbi,
    functionName: "collectable",
    args: [bobAccountId, ADDRESSES.mockUSDC],
  }) as bigint;
  logResult(`collectable after force-collect = ${formatUnits(collectable2, USDC_DECIMALS)} USDC`);
  assert(collectable2 === splittable2, `collectable2 (${collectable2}) equals splittable2 (${splittable2})`);

  const charlieUSDC = await publicClient.readContract({
    address: ADDRESSES.mockUSDC,
    abi: MOCK_ERC20_ABI,
    functionName: "balanceOf",
    args: [charlieAddress],
  }) as bigint;
  assert(charlieUSDC === 0n, `Charlie's USDC balance is 0 — he did not take Bob's funds`);

  logScene("Scene 4: Bob collects newly unlocked funds (via UserOp)");
  logAction("Bob", "calls collect after Charlie's force-collect (via UserOp)");

  const collectHash2TxResult = await bobAccount.sendTransaction({
    to: ADDRESSES.addressDriver,
    data: encodeFunctionData({
      abi: addressDriverAbi,
      functionName: "collect",
      args: [ADDRESSES.mockUSDC, bobAddress],
    }),
    value: 0,
  });
  await waitForUserOp(collectHash2TxResult.hash, BUNDLER_URL);
  pass("Bob's second collect succeeded (via UserOp)");

  const bobBalanceFinal = await publicClient.readContract({
    address: ADDRESSES.mockUSDC,
    abi: MOCK_ERC20_ABI,
    functionName: "balanceOf",
    args: [bobAddress],
  }) as bigint;
  logResult(`Bob final balance: ${formatUnits(bobBalanceFinal, USDC_DECIMALS)} USDC`);

  const received2 = bobBalanceFinal - bobBalanceAfter;
  assert(
    received2 === collectable2,
    `Bob received exactly collectable2 amount: ${formatUnits(received2, USDC_DECIMALS)} USDC`,
  );
  assert(
    bobBalanceFinal > bobBalanceAfter,
    `Bob's final balance (${formatUnits(bobBalanceFinal, USDC_DECIMALS)}) > after first collect (${formatUnits(bobBalanceAfter, USDC_DECIMALS)})`,
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //                              SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  logAct("TEST RESULTS");

  console.log(`\n  Total Bob received:  ${formatUnits(bobBalanceFinal, USDC_DECIMALS)} USDC`);
  console.log(`    Act 1 (direct):    ${formatUnits(received1, USDC_DECIMALS)} USDC`);
  console.log(`    Act 2 (forced):    ${formatUnits(received2, USDC_DECIMALS)} USDC`);

  console.log(`\n  ${c.green}Passed: ${testsPassed}${c.reset}`);
  if (testsFailed > 0) console.log(`  ${c.red}Failed: ${testsFailed}${c.reset}`);
  else                  console.log(`  ${c.dim}Failed: 0${c.reset}`);

  if (testsFailed === 0) {
    console.log(`\n  ${c.bold}${c.green}ALL TESTS PASSED${c.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n  ${c.bold}${c.red}SOME TESTS FAILED${c.reset}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n${c.red}FATAL:${c.reset}`, err);
  process.exit(1);
});
