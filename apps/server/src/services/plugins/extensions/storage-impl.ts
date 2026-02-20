import { RpcTarget, newHttpBatchRpcSession } from "capnweb";

interface StorageConfig {
  portfolioId: number;
  providerId: string;
  scope: "isolated";
}

interface StorageRpcApi extends RpcTarget {
  getIsolatedStorage(params: { portfolioId: number; providerId: string }): Promise<string>;
  setIsolatedStorage(params: {
    portfolioId: number;
    providerId: string;
    data: any;
  }): Promise<void>;
  deleteIsolatedStorage(params: { portfolioId: number; providerId: string }): Promise<void>;
}

export class StorageExtension {
  #config: StorageConfig;
  #rpcService: any;
  #rpcPath: string;

  constructor(config: StorageConfig, rpcService: any, rpcPath: string) {
    this.#config = config;
    this.#rpcService = rpcService;
    this.#rpcPath = rpcPath;

    // Validate scoping requirements
    if (config.scope === "isolated" && !config.portfolioId) {
      throw new Error("Isolated storage requires portfolioId");
    }
  }

  async get(): Promise<string> {
    // Override global fetch temporarily to use the service binding
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      return this.#rpcService.fetch(input, init);
    };

    try {
      const batch = newHttpBatchRpcSession<StorageRpcApi>(`http://rpc${this.#rpcPath}`);
      return await batch.getIsolatedStorage({
        portfolioId: this.#config.portfolioId!,
        providerId: this.#config.providerId,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  async set(data: string): Promise<void> {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      return this.#rpcService.fetch(input, init);
    };

    try {
      const batch = newHttpBatchRpcSession<StorageRpcApi>(`http://rpc${this.#rpcPath}`);
      await batch.setIsolatedStorage({
        portfolioId: this.#config.portfolioId!,
        providerId: this.#config.providerId,
        data,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  async delete(): Promise<void> {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      return this.#rpcService.fetch(input, init);
    };

    try {
      const batch = newHttpBatchRpcSession<StorageRpcApi>(`http://rpc${this.#rpcPath}`);
      await batch.deleteIsolatedStorage({
        portfolioId: this.#config.portfolioId!,
        providerId: this.#config.providerId,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  ping() {
    return "echo from StorageExtension";
  }
}
