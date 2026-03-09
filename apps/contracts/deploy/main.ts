import { parseArgs } from "node:util";
import { type Address, type Hex } from "viem";
import { defaultChains } from "./chains.js";
import { createClients, readState, writeState, type DeployState, type ScopeFn, type ScopeResult } from "./utils.js";
import { deployAA } from "./scopes/01-aa.js";
import { deployPrivacy } from "./scopes/02-privacy.js";
import { deployStreaming } from "./scopes/03-streaming.js";
import { deployRegister } from "./scopes/04-register.js";
import { deployPaymaster } from "./scopes/05-paymaster.js";

const SCOPES: { key: string; fn: ScopeFn }[] = [
  { key: "aa", fn: deployAA },
  { key: "privacy", fn: deployPrivacy },
  { key: "streaming", fn: deployStreaming },
  { key: "register", fn: deployRegister },
  { key: "paymaster", fn: deployPaymaster },
];

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    rpc: { type: "string" },
    scope: { type: "string" },
    force: { type: "boolean", default: false },
    all: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(`
Usage: npx tsx deploy/main.ts [options]

Options:
  --name <chain>     Chain name (e.g. localhost, paseo, polygon)
  --rpc <url>        Custom RPC URL (required for non-default chains)
  --scope <name>     Deploy only this scope (aa, privacy, streaming, register)
  --force            Force redeploy even if scope is completed
  --all              Deploy to all default chains
  --help             Show this help
  `);
  process.exit(0);
}

const deployerKey = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
if (!deployerKey) {
  console.error("Error: DEPLOYER_PRIVATE_KEY env var is required");
  process.exit(1);
}

async function deployToChain(chainName: string, rpc: string) {
  console.log(`\n========== Deploying to ${chainName} ==========`);
  console.log(`RPC: ${rpc}\n`);

  const { publicClient, walletClient, account } = createClients(rpc, deployerKey!);
  const chainId = await publicClient.getChainId();
  const deployer = account.address;

  console.log(`Chain ID: ${chainId}`);
  console.log(`Deployer: ${deployer}\n`);

  // Load or create state
  let state: DeployState = readState(chainName) ?? {
    chain: chainName,
    chainId,
    rpc,
    deployedAt: new Date().toISOString(),
    deployer,
    scopes: {},
  };

  const config = { chain: chainName, rpc, deployer };

  // Determine which scopes to run
  const scopesToRun = values.scope
    ? SCOPES.filter(s => s.key === values.scope)
    : SCOPES;

  for (const { key, fn } of scopesToRun) {
    const existing = state.scopes[key];

    if (existing?.status === "completed" && !values.force) {
      console.log(`⏭ Scope "${key}" already completed — skipping`);
      continue;
    }

    console.log(`\n▶ Running scope: ${key}`);
    try {
      const result = await fn(publicClient, walletClient, state.scopes, config);
      state.scopes[key] = result;
    } catch (err: any) {
      state.scopes[key] = { status: "failed", error: err.message };
      console.error(`✗ Scope "${key}" failed: ${err.message}`);
    }

    // Write state after each scope (resumable)
    writeState(chainName, state);

    if (state.scopes[key]?.status === "failed") {
      console.error(`\nStopping — scope "${key}" failed.`);
      break;
    }
  }

  // Summary
  console.log(`\n---------- Summary: ${chainName} ----------`);
  for (const [key, result] of Object.entries(state.scopes)) {
    const icon = result.status === "completed" ? "✓" : result.status === "failed" ? "✗" : "…";
    console.log(`  ${icon} ${key}: ${result.status}`);
    if (result.contracts) {
      for (const [name, addr] of Object.entries(result.contracts)) {
        console.log(`      ${name}: ${addr}`);
      }
    }
  }
}

async function main() {
  if (values.all) {
    for (const chain of defaultChains) {
      await deployToChain(chain.name, chain.rpc);
    }
  } else if (values.name) {
    const defaultChain = defaultChains.find(c => c.name === values.name);
    const rpc = values.rpc ?? defaultChain?.rpc;
    if (!rpc) {
      console.error(`Error: No RPC found for "${values.name}". Provide --rpc or use a default chain.`);
      process.exit(1);
    }
    await deployToChain(values.name, rpc);
  } else {
    console.error("Error: Provide --name <chain> or --all");
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
