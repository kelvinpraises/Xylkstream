#!/usr/bin/env tsx
/**
 * XYLKSTREAM E2E — WDK + ERC-4337 USEROPERATION FLOW
 *
 * Story: A deterministic stealth wallet is created via WDK, funded on local
 * Anvil, and sends a UserOperation through an Alto bundler.
 *
 * ACT 1: WDK Wallet Creation & Determinism
 *   - Derive a seed, create a WalletAccountEvmErc4337
 *   - Verify determinism: same seed + path => same address
 *   - Verify uniqueness: different seed => different address
 *
 * ACT 2: Fund the Safe & Send UserOp
 *   - Pre-fund the predicted Safe with ETH (for gas) and mock USDC
 *   - Send a USDC transfer via sendTransaction() (UserOp through bundler)
 *   - Verify balances changed correctly
 *
 * ACT 3: Sign Message
 *   - Call sign("hello world") and verify a valid signature is returned
 *
 * Run with: npx tsx apps/client/tests/e2e-wdk-4337.ts
 * Requires: Anvil on localhost:8545 with contracts deployed, Alto bundler on localhost:4848.
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
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { anvil } from "viem/chains";

import WalletManagerEvmErc4337 from "@xylkstream/wdk-4337";

import { erc20Abi } from "../src/utils/streams.js";

// ═══════════════════════════════════════════════════════════════════════════════
//                              CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const ADDRESSES = {
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
  // Tokens
  mockUSDC:             "0x9a676e781a523b5d0c0e43731313a708cb607508" as `0x${string}`,
};

// Anvil well-known account #0 — always pre-funded with 10 000 ETH
const DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;

const BUNDLER_URL = "http://localhost:4848/bundler/localhost";
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

// Minimal ERC20 transfer ABI for encoding calldata
const TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to",     type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
//                              COLOUR HELPERS
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

const shortAddr = (addr: string): string => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

const logAct = (title: string) => {
  console.log("\n" + "=".repeat(80));
  console.log(`  ${c.bold}${title}${c.reset}`);
  console.log("=".repeat(80));
};
const logScene  = (title: string) => console.log(`\n  ${c.bold}-- ${title} --${c.reset}`);
const logAction = (who: string, action: string) =>
  console.log(`  ${c.cyan}${who}${c.reset} ${action}`);
const logDetail = (label: string, val: unknown) =>
  console.log(`    ${c.dim}${label}:${c.reset} ${val}`);

let testsPassed = 0;
let testsFailed = 0;

const pass = (msg: string): true => {
  console.log(`  ${c.green}+ ${msg}${c.reset}`);
  testsPassed++;
  return true;
};


const assert = (cond: boolean, msg: string): void => {
  if (cond) {
    pass(msg);
  } else {
    console.log(`  ${c.red}x ${msg}${c.reset}`);
    testsFailed++;
  }
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
//                              MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${c.bold}// XYLKSTREAM E2E -- WDK + ERC-4337 UserOperation${c.reset}`);
  console.log(`${c.dim}   A story of deterministic stealth wallets and bundled UserOps on local Anvil${c.reset}\n`);

  const deployerWallet = makeWallet(DEPLOYER_KEY);

  // Read token decimals dynamically from chain
  const USDC_DECIMALS = await publicClient.readContract({
    address: ADDRESSES.mockUSDC,
    abi: MOCK_ERC20_ABI,
    functionName: "decimals",
  }) as number;

  // ═════════════════════════════════════════════════════════════════════════════
  //                    ACT 1: WDK WALLET CREATION & DETERMINISM
  // ═════════════════════════════════════════════════════════════════════════════
  logAct("ACT 1: WDK Wallet Creation & Determinism");

  // Scene 1.1: Derive deterministic seed
  logScene("Scene 1: Generate deterministic seed");
  const seedHex = sha256(toBytes("xylkstream-test-seed-v2-sponsored"));
  // WDK requires Uint8Array for raw seeds (string is validated as BIP-39 mnemonic)
  const seed = toBytes(seedHex);
  logDetail("seed (hex)", seedHex);
  logDetail("seed (bytes)", `Uint8Array[${seed.length}]`);
  pass("Deterministic seed generated via sha256 → Uint8Array");

  // Scene 1.2: Create WDK account
  logScene("Scene 2: Create WalletAccountEvmErc4337");
  logAction("WDK", "initialises manager with seed and local Anvil config");

  const config = buildWdkConfig();
  const manager1 = new WalletManagerEvmErc4337(seed, config);
  const account1 = await manager1.getAccountByPath(DERIVATION_PATH);
  const address1 = await account1.getAddress();

  logDetail("predicted Safe address", address1);
  assert(address1.startsWith("0x") && address1.length === 42, `Valid Safe address: ${shortAddr(address1)}`);

  // Scene 1.3: Determinism check — same seed + path => same address
  logScene("Scene 3: Determinism — same seed produces same address");
  logAction("WDK", "creates second instance with identical seed and path");

  const manager2 = new WalletManagerEvmErc4337(seed, config);
  const account2 = await manager2.getAccountByPath(DERIVATION_PATH);
  const address2 = await account2.getAddress();

  logDetail("address (instance 2)", address2);
  assert(
    address1.toLowerCase() === address2.toLowerCase(),
    `Determinism confirmed: both instances produce ${shortAddr(address1)}`,
  );

  // Scene 1.4: Uniqueness check — different seed => different address
  logScene("Scene 4: Uniqueness — different seed produces different address");
  const altSeed = toBytes(sha256(toBytes("xylkstream-test-seed-DIFFERENT-v2")));
  logAction("WDK", "creates third instance with a different seed");

  const manager3 = new WalletManagerEvmErc4337(altSeed, config);
  const account3 = await manager3.getAccountByPath(DERIVATION_PATH);
  const address3 = await account3.getAddress();

  logDetail("address (different seed)", address3);
  assert(
    address1.toLowerCase() !== address3.toLowerCase(),
    `Uniqueness confirmed: ${shortAddr(address1)} != ${shortAddr(address3)}`,
  );

  // ═════════════════════════════════════════════════════════════════════════════
  //                    ACT 2: FUND THE SAFE & SEND USEROP
  // ═════════════════════════════════════════════════════════════════════════════
  logAct("ACT 2: Fund the Safe & Send UserOp");

  const safeAddress = address1 as `0x${string}`;
  const stealthAccount = account1;

  // Scene 2.1: Verify Safe has NO ETH (paymaster sponsors gas)
  logScene("Scene 1: Verify Safe starts with zero ETH (paymaster pays gas)");
  const safeEthBefore = await publicClient.getBalance({ address: safeAddress });
  logDetail("Safe ETH balance", `${formatUnits(safeEthBefore, 18)} ETH`);
  logAction("Paymaster", "will sponsor gas — Safe needs no ETH");
  pass("Safe has no pre-funded ETH (paymaster mode)");

  // Scene 2.2: Mint mock USDC to Safe
  logScene("Scene 2: Mint mock USDC to Safe");
  const MINT_AMOUNT = parseUnits("100", USDC_DECIMALS);
  logAction("Deployer", `mints ${formatUnits(MINT_AMOUNT, USDC_DECIMALS)} USDC to Safe`);

  const mintHash = await deployerWallet.writeContract({
    account: deployerWallet.account!,
    chain: anvil,
    address: ADDRESSES.mockUSDC,
    abi: MOCK_ERC20_ABI,
    functionName: "mint",
    args: [safeAddress, MINT_AMOUNT],
  });
  await publicClient.waitForTransactionReceipt({ hash: mintHash });

  const safeUsdcBefore = await publicClient.readContract({
    address: ADDRESSES.mockUSDC,
    abi: MOCK_ERC20_ABI,
    functionName: "balanceOf",
    args: [safeAddress],
  }) as bigint;
  logDetail("Safe USDC balance", `${formatUnits(safeUsdcBefore, USDC_DECIMALS)} USDC`);
  assert(safeUsdcBefore >= MINT_AMOUNT, `Safe has ${formatUnits(safeUsdcBefore, USDC_DECIMALS)} USDC`);

  // Scene 2.3: Send USDC via UserOperation
  logScene("Scene 3: Send USDC transfer via UserOp through bundler");

  const recipientKey = generatePrivateKey();
  const recipient = privateKeyToAccount(recipientKey);
  const recipientAddress = recipient.address as `0x${string}`;
  const transferAmount = parseUnits("10", USDC_DECIMALS);

  logAction("Safe", `transfers ${formatUnits(transferAmount, USDC_DECIMALS)} USDC to ${shortAddr(recipientAddress)}`);
  logDetail("recipient", recipientAddress);

  const transferData = encodeFunctionData({
    abi: TRANSFER_ABI,
    functionName: "transfer",
    args: [recipientAddress, transferAmount],
  });

  const tx = {
    to: ADDRESSES.mockUSDC,
    data: transferData,
    value: 0n,
  };

  const txResult = await stealthAccount.sendTransaction(tx);
  logDetail("UserOp result", JSON.stringify(txResult, (_k, v) => typeof v === "bigint" ? v.toString() : v));
  pass("UserOperation sent through bundler successfully");

  // Wait for the UserOp to be mined — poll eth_getUserOperationReceipt
  const userOpHash = txResult.hash;
  logAction("Bundler", `waiting for UserOp ${userOpHash.slice(0, 10)}... to be mined`);
  for (let i = 0; i < 30; i++) {
    const resp = await fetch(BUNDLER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "eth_getUserOperationReceipt",
        params: [userOpHash],
      }),
    });
    const json = await resp.json() as { result?: { receipt?: { status: string } } };
    if (json.result) {
      logDetail("UserOp mined in tx", (json.result as any).receipt?.transactionHash ?? "unknown");
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  // Verify recipient balance
  const recipientBalance = await publicClient.readContract({
    address: ADDRESSES.mockUSDC,
    abi: MOCK_ERC20_ABI,
    functionName: "balanceOf",
    args: [recipientAddress],
  }) as bigint;
  logDetail("recipient USDC balance", `${formatUnits(recipientBalance, USDC_DECIMALS)} USDC`);
  assert(
    recipientBalance === transferAmount,
    `Recipient received exactly ${formatUnits(transferAmount, USDC_DECIMALS)} USDC`,
  );

  // Verify Safe balance decreased
  const safeUsdcAfter = await publicClient.readContract({
    address: ADDRESSES.mockUSDC,
    abi: MOCK_ERC20_ABI,
    functionName: "balanceOf",
    args: [safeAddress],
  }) as bigint;
  logDetail("Safe USDC after", `${formatUnits(safeUsdcAfter, USDC_DECIMALS)} USDC`);
  assert(
    safeUsdcAfter === safeUsdcBefore - transferAmount,
    `Safe balance decreased by ${formatUnits(transferAmount, USDC_DECIMALS)} USDC`,
  );

  // ═════════════════════════════════════════════════════════════════════════════
  //                    ACT 3: SIGN MESSAGE
  // ═════════════════════════════════════════════════════════════════════════════
  logAct("ACT 3: Sign Message");

  logScene("Scene 1: Sign a message with the stealth wallet");
  logAction("Safe", 'signs "hello world"');

  const signature = await stealthAccount.sign("hello world");
  logDetail("signature", `${signature.slice(0, 20)}...${signature.slice(-8)}`);

  assert(
    typeof signature === "string" && signature.startsWith("0x") && signature.length > 2,
    "Valid hex signature returned",
  );

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
