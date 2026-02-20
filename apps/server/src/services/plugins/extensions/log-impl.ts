import { RpcTarget, newHttpBatchRpcSession } from "capnweb";

interface LogRpcApi extends RpcTarget {
  logAttachment(params: {
    portfolioId: number;
    bountyActionId: number | null;
    type: "ui";
    title: string;
    summary: string | null;
    url: string;
    data: Record<string, any>;
  }): Promise<void>;
}

/**
 * Log Extension for Skills
 *
 * Allows skills to attach UI visualizations to agent logs via RPC.
 */
export class LogExtension {
  #rpcService: any;
  #rpcPath: string;
  #portfolioId: number;
  #bountyActionId: number | null;

  constructor(
    rpcService: any,
    rpcPath: string,
    portfolioId: number,
    bountyActionId: number | null,
  ) {
    this.#rpcService = rpcService;
    this.#rpcPath = rpcPath;
    this.#portfolioId = portfolioId;
    this.#bountyActionId = bountyActionId;
  }

  /**
   * Attach a UI visualization to the current agent execution
   *
   * @param params.type - Attachment type (currently only 'ui')
   * @param params.title - Title shown on pill in chat
   * @param params.summary - Optional preview text
   * @param params.url - Relative path to UI file in skill
   * @param params.data - Data passed to UI (max 10KB)
   */
  async attach(params: {
    type: "ui";
    title: string;
    summary?: string;
    url: string;
    data: Record<string, any>;
  }): Promise<void> {
    const dataSize = JSON.stringify(params.data).length;
    if (dataSize > 10240) {
      throw new Error(
        `Attachment data exceeds 10KB limit, use storage (${dataSize} bytes)`,
      );
    }

    // Override global fetch temporarily to use the service binding
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      return this.#rpcService.fetch(input, init);
    };

    try {
      const batch = newHttpBatchRpcSession<LogRpcApi>(`http://rpc${this.#rpcPath}`);
      await batch.logAttachment({
        portfolioId: this.#portfolioId,
        bountyActionId: this.#bountyActionId,
        type: params.type,
        title: params.title,
        summary: params.summary ?? null,
        url: params.url,
        data: params.data,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
}
