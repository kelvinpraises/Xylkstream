import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTRACTS_ROOT = path.resolve(__dirname, "../../../../apps/contracts");

export const chains = [
  { name: "localhost", rpc: "http://127.0.0.1:8545" },
  { name: "paseo", rpc: "https://eth-rpc-testnet.polkadot.io/" },
  { name: "flow-testnet", rpc: "https://testnet.evm.nodes.onflow.org" },
];

export interface DeployOutput {
  chain: string;
  chainId: number;
  rpc: string;
  scopes: {
    aa?: { status: string; contracts: Record<string, string> };
    paymaster?: { status: string; contracts: Record<string, string> };
    privacy?: { status: string; contracts: Record<string, string> };
    streaming?: { status: string; contracts: Record<string, string> };
    register?: { status: string; contracts: Record<string, string> };
  };
}

export function loadDeployOutput(chainName: string): DeployOutput | null {
  try {
    const filePath = path.resolve(CONTRACTS_ROOT, `deploy/output/${chainName}.json`);
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as DeployOutput;
  } catch {
    return null;
  }
}

export function getEntryPointAddress(output: DeployOutput): string | null {
  return output.scopes.aa?.contracts?.entryPoint ?? null;
}
