declare module "yieldbox-internal:evm-impl" {
  export class EvmExtension {
    constructor(bytecode: string, abi: any[]);
    deploy(opts?: { value?: bigint }): Promise<{
      success: boolean;
      address: string | null;
      gasUsed: number;
      revert: string | null;
    }>;
    call(
      functionName: string,
      args?: any[],
      opts?: { value?: bigint },
    ): Promise<{
      success: boolean;
      result: string | null;
      gasUsed: number;
      revert: string | null;
    }>;
    getAbi(): any[];
    getFunctions(): string[];
  }
}
