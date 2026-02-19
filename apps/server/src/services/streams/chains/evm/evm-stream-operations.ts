/**
 * EVM Stream Operations
 *
 * Provides functions to interact with deployed Drips protocol contracts on EVM chains.
 * Based on working examples from tests/evm-protocol.test.ts
 */

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  hexToBigInt,
  parseAbi,
  type Chain,
  type Hash,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Contract artifacts
import AddressDriverArtifact from "@/contracts/AddressDriver.json";
import DripsArtifact from "@/contracts/Drips.json";

// Standard ERC20 ABI for token approvals
const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) public view returns (uint256)",
  "function balanceOf(address account) public view returns (uint256)",
]);

// ═══════════════════════════════════════════════════════════════════════════════
//                              CONFIG & HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const tempo = defineChain({
  id: 42431,
  name: "Tempo",
  nativeCurrency: { name: "Tempo", symbol: "TEMPO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.moderato.tempo.xyz"] },
  },
});

const CHAIN_MAP: Record<number, Chain> = {
  42431: tempo,
};

const AMT_PER_SEC_MULTIPLIER = 1_000_000_000n;

/** Driver ID for AddressDriver is typically 0 */
const DRIVER_ID = 0n;

/** Total splits weight (100% = 1_000_000) */
export const TOTAL_SPLITS_WEIGHT = 1_000_000n;

/**
 * Calculate amount per second with appropriate multiplier
 * @param tokensPerSec - Tokens per second (in human-readable format, e.g. 0.00001)
 * @param decimals - Token decimals (default 18 for ETH/ERC20)
 */
export const calcAmtPerSec = (tokensPerSec: number, decimals = 18): bigint =>
  BigInt(Math.floor(tokensPerSec * 10 ** decimals)) * AMT_PER_SEC_MULTIPLIER;

/**
 * Calculate account ID from driver ID and address
 * (driverId << 224) | address
 */
export const calcAccountId = (driverId: bigint, addr: string): bigint => {
  const addrBigInt = hexToBigInt(addr as `0x${string}`);
  return (driverId << 224n) | addrBigInt;
};

/**
 * Pack stream configuration into a single uint256
 * Format: streamId (32) | amtPerSec (160) | start (32) | duration (32)
 */
export const packStreamConfig = (
  streamId: number,
  amtPerSec: bigint,
  start: number,
  duration: number,
): bigint => {
  let config = BigInt(streamId);
  config = (config << 160n) | amtPerSec;
  config = (config << 32n) | BigInt(start);
  config = (config << 32n) | BigInt(duration);
  return config;
};

export interface DeployedContracts {
  drips: string;
  addressDriver: string;
  yieldManager?: string;
}

export interface StreamReceiver {
  accountId: bigint;
  config: bigint;
}

export interface SplitsReceiver {
  accountId: bigint;
  weight: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
//                              EVM STREAM OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const evmStreamOperations = {
  /**
   * Get public client for a chain
   */
  getPublicClient(chainId: number, rpcUrl?: string): PublicClient {
    const chain = CHAIN_MAP[chainId];
    if (!chain) throw new Error(`Unsupported chain: ${chainId}`);
    return createPublicClient({
      chain,
      transport: http(rpcUrl),
    });
  },

  // ===========================================================================
  // SETUP OPERATIONS (Must be done before using other operations)
  // ===========================================================================

  /**
   * Register AddressDriver with Drips contract
   * CRITICAL: Must be called after deployment for the driver to work!
   */
  async registerDriver(
    contracts: DeployedContracts,
    chainId: number,
    signer: ReturnType<typeof privateKeyToAccount>,
    rpcUrl?: string,
  ): Promise<Hash> {
    const chain = CHAIN_MAP[chainId];
    if (!chain) throw new Error(`Unsupported chain: ${chainId}`);

    const walletClient = createWalletClient({
      account: signer,
      chain,
      transport: http(rpcUrl),
    });

    const hash = await walletClient.writeContract({
      address: contracts.drips as `0x${string}`,
      abi: DripsArtifact.abi,
      functionName: "registerDriver",
      args: [contracts.addressDriver],
    });

    return hash;
  },

