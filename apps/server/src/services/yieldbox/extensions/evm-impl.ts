/**
 * EVM extension implementation.
 * Bundled with @ethereumjs/vm + viem into a single module via esbuild.
 * Runs entirely inside the workerd sandbox — no server callbacks.
 */
import { createVM } from "@ethereumjs/vm";
import {
  hexToBytes,
  bytesToHex,
  createAddressFromPrivateKey,
  createAccount,
} from "@ethereumjs/util";
import { encodeFunctionData, decodeFunctionResult } from "viem";

interface CallResult {
  success: boolean;
  result: string | null;
  gasUsed: number;
  revert: string | null;
}

interface DeployResult {
  success: boolean;
  address: string | null;
  gasUsed: number;
  revert: string | null;
}

export class EvmExtension {
  #bytecode: string;
  #abi: any[];
  #vm: any;
  #deployerAddr: any;
  #contractAddr: any;
  #deployed: boolean;

  constructor(bytecode: string, abi: any[]) {
    this.#bytecode = bytecode;
    this.#abi = abi;
    this.#vm = null;
    this.#deployerAddr = null;
    this.#contractAddr = null;
    this.#deployed = false;
  }

  async deploy(opts?: { value?: bigint }): Promise<DeployResult> {
    try {
      this.#vm = await createVM();

      const privKey = hexToBytes(
        "0xe3a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1" as `0x${string}`,
      );
      this.#deployerAddr = createAddressFromPrivateKey(privKey);

      await this.#vm.stateManager.putAccount(
        this.#deployerAddr,
        createAccount({
          balance: BigInt("0xffffffffffffffffffffffffffff"),
          nonce: BigInt(0),
        }),
      );

      const result = await this.#vm.evm.runCall({
        caller: this.#deployerAddr,
        data: hexToBytes(("0x" + this.#bytecode) as `0x${string}`),
        gasLimit: BigInt(10_000_000),
        value: opts?.value ?? BigInt(0),
      });

      if (result.execResult.exceptionError) {
        return {
          success: false,
          address: null,
          gasUsed: Number(result.execResult.executionGasUsed),
          revert: String(result.execResult.exceptionError.error),
        };
      }

      this.#contractAddr = result.createdAddress;
      this.#deployed = true;

      return {
        success: true,
        address: this.#contractAddr.toString(),
        gasUsed: Number(result.execResult.executionGasUsed),
        revert: null,
      };
    } catch (err) {
      return {
        success: false,
        address: null,
        gasUsed: 0,
        revert: String(err),
      };
    }
  }

  async call(
    functionName: string,
    args: any[] = [],
    opts?: { value?: bigint },
  ): Promise<CallResult> {
    if (!this.#deployed || !this.#vm || !this.#contractAddr) {
      return {
        success: false,
        result: null,
        gasUsed: 0,
        revert: "Contract not deployed. Call deploy() first.",
      };
    }

    try {
      const abiItem = this.#abi.find(
        (e: any) => e.type === "function" && e.name === functionName,
      );
      if (!abiItem) {
        return {
          success: false,
          result: null,
          gasUsed: 0,
          revert: `Function "${functionName}" not found in ABI`,
        };
      }

      const calldata = encodeFunctionData({
        abi: [abiItem],
        functionName,
        args,
      });

      const execResult = await this.#vm.evm.runCall({
        to: this.#contractAddr,
        caller: this.#deployerAddr,
        data: hexToBytes(calldata),
        gasLimit: BigInt(10_000_000),
        value: opts?.value ?? BigInt(0),
      });

      const gasUsed = Number(execResult.execResult.executionGasUsed);

      if (execResult.execResult.exceptionError) {
        return {
          success: false,
          result: null,
          gasUsed,
          revert: String(execResult.execResult.exceptionError.error),
        };
      }

      const returnHex = bytesToHex(execResult.execResult.returnValue);

      // Decode if function has outputs
      let decoded: string | null = null;
      if (abiItem.outputs && abiItem.outputs.length > 0 && returnHex !== "0x") {
        try {
          const value = decodeFunctionResult({
            abi: [abiItem],
            functionName,
            data: returnHex,
          });
          decoded = String(value);
        } catch {
          decoded = returnHex;
        }
      }

      return {
        success: true,
        result: decoded,
        gasUsed,
        revert: null,
      };
    } catch (err) {
      return {
        success: false,
        result: null,
        gasUsed: 0,
        revert: String(err),
      };
    }
  }

  getAbi(): any[] {
    return this.#abi;
  }

  getFunctions(): string[] {
    return this.#abi
      .filter((e: any) => e.type === "function")
      .map((e: any) => e.name);
  }
}
