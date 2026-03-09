import { getAddress, encodeAbiParameters, parseAbiParameters } from "viem";
import { poseidon } from "./poseidon";
// @ts-expect-error no types
import * as snarkjs from "snarkjs";

export function derivePrivacyAddress(tokenId: bigint, secret: bigint) {
  const addrScalar = poseidon([8065n, tokenId, secret]);
  const addr20 = addrScalar & ((1n << 160n) - 1n);
  const q = (addrScalar - addr20) / (1n << 160n);
  const privacyAddress = getAddress("0x" + addr20.toString(16).padStart(40, "0"));
  return { addrScalar, addr20, q, privacyAddress };
}

export function calculateNullifier(addr20: bigint, secret: bigint) {
  const nullifier = poseidon([addr20, secret]);
  const nullifierHex = "0x" + nullifier.toString(16).padStart(64, "0");
  return { nullifier, nullifierHex };
}

export interface CircuitInput {
  root: bigint;
  nullifier: bigint;
  to: bigint;
  remintAmount: bigint;
  id: bigint;
  redeem: bigint;
  relayerFee: bigint;
  secret: bigint;
  addr20: bigint;
  commitAmount: bigint;
  q: bigint;
  pathElements: bigint[];
  pathIndices: number[];
}

// RemintData struct mapping:
//   commitment = Merkle ROOT (not leaf!)
//   nullifiers  = [Poseidon(addr20, secret)]
//   proof       = ABI-encoded (uint256[2], uint256[2][2], uint256[2])
export async function generateZKProof(circuitInput: CircuitInput) {
  const input: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(circuitInput)) {
    if (Array.isArray(value)) {
      input[key] = value.map((v) => String(v));
    } else {
      input[key] = String(value);
    }
  }

  const { proof: zkProof, publicSignals } = await snarkjs.groth16.fullProve(
    input, "/circuits/remint.wasm", "/circuits/remint_final.zkey"
  );

  const calldata = await snarkjs.groth16.exportSolidityCallData(zkProof, publicSignals);
  const calldataJson = JSON.parse("[" + calldata + "]");
  const proofBytes = encodeAbiParameters(
    parseAbiParameters("uint256[2], uint256[2][2], uint256[2]"),
    [calldataJson[0], calldataJson[1], calldataJson[2]]
  );

  return { zkProof, publicSignals, proofBytes };
}