  /**
   * Approve AddressDriver to spend tokens on behalf of the sender
   * CRITICAL: Must be called before give() or setStreams() with ERC20 tokens!
   */
  async approveToken(
    contracts: DeployedContracts,
    chainId: number,
    signer: ReturnType<typeof privateKeyToAccount>,
    tokenAddress: string,
    amount: bigint,
    rpcUrl?: string,
  ): Promise<Hash> {
    const chain = CHAIN_MAP[chainId];
    if (!chain) throw new Error(`Unsupported chain: ${chainId}`);

    const walletClient = createWalletClient({
      account: signer,
      chain,
      transport: http(rpcUrl),
    });

    const hash = await walletClient.writeContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [contracts.addressDriver as `0x${string}`, amount],
    });

    return hash;
  },

  /**
   * Wait for a transaction to be confirmed
   */
  async waitForTransaction(
    chainId: number,
    hash: Hash,
    rpcUrl?: string,
  ): Promise<{ status: "success" | "reverted"; blockNumber: bigint }> {
    const publicClient = this.getPublicClient(chainId, rpcUrl);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return {
      status: receipt.status,
      blockNumber: receipt.blockNumber,
    };
  },

  /**
   * Get token balance for an address
   */
  async getTokenBalance(
    chainId: number,
    tokenAddress: string,
    ownerAddress: string,
    rpcUrl?: string,
  ): Promise<bigint> {
    const publicClient = this.getPublicClient(chainId, rpcUrl);
    const balance = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [ownerAddress as `0x${string}`],
    });
    return balance;
  },

  /**
   * Check current token allowance
   */
  async getTokenAllowance(
    chainId: number,
    tokenAddress: string,
    ownerAddress: string,
    spenderAddress: string,
    rpcUrl?: string,
  ): Promise<bigint> {
    const publicClient = this.getPublicClient(chainId, rpcUrl);
    const allowance = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [ownerAddress as `0x${string}`, spenderAddress as `0x${string}`],
    });
    return allowance;
  },

  // ===========================================================================
  // DIRECT PAYMENTS
  // ===========================================================================

  /**
   * Give tokens directly to another account (one-time transfer)
   * Tokens go to the receiver's splittable balance
   */
  async give(
    contracts: DeployedContracts,
    chainId: number,
    signer: ReturnType<typeof privateKeyToAccount>,
    receiverId: bigint,
    tokenAddress: string,
    amount: bigint,
    rpcUrl?: string,
  ): Promise<Hash> {
    const chain = CHAIN_MAP[chainId];
    if (!chain) throw new Error(`Unsupported chain: ${chainId}`);

    const walletClient = createWalletClient({
      account: signer,
      chain,
      transport: http(rpcUrl),
    });

    const hash = await walletClient.writeContract({
      address: contracts.addressDriver as `0x${string}`,
      abi: AddressDriverArtifact.abi,
      functionName: "give",
      args: [receiverId, tokenAddress, amount],
    });

    return hash;
  },

  /**
   * Set splits configuration for the caller
   * Defines how received funds get distributed
   * @param receivers - Must be sorted by accountId!
   */
  async setSplits(
    contracts: DeployedContracts,
    chainId: number,
    signer: ReturnType<typeof privateKeyToAccount>,
    receivers: SplitsReceiver[],
    rpcUrl?: string,
  ): Promise<Hash> {
    const chain = CHAIN_MAP[chainId];
    if (!chain) throw new Error(`Unsupported chain: ${chainId}`);

    const walletClient = createWalletClient({
      account: signer,
      chain,
      transport: http(rpcUrl),
    });

    // Convert to contract format
    const formattedReceivers = receivers.map((r) => ({
      accountId: r.accountId,
      weight: r.weight,
    }));

    const hash = await walletClient.writeContract({
      address: contracts.addressDriver as `0x${string}`,
      abi: AddressDriverArtifact.abi,
      functionName: "setSplits",
      args: [formattedReceivers],
    });

    return hash;
  },

  /**
   * Execute split for an account (permissionless)
   * Anyone can call this to distribute funds according to splits config
   */
  async split(
    contracts: DeployedContracts,
    chainId: number,
    signer: ReturnType<typeof privateKeyToAccount>,
    accountId: bigint,
    tokenAddress: string,
    receivers: SplitsReceiver[],
    rpcUrl?: string,
  ): Promise<Hash> {
    const chain = CHAIN_MAP[chainId];
    if (!chain) throw new Error(`Unsupported chain: ${chainId}`);

    const walletClient = createWalletClient({
      account: signer,
      chain,
      transport: http(rpcUrl),
    });

    const formattedReceivers = receivers.map((r) => ({
      accountId: r.accountId,
      weight: r.weight,
    }));

    const hash = await walletClient.writeContract({
      address: contracts.drips as `0x${string}`,
      abi: DripsArtifact.abi,
      functionName: "split",
      args: [accountId, tokenAddress, formattedReceivers],
    });

    return hash;
  },

  /**
   * Collect funds to wallet
   * Only the account owner can collect their funds
   */
  async collect(
    contracts: DeployedContracts,
    chainId: number,
    signer: ReturnType<typeof privateKeyToAccount>,
    tokenAddress: string,
    transferTo: string,
    rpcUrl?: string,
  ): Promise<Hash> {
    const chain = CHAIN_MAP[chainId];
    if (!chain) throw new Error(`Unsupported chain: ${chainId}`);

    const walletClient = createWalletClient({
      account: signer,
      chain,
      transport: http(rpcUrl),
    });

    const hash = await walletClient.writeContract({
      address: contracts.addressDriver as `0x${string}`,
      abi: AddressDriverArtifact.abi,
      functionName: "collect",
      args: [tokenAddress, transferTo],
    });

    return hash;
  },

  // ===========================================================================
  // STREAMING PAYMENTS
  // ===========================================================================

  /**
   * Set or update streams
   *
   * @param currReceivers - Current stream receivers (must match on-chain state)
   * @param balanceDelta - Amount to add (positive) or withdraw (negative)
   * @param newReceivers - New stream receivers
   * @param transferTo - Address to send withdrawn funds
   */
  async setStreams(
    contracts: DeployedContracts,
    chainId: number,
    signer: ReturnType<typeof privateKeyToAccount>,
    tokenAddress: string,
    currReceivers: StreamReceiver[],
    balanceDelta: bigint,
    newReceivers: StreamReceiver[],
    transferTo: string,
    rpcUrl?: string,
  ): Promise<Hash> {
    const chain = CHAIN_MAP[chainId];
    if (!chain) throw new Error(`Unsupported chain: ${chainId}`);

    const walletClient = createWalletClient({
      account: signer,
      chain,
      transport: http(rpcUrl),
    });

    const formattedCurr = currReceivers.map((r) => ({
      accountId: r.accountId,
      config: r.config,
    }));

    const formattedNew = newReceivers.map((r) => ({
      accountId: r.accountId,
      config: r.config,
    }));

    const hash = await walletClient.writeContract({
      address: contracts.addressDriver as `0x${string}`,
      abi: AddressDriverArtifact.abi,
      functionName: "setStreams",
      args: [
        tokenAddress,
        formattedCurr,
        balanceDelta,
        formattedNew,
        0, // maxEndHint1
        0, // maxEndHint2
        transferTo,
      ],
    });

    return hash;
  },

  /**
   * Create a new stream
   * Convenience wrapper around setStreams for creating a new stream
   */
  async createStream(
    contracts: DeployedContracts,
    chainId: number,
    signer: ReturnType<typeof privateKeyToAccount>,
    tokenAddress: string,
    receiverAddress: string,
    streamId: number,
    tokensPerSec: number,
    depositAmount: bigint,
    rpcUrl?: string,
  ): Promise<Hash> {
    const receiverId = calcAccountId(DRIVER_ID, receiverAddress);
    const amtPerSec = calcAmtPerSec(tokensPerSec);
    const config = packStreamConfig(streamId, amtPerSec, 0, 0);

    const newReceivers: StreamReceiver[] = [
      {
        accountId: receiverId,
        config,
      },
    ];

    return this.setStreams(
      contracts,
      chainId,
      signer,
      tokenAddress,
      [], // currReceivers (empty for new stream)
      depositAmount,
      newReceivers,
      signer.address,
      rpcUrl,
    );
  },

  /**
   * Stop a stream and withdraw remaining balance
   */
  async stopStream(
    contracts: DeployedContracts,
    chainId: number,
    signer: ReturnType<typeof privateKeyToAccount>,
    tokenAddress: string,
    currReceivers: StreamReceiver[],
    transferTo: string,
    rpcUrl?: string,
  ): Promise<Hash> {
    // Using a large negative number to withdraw all available
    const largeNeg = -100_000_000_000_000_000_000n;

    return this.setStreams(
      contracts,
      chainId,
      signer,
      tokenAddress,
      currReceivers,
      largeNeg,
      [], // Empty receivers = stop
      transferTo,
      rpcUrl,
    );
  },

  /**
   * Receive streams for an account (claim completed cycles)
   * This is permissionless - anyone can call it
   */
  async receiveStreams(
    contracts: DeployedContracts,
    chainId: number,
    signer: ReturnType<typeof privateKeyToAccount>,
    accountId: bigint,
    tokenAddress: string,
    maxCycles: number = 100,
    rpcUrl?: string,
  ): Promise<Hash> {
    const chain = CHAIN_MAP[chainId];
    if (!chain) throw new Error(`Unsupported chain: ${chainId}`);

    const walletClient = createWalletClient({
      account: signer,
      chain,
      transport: http(rpcUrl),
    });

    const hash = await walletClient.writeContract({
      address: contracts.drips as `0x${string}`,
      abi: DripsArtifact.abi,
      functionName: "receiveStreams",
      args: [accountId, tokenAddress, maxCycles],
    });

    return hash;
  },

  // ===========================================================================
  // READ OPERATIONS
  // ===========================================================================

  /**
   * Get splittable balance for an account
   */
  async getSplittable(
    contracts: DeployedContracts,
    chainId: number,
    accountId: bigint,
    tokenAddress: string,
    rpcUrl?: string,
  ): Promise<bigint> {
    const publicClient = this.getPublicClient(chainId, rpcUrl);

    const result = await publicClient.readContract({
      address: contracts.drips as `0x${string}`,
      abi: DripsArtifact.abi,
      functionName: "splittable",
      args: [accountId, tokenAddress],
    });

    return result as bigint;
  },

  /**
   * Get collectable balance for an account
   */
  async getCollectable(
    contracts: DeployedContracts,
    chainId: number,
    accountId: bigint,
    tokenAddress: string,
    rpcUrl?: string,
  ): Promise<bigint> {
    const publicClient = this.getPublicClient(chainId, rpcUrl);

    const result = await publicClient.readContract({
      address: contracts.drips as `0x${string}`,
      abi: DripsArtifact.abi,
      functionName: "collectable",
      args: [accountId, tokenAddress],
    });

    return result as bigint;
  },

  /**
   * Calculate account ID for an address using default driver
   */
  calcAccountIdForAddress(address: string): bigint {
    return calcAccountId(DRIVER_ID, address);
  },
};
