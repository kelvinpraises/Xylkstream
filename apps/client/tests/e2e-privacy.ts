#!/usr/bin/env tsx
/**
 * XYLKSTREAM PRIVACY LAYER — E2E TEST
 *
 * Story: Alice shields USDC into the privacy pool, then remints it to Bob.
 *
 * ACT 1: Shielding (deposit → Merkle tree)
 *   - Alice mints mock USDC and approves zwUSDC (via WDK UserOp)
 *   - Alice deposits 100 USDC directly to a stealth privacy address (via WDK UserOp)
 *   - Verify: privacy address zwUSDC balance === DEPOSIT_AMOUNT exactly
 *   - Verify: leaf count increased by exactly 1
 *
 * ACT 2: Verification (local tree rebuild)
 *   - Fetch all commitment leaves from chain
 *   - Reconstruct Merkle tree locally
 *   - Verify: local root matches on-chain root exactly (hard fail, not warn)
 *   - Verify: nullifier is fresh (not yet spent)
 *
 * ACT 3: Remint (ZK proof → token transfer)  [skipped if no circuit artifacts]
 *   - Generate ZK proof for Alice's deposit
 *   - Call remint(to=Bob, ...) via WDK UserOp
 *   - Verify: Bob's zwUSDC balance === remintAmount exactly
 *   - Verify: nullifier is now marked spent
 *
 * Run with: npx tsx apps/client/tests/e2e-privacy.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { fileURLToPath } from "url";

import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  hexToBigInt,
  formatUnits,
  encodeAbiParameters,
  parseAbiParameters,
  encodeFunctionData,
  sha256,
  toBytes,
  type PublicClient,
  type WalletClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";

// @ts-expect-error - snarkjs types may not be available
import * as snarkjs from "snarkjs";

import WalletManagerEvmErc4337 from "@xylkstream/wdk-4337";
import type { WalletAccountEvmErc4337 } from "@xylkstream/wdk-4337";

import { ERC20_ABI } from "../src/lib/drips.js";
import { derivePrivacyAddress, calculateNullifier } from "../src/lib/privacy/privacy.js";
import { IncrementalMerkleTree } from "../src/lib/privacy/merkle.js";

// ═══════════════════════════════════════════════════════════════════════════════
//                              ABIs
// ═══════════════════════════════════════════════════════════════════════════════

// Corrected ZWERC20 ABI — RemintData struct includes proverData + relayerData
const ZWERC20_ABI = [
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "to",     type: "address" },
      { name: "id",     type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "data",   type: "bytes"   },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [
      { name: "to",     type: "address" },
      { name: "id",     type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "data",   type: "bytes"   },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "remint",
    inputs: [
      { name: "to",     type: "address" },
      { name: "id",     type: "uint256" },
      { name: "amount", type: "uint256" },
      {
        name: "data",
        type: "tuple",
        components: [
          { name: "commitment",  type: "bytes32"   },
          { name: "nullifiers",  type: "bytes32[]" },
          { name: "proverData",  type: "bytes"     },
          { name: "relayerData", type: "bytes"     },
          { name: "redeem",      type: "bool"      },
          { name: "proof",       type: "bytes"     },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount",  type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to",     type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getLeafCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getCommitLeafCount",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getCommitLeaves",
    inputs: [
      { name: "id",    type: "uint256" },
      { name: "start", type: "uint256" },
      { name: "count", type: "uint256" },
    ],
    outputs: [
      { name: "commitments", type: "bytes32[]" },
      { name: "addresses",   type: "address[]" },
      { name: "amounts",     type: "uint256[]" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "root",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isKnownRoot",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool"    }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nullifierUsed",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool"    }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getFilledSubtree",
    inputs: [{ name: "level", type: "uint256" }],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "UNDERLYING",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
] as const;

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

// ═══════════════════════════════════════════════════════════════════════════════
//                              CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const ADDRESSES = {
  zwUSDC:   "0x959922be3caee4b8cd9a407cc3ac1c251c2007b1" as `0x${string}`,
  mockUSDC: "0x9a676e781a523b5d0c0e43731313a708cb607508" as `0x${string}`,
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

// Anvil account 0 — always funded with 10 000 ETH, deploys contracts
const DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;

const BUNDLER_URL  = "http://localhost:4848/bundler/localhost";
const PAYMASTER_URL = "http://localhost:4848/paymaster/localhost";
const DERIVATION_PATH = "0'/0/0";

const TOKEN_ID   = 0n;  // ERC-8065 slot
const TREE_DEPTH = 20;  // must match on-chain ZWERC20 tree depth

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

const shortAddr  = (addr: string): string => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
const shortHash  = (hash: string): string => `${hash.slice(0, 10)}...${hash.slice(-6)}`;

const log      = (msg: string)              => console.log(msg);
const logAct   = (title: string)            => {
  console.log("\n" + "═".repeat(80));
  console.log(`  ${c.bold}${title}${c.reset}`);
  console.log("═".repeat(80));
};
const logScene  = (title: string)           => console.log(`\n  ${c.bold}── ${title} ──${c.reset}`);
const logAction = (who: string, action: string) =>
  console.log(`  ${c.cyan}${who}${c.reset} ${action}`);
const logResult = (msg: string)             => console.log(`    → ${msg}`);
const logDetail = (label: string, val: unknown) =>
  console.log(`    ${c.dim}${label}:${c.reset} ${val}`);

let testsPassed = 0;
let testsFailed = 0;

const pass = (msg: string): true => {
  console.log(`  ${c.green}✓ ${msg}${c.reset}`);
  testsPassed++;
  return true;
};

const fail = (msg: string, extra?: unknown): never => {
  console.error(`  ${c.red}✗ FAIL: ${msg}${c.reset}`, extra ?? "");
  process.exit(1);
};

const assert = (cond: boolean, msg: string): void => {
  if (cond) {
    pass(msg);
  } else {
    console.log(`  ${c.red}✗ ${msg}${c.reset}`);
    testsFailed++;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//                              HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const randomBigInt = (bits: number): bigint => {
  const bytes = Math.ceil(bits / 8);
  const buf = crypto.randomBytes(bytes);
  return hexToBigInt(("0x" + buf.toString("hex")) as `0x${string}`);
};

const toBytes32 = (n: bigint): `0x${string}` =>
  ("0x" + n.toString(16).padStart(64, "0")) as `0x${string}`;

// ═══════════════════════════════════════════════════════════════════════════════
//                              CLIENT SETUP
// ═══════════════════════════════════════════════════════════════════════════════

const transport = http("http://127.0.0.1:8545");

const publicClient = createPublicClient({
  chain: anvil,
  transport,
}) as PublicClient;

const makeWallet = (key: `0x${string}`): WalletClient =>
  createWalletClient({
    account: privateKeyToAccount(key),
    chain: anvil,
    transport,
  });

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
//                              CIRCUIT ARTIFACT DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CIRCUITS_DIR = path.resolve(__dirname, "../public/circuits");
const WASM_PATH  = path.join(CIRCUITS_DIR, "remint.wasm");
const ZKEY_PATH  = path.join(CIRCUITS_DIR, "remint_final.zkey");

const circuitsAvailable = (): boolean =>
  fs.existsSync(WASM_PATH) && fs.existsSync(ZKEY_PATH);

// ═══════════════════════════════════════════════════════════════════════════════
//                              MAIN TEST
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${c.bold}🔒 XYLKSTREAM PRIVACY LAYER TEST (WDK ERC-4337)${c.reset}`);
  console.log(`${c.dim}   A story of shielded USDC transfer via ZK Merkle commitments${c.reset}\n`);

  // ═════════════════════════════════════════════════════════════════════════════
  //                         PROLOGUE: WALLETS & DECIMALS
  // ═════════════════════════════════════════════════════════════════════════════
  logAct("PROLOGUE: WDK Safe Wallet & Chain Parameters");

  const deployerWallet = makeWallet(DEPLOYER_KEY);
  const config = buildWdkConfig();

  // Alice uses a deterministic WDK Safe wallet with a unique seed for this test
  const aliceSeed = toBytes(sha256(toBytes("xylk-privacy-alice")));
  const aliceManager = new WalletManagerEvmErc4337(aliceSeed, config);
  const aliceAccount = await aliceManager.getAccountByPath(DERIVATION_PATH);
  const aliceAddress = await aliceAccount.getAddress() as `0x${string}`;

  // Bob is only a remint recipient — no transactions needed, just an address
  const bobPrivKey = generatePrivateKey();
  const bob        = privateKeyToAccount(bobPrivKey);
  const bobAddress = bob.address;

  log(`\n  ${c.cyan}Alice${c.reset} (shield sender) Safe: ${shortAddr(aliceAddress)}`);
  log(`\n  ${c.cyan}Bob${c.reset}   (remint recipient)     ${shortAddr(bobAddress)}`);

  // Read token decimals dynamically from chain — never hardcode
  logScene("Reading chain parameters");
  const USDC_DECIMALS = await publicClient.readContract({
    address: ADDRESSES.mockUSDC,
    abi:     MOCK_ERC20_ABI,
    functionName: "decimals",
  }) as number;
  logDetail("mockUSDC decimals", USDC_DECIMALS);

  const MINT_AMOUNT    = parseUnits("500", USDC_DECIMALS);
  const DEPOSIT_AMOUNT = parseUnits("100", USDC_DECIMALS);

  logDetail("MINT_AMOUNT",    `${formatUnits(MINT_AMOUNT, USDC_DECIMALS)} USDC`);
  logDetail("DEPOSIT_AMOUNT", `${formatUnits(DEPOSIT_AMOUNT, USDC_DECIMALS)} USDC`);

  // ═════════════════════════════════════════════════════════════════════════════
  //                         ACT 1: SHIELDING
  // ═════════════════════════════════════════════════════════════════════════════
  logAct("ACT 1: Shielding — Deposit USDC into the Privacy Pool");

  // Scene 1.1: Mint USDC to Alice's Safe (deployer EOA)
  logScene("Scene 1: Alice acquires mock USDC");
  logAction("Deployer", `mints ${formatUnits(MINT_AMOUNT, USDC_DECIMALS)} USDC to Alice's Safe`);

  const mintHash = await deployerWallet.writeContract({
    account: deployerWallet.account!,
    chain: anvil,
    address:      ADDRESSES.mockUSDC,
    abi:          MOCK_ERC20_ABI,
    functionName: "mint",
    args:         [aliceAddress, MINT_AMOUNT],
  });
  await publicClient.waitForTransactionReceipt({ hash: mintHash });

  const aliceUSDCBefore = await publicClient.readContract({
    address:      ADDRESSES.mockUSDC,
    abi:          MOCK_ERC20_ABI,
    functionName: "balanceOf",
    args:         [aliceAddress],
  }) as bigint;

  logDetail("Alice USDC balance", `${formatUnits(aliceUSDCBefore, USDC_DECIMALS)} USDC`);
  assert(
    aliceUSDCBefore >= DEPOSIT_AMOUNT,
    `Alice has ${formatUnits(aliceUSDCBefore, USDC_DECIMALS)} USDC (>= deposit amount)`,
  );

  // Scene 1.2: Approve zwUSDC (Alice's Safe via UserOp)
  logScene("Scene 2: Alice approves zwUSDC to pull USDC");
  logAction("Alice", `approves ${shortAddr(ADDRESSES.zwUSDC)} for ${formatUnits(DEPOSIT_AMOUNT, USDC_DECIMALS)} USDC (via UserOp)`);

  const approveTxResult = await aliceAccount.sendTransaction({
    to: ADDRESSES.mockUSDC,
    data: encodeFunctionData({
      abi: MOCK_ERC20_ABI,
      functionName: "approve",
      args: [ADDRESSES.zwUSDC, DEPOSIT_AMOUNT],
    }),
    value: "0",
  });
  await waitForUserOp(approveTxResult.hash, BUNDLER_URL);

  const allowance = await publicClient.readContract({
    address:      ADDRESSES.mockUSDC,
    abi:          MOCK_ERC20_ABI,
    functionName: "allowance",
    args:         [aliceAddress, ADDRESSES.zwUSDC],
  }) as bigint;

  assert(allowance >= DEPOSIT_AMOUNT, `Allowance set: ${formatUnits(allowance, USDC_DECIMALS)} USDC`);

  // Scene 1.3: Derive stealth privacy address
  logScene("Scene 3: Generate stealth privacy address");

  // Fresh random secret — must fit in BN254 scalar field (< ~253 bits)
  const secret = randomBigInt(253);
  logDetail("secret", `${secret.toString().slice(0, 16)}... [kept private]`);

  const { addr20, q, privacyAddress } = derivePrivacyAddress(TOKEN_ID, secret);
  logDetail("privacyAddress", privacyAddress);
  logDetail("addr20 scalar",  addr20);
  logDetail("q (high bits)",  q);
  pass(`Stealth privacy address derived: ${shortAddr(privacyAddress)}`);

  // Scene 1.4: Deposit into zwUSDC pool (Alice's Safe via UserOp)
  logScene("Scene 4: Alice deposits USDC to the privacy pool");

  // Capture leaf count before deposit — must increase by exactly 1
  const leafCountBefore = await publicClient.readContract({
    address:      ADDRESSES.zwUSDC,
    abi:          ZWERC20_ABI,
    functionName: "getLeafCount",
  }) as bigint;
  logDetail("leaf count before", leafCountBefore);

  logAction("Alice", `deposits ${formatUnits(DEPOSIT_AMOUNT, USDC_DECIMALS)} USDC → privacyAddress (via UserOp)`);

  const depositTxResult = await aliceAccount.sendTransaction({
    to: ADDRESSES.zwUSDC,
    data: encodeFunctionData({
      abi: ZWERC20_ABI,
      functionName: "deposit",
      args: [privacyAddress, TOKEN_ID, DEPOSIT_AMOUNT, "0x"],
    }),
    value: "0",
  });
  await waitForUserOp(depositTxResult.hash, BUNDLER_URL);
  logResult(`UserOp: ${depositTxResult.hash}`);

  // Verify leaf count increased by exactly 1
  const leafCountAfter = await publicClient.readContract({
    address:      ADDRESSES.zwUSDC,
    abi:          ZWERC20_ABI,
    functionName: "getLeafCount",
  }) as bigint;
  logDetail("leaf count after", leafCountAfter);
  assert(
    leafCountAfter === leafCountBefore + 1n,
    `Leaf count increased by exactly 1 (${leafCountBefore} → ${leafCountAfter})`,
  );

  // Verify privacy address zwUSDC balance === DEPOSIT_AMOUNT exactly
  const privAddrBalance = await publicClient.readContract({
    address:      ADDRESSES.zwUSDC,
    abi:          ZWERC20_ABI,
    functionName: "balanceOf",
    args:         [privacyAddress],
  }) as bigint;
  logDetail("privacy address zwUSDC balance", `${formatUnits(privAddrBalance, USDC_DECIMALS)} zwUSDC`);
  assert(
    privAddrBalance === DEPOSIT_AMOUNT,
    `Privacy address balance === DEPOSIT_AMOUNT exactly (${formatUnits(privAddrBalance, USDC_DECIMALS)} zwUSDC)`,
  );

  // ═════════════════════════════════════════════════════════════════════════════
  //                         ACT 2: VERIFICATION
  // ═════════════════════════════════════════════════════════════════════════════
  logAct("ACT 2: Verification — Merkle Tree Integrity");

  // Scene 2.1: Rebuild tree locally from chain data
  logScene("Scene 1: Read on-chain commitment leaves");

  const totalLeaves = Number(await publicClient.readContract({
    address:      ADDRESSES.zwUSDC,
    abi:          ZWERC20_ABI,
    functionName: "getLeafCount",
  }) as bigint);
  logDetail("total leaves", totalLeaves);

  const [commitments, addresses, amounts] = await publicClient.readContract({
    address:      ADDRESSES.zwUSDC,
    abi:          ZWERC20_ABI,
    functionName: "getCommitLeaves",
    args:         [TOKEN_ID, 0n, BigInt(totalLeaves)],
  }) as [`0x${string}`[], `0x${string}`[], bigint[]];
  logDetail("commitments fetched", commitments.length);

  logScene("Scene 2: Rebuild local Merkle tree and verify root");

  const localTree = new IncrementalMerkleTree(TREE_DEPTH);
  for (const commitment of commitments) {
    localTree.insert(hexToBigInt(commitment));
  }

  const localRoot    = localTree.root;
  const localRootHex = toBytes32(localRoot);
  logDetail("local root",    localRootHex);

  const onChainRoot = await publicClient.readContract({
    address:      ADDRESSES.zwUSDC,
    abi:          ZWERC20_ABI,
    functionName: "root",
  }) as `0x${string}`;
  logDetail("on-chain root", onChainRoot);

  // Hard fail — roots must match. If they differ there is a bug or tree depth mismatch.
  if (localRootHex.toLowerCase() !== onChainRoot.toLowerCase()) {
    fail(
      "Local Merkle root DOES NOT match on-chain root — tree depth or leaf ordering mismatch",
      { localRootHex, onChainRoot },
    );
  }
  pass("Local Merkle root matches on-chain root exactly");

  // Scene 2.3: Verify nullifier freshness
  logScene("Scene 3: Compute nullifier and verify it is unspent");

  const { nullifier, nullifierHex } = calculateNullifier(addr20, secret);
  logDetail("nullifier", nullifierHex);

  const nullifierAlreadyUsed = await publicClient.readContract({
    address:      ADDRESSES.zwUSDC,
    abi:          ZWERC20_ABI,
    functionName: "nullifierUsed",
    args:         [nullifierHex as `0x${string}`],
  }) as boolean;

  if (nullifierAlreadyUsed) {
    fail("Nullifier already spent — dirty state from a previous run (fresh wallets should prevent this)");
  }
  pass("Nullifier is fresh (not yet spent)");

  // ═════════════════════════════════════════════════════════════════════════════
  //                         ACT 3: REMINT (ZK)
  // ═════════════════════════════════════════════════════════════════════════════

  if (!circuitsAvailable()) {
    logAct("ACT 3: Remint — SKIPPED (circuit artifacts not found)");
    console.log(`  ${c.yellow}! Expected at:${c.reset}`);
    console.log(`    ${c.dim}${WASM_PATH}${c.reset}`);
    console.log(`    ${c.dim}${ZKEY_PATH}${c.reset}`);
    console.log(`\n  ${c.yellow}Acts 1–2 passed. Act 3 requires compiled circuits to run.${c.reset}`);
  } else {
    logAct("ACT 3: Remint — ZK Proof → Token Transfer to Bob");

    // Scene 3.1: Locate deposit leaf
    logScene("Scene 1: Locate Alice's deposit leaf in the tree");

    let leafIndex = -1;
    for (let i = 0; i < addresses.length; i++) {
      if (addresses[i].toLowerCase() === privacyAddress.toLowerCase()) {
        leafIndex = i;
        break;
      }
    }
    if (leafIndex === -1) fail("Could not find privacy-address deposit leaf in the tree");
    logDetail("leaf index",    leafIndex);

    const { pathElements, pathIndices } = localTree.getProof(leafIndex);
    const remintAmount = amounts[leafIndex];
    logDetail("remintAmount",  `${formatUnits(remintAmount, USDC_DECIMALS)} USDC`);

    // The proof root must be a known root — use current on-chain root
    const proofRoot = hexToBigInt(onChainRoot as `0x${string}`);

    // Scene 3.2: Generate ZK proof
    logScene("Scene 2: Generate Groth16 ZK proof");
    logAction("Alice", "proves ownership of the shielded note");

    const circuitInput = {
      root:         proofRoot,
      nullifier,
      to:           hexToBigInt(bobAddress),
      remintAmount,
      id:           TOKEN_ID,
      redeem:       0n,  // false → re-mint into zwUSDC (not raw ERC20)
      relayerFee:   0n,
      secret,
      addr20,
      commitAmount: remintAmount,
      q,
      pathElements,
      pathIndices,
    };

    // snarkjs expects all values as strings / string arrays
    const snarkInput: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(circuitInput)) {
      snarkInput[key] = Array.isArray(value)
        ? value.map((v) => String(v))
        : String(value);
    }

    let proofBytes: `0x${string}`;
    try {
      const { proof: zkProof, publicSignals } = await snarkjs.groth16.fullProve(
        snarkInput,
        WASM_PATH,
        ZKEY_PATH,
      );
      const calldata     = await snarkjs.groth16.exportSolidityCallData(zkProof, publicSignals);
      const calldataJson = JSON.parse("[" + calldata + "]");
      proofBytes = encodeAbiParameters(
        parseAbiParameters("uint256[2], uint256[2][2], uint256[2]"),
        [calldataJson[0], calldataJson[1], calldataJson[2]],
      ) as `0x${string}`;
      pass("ZK proof generated successfully");
    } catch (err) {
      fail("ZK proof generation failed", err);
    }

    // Scene 3.3: Call remint (Alice's Safe via UserOp)
    logScene("Scene 3: Remint to Bob");
    logAction("Alice", `calls remint(to=${shortAddr(bobAddress)}, amount=${formatUnits(remintAmount, USDC_DECIMALS)} USDC) (via UserOp)`);

    const rootBytes = toBytes32(proofRoot);
    const nullBytes = nullifierHex as `0x${string}`;

    const remintTxResult = await aliceAccount.sendTransaction({
      to: ADDRESSES.zwUSDC,
      data: encodeFunctionData({
        abi: ZWERC20_ABI,
        functionName: "remint",
        args: [
          bobAddress,
          TOKEN_ID,
          remintAmount,
          {
            commitment:  rootBytes,
            nullifiers:  [nullBytes],
            proverData:  "0x",
            relayerData: "0x",
            redeem:      false,
            proof:       proofBytes!,
          },
        ],
      }),
      value: "0",
    });
    await waitForUserOp(remintTxResult.hash, BUNDLER_URL);
    logResult(`UserOp: ${remintTxResult.hash}`);
    pass("remint UserOp submitted");

    // Scene 3.4: Verify outcome
    logScene("Scene 4: Verify post-remint state");

    // Bob's zwUSDC balance must equal remintAmount exactly
    const bobZwBalance = await publicClient.readContract({
      address:      ADDRESSES.zwUSDC,
      abi:          ZWERC20_ABI,
      functionName: "balanceOf",
      args:         [bobAddress],
    }) as bigint;
    logDetail("Bob zwUSDC balance", `${formatUnits(bobZwBalance, USDC_DECIMALS)} zwUSDC`);
    assert(
      bobZwBalance === remintAmount,
      `Bob's zwUSDC balance === remintAmount exactly (${formatUnits(bobZwBalance, USDC_DECIMALS)} zwUSDC)`,
    );

    // Nullifier must now be marked spent
    const nullifierSpent = await publicClient.readContract({
      address:      ADDRESSES.zwUSDC,
      abi:          ZWERC20_ABI,
      functionName: "nullifierUsed",
      args:         [nullBytes],
    }) as boolean;
    assert(nullifierSpent, "Nullifier is now marked spent (double-spend protection active)");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  //                              RESULTS
  // ═════════════════════════════════════════════════════════════════════════════
  logAct("TEST RESULTS");
  console.log(`\n  ${c.green}Passed: ${testsPassed}${c.reset}`);
  if (testsFailed > 0) {
    console.log(`  ${c.red}Failed: ${testsFailed}${c.reset}`);
  }

  if (testsFailed === 0) {
    console.log(`\n  ${c.green}${c.bold}ALL ASSERTIONS PASSED${c.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n  ${c.red}${c.bold}${testsFailed} ASSERTION(S) FAILED${c.reset}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n${c.red}FATAL:${c.reset}`, err);
  process.exit(1);
});
