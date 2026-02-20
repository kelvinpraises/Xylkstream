declare module "agentix-internal:storage-impl" {
  interface StorageConfig {
    portfolioId: number;
    providerId: string;
    scope: "isolated";
  }

  export class StorageExtension {
    constructor(config: StorageConfig, rpcService: any, rpcPath: string);
    get(): Promise<string>;
    set(data: string): Promise<void>;
    delete(): Promise<void>;
    ping(): string;
  }
}

declare module "agentix-internal:log-impl" {
  export class LogExtension {
    constructor(
      rpcService: any,
      rpcPath: string,
      portfolioId: number,
      bountyActionId: number | null,
    );

    attach(params: {
      type: "ui";
      title: string;
      summary?: string;
      url: string;
      data: Record<string, any>;
    }): Promise<void>;
  }
}
