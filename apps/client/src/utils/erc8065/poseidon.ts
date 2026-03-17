// @ts-expect-error no types
import circomlibjs from "circomlibjs";

const poseidonRaw = circomlibjs.poseidon as (inputs: bigint[]) => bigint;

export function poseidon(inputs: bigint[]): bigint {
  return poseidonRaw(inputs);
}
