// use-privacy-engine.ts — privacy lifecycle hook: Merkle tree sync, secret management, ZK proof generation

import { useState, useCallback, useRef, useEffect } from "react";
import {
  getPublicClient,
  zwerc20Abi,
} from "@/utils/streams";
import { useChain } from "@/providers/chain-provider";
import {
  IncrementalMerkleTree,
  derivePrivacyAddress,
  calculateNullifier,
  generateZKProof,
  type CircuitInput,
} from "@/utils/erc8065";

// --- types ---

export interface PrivacySecret {
  /** Random 52-bit scalar used to derive the privacy address. */
  secret: bigint;
  /** EIP-55 checksummed Ethereum address derived from (tokenId, secret). */
  privacyAddress: string;
  /** Lower 160 bits of the Poseidon output — used as the on-chain address key. */
  addr20: bigint;
  /** Upper bits of the Poseidon output — used as the `q` circuit input. */
  q: bigint;
  /** Merkle leaf index after deposit; -1 until a matching deposit is confirmed. */
  leafIndex: number;
  /** Token amount committed at this leaf (populated after syncTree resolves it). */
  amount: bigint;
  /** ZWERC20 group / token-id this commitment belongs to. */
  tokenId: bigint;
  /** True once a remint proof for this leaf has been submitted. */
  spent: boolean;
  /** Optional human-readable label (e.g. "Payment to Alice"). */
  label?: string;
}

/** Serialised form stored in localStorage (bigints as decimal strings). */
interface SerializedSecret {
  secret: string;
  privacyAddress: string;
  addr20: string;
  q: string;
  leafIndex: number;
  amount: string;
  tokenId: string;
  spent: boolean;
  label?: string;
}

export type ProofProgress =
  | "idle"
  | "building-tree"
  | "generating-proof"
  | "encoding";

export interface PrivacyEngineState {
  /** True once the Merkle tree has been successfully synced at least once. */
  isReady: boolean;
  /** True while a ZK proof is being generated. */
  isGeneratingProof: boolean;
  /** Granular progress stage for UI spinner binding. */
  proofProgress: ProofProgress;
  /** Last error message, or null if no error. */
  error: string | null;
}

export interface RemintData {
  /** The Merkle root at proof-generation time (passed as `commitment` to the contract). */
  commitment: `0x${string}`;
  /** Array of nullifiers (one per leaf being spent). */
  nullifiers: `0x${string}`[];
  /** ABI-encoded groth16 proof: (uint256[2], uint256[2][2], uint256[2]). */
  proof: `0x${string}`;
  /** Whether to redeem (burn) rather than remint. */
  redeem: boolean;
  /** Optional prover routing data (empty bytes when using default prover). */
  proverData: `0x${string}`;
  /** Optional relayer routing data (empty bytes when no relayer). */
  relayerData: `0x${string}`;
}

// --- constants ---

const TREE_DEPTH = 20;
const STORAGE_KEY = "xylk-privacy-secrets";

// --- serialisation helpers ---

function serializeSecret(s: PrivacySecret): SerializedSecret {
  return {
    ...s,
    secret: s.secret.toString(),
    addr20: s.addr20.toString(),
    q: s.q.toString(),
    amount: s.amount.toString(),
    tokenId: s.tokenId.toString(),
  };
}

function deserializeSecret(s: SerializedSecret): PrivacySecret {
  return {
    ...s,
    secret: BigInt(s.secret),
    addr20: BigInt(s.addr20),
    q: BigInt(s.q),
    amount: BigInt(s.amount),
    tokenId: BigInt(s.tokenId),
  };
}

function loadSecretsFromStorage(): Map<string, PrivacySecret> {
  const map = new Map<string, PrivacySecret>();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return map;
    const entries: [string, SerializedSecret][] = JSON.parse(raw);
    for (const [key, val] of entries) {
      map.set(key, deserializeSecret(val));
    }
  } catch {
    // Corrupt storage — start fresh.
  }
  return map;
}

function saveSecretsToStorage(secrets: Map<string, PrivacySecret>) {
  const entries = Array.from(secrets.entries()).map(
    ([k, v]): [string, SerializedSecret] => [k, serializeSecret(v)],
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// --- hook ---

/**
 * usePrivacyEngine
 *
 * @param zwTokenAddress — Optional ZWERC20 contract address override.
 *   Falls back to `config.ZW_USDC` when omitted.
 */
export function usePrivacyEngine(zwTokenAddress?: `0x${string}`) {
  const { chainConfig } = useChain();

  // --- state ---

  const [state, setState] = useState<PrivacyEngineState>({
    isReady: false,
    isGeneratingProof: false,
    proofProgress: "idle",
    error: null,
  });

  /** Local copy of the Merkle tree rebuilt from on-chain leaves. */
  const treeRef = useRef<IncrementalMerkleTree | null>(null);

  /**
   * Privacy secrets keyed by privacyAddress.
   * Initialised synchronously from localStorage so the ref is populated
   * before any React render cycle completes.
   */
  const secretsRef = useRef<Map<string, PrivacySecret>>(
    loadSecretsFromStorage(),
  );

  // load secrets from localStorage on mount (handles SSR / hydration)

  useEffect(() => {
    secretsRef.current = loadSecretsFromStorage();
  }, []);

  // resolve the contract address to use

  const resolveAddress = useCallback((): `0x${string}` | undefined => {
    if (zwTokenAddress) return zwTokenAddress;
    return chainConfig.contracts.zwUsdc;
  }, [zwTokenAddress, chainConfig]);

  // --- syncTree ---

  /**
   * Fetch all commitment leaves from the ZWERC20 contract and rebuild the
   * local IncrementalMerkleTree.  Also resolves `leafIndex` and `amount`
   * for any stored secrets whose leaf has appeared on-chain.
   */
  const syncTree = useCallback(async () => {
    const addr = resolveAddress();
    if (!addr) {
      setState((s) => ({
        ...s,
        error: "No ZWERC20 address configured",
      }));
      return;
    }

    setState((s) => ({ ...s, error: null }));

    try {
      const publicClient = getPublicClient(chainConfig.chain);

      // 1. How many leaves exist in group 0?
      const leafCount = (await publicClient.readContract({
        address: addr,
        abi: zwerc20Abi,
        functionName: "getCommitLeafCount",
        args: [0n],
      })) as bigint;

      const count = Number(leafCount);

      // 2. Fetch the leaves (commitments, recipient addrs, amounts).
      let commitmentHashes: bigint[] = [];
      let onChainAmounts: bigint[] = [];

      if (count > 0) {
        const [hashes, , amounts] = (await publicClient.readContract({
          address: addr,
          abi: zwerc20Abi,
          functionName: "getCommitLeaves",
          args: [0n, 0n, leafCount],
        })) as unknown as [bigint[], `0x${string}`[], bigint[]];

        commitmentHashes = hashes.map((h) => BigInt(h));
        onChainAmounts = amounts.map((a) => BigInt(a));
      }

      // 3. Rebuild the tree from scratch.
      const tree = new IncrementalMerkleTree(TREE_DEPTH);
      for (const commitment of commitmentHashes) {
        tree.insert(commitment);
      }
      treeRef.current = tree;

      // 4. Resolve leaf indices and amounts for stored secrets.
      //    A stored secret's commitment = Poseidon(addr20) which is its leaf hash.
      //    We match by comparing the leaf hash at each index.
      //    (The leaf hash is `tree.leaves[i]` after insertion.)
      const updated = new Map(secretsRef.current);
      let anyUpdated = false;

      for (const [key, secret] of updated.entries()) {
        if (secret.leafIndex === -1) {
          // Try to find this secret's commitment in the on-chain leaves.
          // The on-chain commitment leaf for a deposit is Poseidon(addr20, amount, id).
          // We don't have a direct mapping here, so we scan all unmatched tree leaves
          // looking for a leaf whose on-chain recipient address matches privacyAddress.
          // For now we rely on the caller invoking `resolveLeafIndex` after deposit.
          // If already matched (leafIndex >= 0), update the amount.
          continue;
        }

        const idx = secret.leafIndex;
        if (idx < count && onChainAmounts[idx] !== undefined) {
          const onChainAmt = onChainAmounts[idx];
          if (onChainAmt !== secret.amount) {
            updated.set(key, { ...secret, amount: onChainAmt });
            anyUpdated = true;
          }
        }
      }

      if (anyUpdated) {
        secretsRef.current = updated;
        saveSecretsToStorage(updated);
      }

      setState((s) => ({ ...s, isReady: true, error: null }));
    } catch (err) {
      setState((s) => ({
        ...s,
        error: (err as Error).message,
      }));
    }
  }, [resolveAddress]);

  // --- generateSecret ---

  /**
   * Derive a fresh PrivacySecret from a cryptographically random 52-bit scalar.
   * The secret is NOT persisted here — call `storeSecret` after the on-chain
   * deposit is confirmed and you know the leaf index.
   */
  const generateSecret = useCallback(
    (tokenId: bigint = 0n): PrivacySecret => {
      // Generate 8 random bytes, mask to 52 bits so it fits in the BN254 field
      // without bias (52 bits << 254-bit field prime).
      const randomBytes = crypto.getRandomValues(new Uint8Array(8));
      const raw =
        BigInt(
          "0x" +
            Array.from(randomBytes)
              .map((b) => b.toString(16).padStart(2, "0"))
              .join(""),
        ) &
        ((1n << 52n) - 1n);

      const { addr20, q, privacyAddress } = derivePrivacyAddress(tokenId, raw);

      return {
        secret: raw,
        privacyAddress,
        addr20,
        q,
        leafIndex: -1,
        amount: 0n,
        tokenId,
        spent: false,
      };
    },
    [],
  );

  // --- storeSecret ---

  /**
   * Persist a PrivacySecret (with confirmed leafIndex + amount) to the
   * in-memory map and localStorage.
   */
  const storeSecret = useCallback((secret: PrivacySecret) => {
    secretsRef.current.set(secret.privacyAddress, secret);
    saveSecretsToStorage(secretsRef.current);
  }, []);

  // --- resolveLeafIndex ---

  /**
   * After a deposit tx is confirmed, call this to match the on-chain leaf index
   * to a stored secret and update both `leafIndex` and `amount`.
   *
   * @param privacyAddress — The address returned by `generateSecret`.
   * @param leafIndex      — The 0-based index emitted by the Committed event.
   * @param amount         — The token amount deposited.
   */
  const resolveLeafIndex = useCallback(
    (privacyAddress: string, leafIndex: number, amount: bigint) => {
      const existing = secretsRef.current.get(privacyAddress);
      if (!existing) return;
      const updated = { ...existing, leafIndex, amount };
      secretsRef.current.set(privacyAddress, updated);
      saveSecretsToStorage(secretsRef.current);
    },
    [],
  );

  // --- markSpent ---

  /**
   * Mark a secret as spent after a successful remint tx so it is excluded
   * from future proof attempts.
   */
  const markSpent = useCallback((privacyAddress: string) => {
    const existing = secretsRef.current.get(privacyAddress);
    if (!existing) return;
    const updated = { ...existing, spent: true };
    secretsRef.current.set(privacyAddress, updated);
    saveSecretsToStorage(secretsRef.current);
  }, []);

  // --- generateRemintProof ---

  /**
   * Build the circuit input and generate a groth16 ZK proof for reminting
   * a commitment.
   *
   * Circuit artifacts are loaded lazily by snarkjs from:
   *   /circuits/remint.wasm
   *   /circuits/remint_final.zkey
   *
   * @param privacyAddress   — The privacy address whose secret to spend.
   * @param recipientAddress — The plain Ethereum address to remint tokens to.
   * @param amount           — The amount to remint (must be <= committed amount).
   * @param redeem           — If true, burn rather than remint (default false).
   * @param relayerFee       — Relayer fee scalar (default 0n).
   */
  const generateRemintProof = useCallback(
    async (
      privacyAddress: string,
      recipientAddress: `0x${string}`,
      amount: bigint,
      redeem = false,
      relayerFee = 0n,
    ): Promise<{ remintData: RemintData; zkProof: unknown; publicSignals: unknown }> => {
      const secretData = secretsRef.current.get(privacyAddress);
      if (!secretData) {
        throw new Error(`No secret found for privacy address ${privacyAddress}`);
      }
      if (secretData.spent) {
        throw new Error("This commitment has already been spent");
      }
      if (secretData.leafIndex === -1) {
        throw new Error(
          "Leaf index not yet resolved — deposit may not be confirmed on-chain",
        );
      }
      if (!treeRef.current) {
        throw new Error(
          "Merkle tree not synced — call syncTree() before generating a proof",
        );
      }

      setState((s) => ({
        ...s,
        isGeneratingProof: true,
        proofProgress: "building-tree",
        error: null,
      }));

      try {
        // 1. Obtain the Merkle proof path for this leaf.
        const { pathElements, pathIndices, root } = treeRef.current.getProof(
          secretData.leafIndex,
        );

        // 2. Derive the nullifier.
        const { nullifier } = calculateNullifier(
          secretData.addr20,
          secretData.secret,
        );

        setState((s) => ({ ...s, proofProgress: "generating-proof" }));

        // 3. Build the circuit input.  All fields are bigint as required by
        //    the CircuitInput type (snarkjs stringifies them internally).
        const circuitInput: CircuitInput = {
          root,
          nullifier,
          to: BigInt(recipientAddress),
          remintAmount: amount,
          id: secretData.tokenId,
          redeem: redeem ? 1n : 0n,
          relayerFee,
          secret: secretData.secret,
          addr20: secretData.addr20,
          commitAmount: secretData.amount,
          q: secretData.q,
          pathElements,
          pathIndices,
        };

        // 4. Generate the proof (~2–4 s in browser WASM).
        const { zkProof, publicSignals, proofBytes } =
          await generateZKProof(circuitInput);

        setState((s) => ({ ...s, proofProgress: "encoding" }));

        // 5. Assemble the RemintData struct expected by the contract.
        const rootHex = ("0x" +
          root.toString(16).padStart(64, "0")) as `0x${string}`;
        const nullifierHex = ("0x" +
          nullifier.toString(16).padStart(64, "0")) as `0x${string}`;

        const remintData: RemintData = {
          commitment: rootHex,
          nullifiers: [nullifierHex],
          proof: proofBytes as `0x${string}`,
          redeem,
          proverData: "0x",
          relayerData: "0x",
        };

        setState((s) => ({
          ...s,
          isGeneratingProof: false,
          proofProgress: "idle",
        }));

        return { remintData, zkProof, publicSignals };
      } catch (err) {
        setState((s) => ({
          ...s,
          isGeneratingProof: false,
          proofProgress: "idle",
          error: (err as Error).message,
        }));
        throw err;
      }
    },
    [],
  );

  // --- derived helpers ---

  /** All secrets that have a confirmed leaf index and have not been spent. */
  const unspentSecrets = Array.from(secretsRef.current.values()).filter(
    (s) => !s.spent && s.leafIndex !== -1,
  );

  /** Total unspent balance across all stored secrets (same token unit). */
  const totalUnspentAmount = unspentSecrets.reduce(
    (acc, s) => acc + s.amount,
    0n,
  );

  // --- return ---

  return {
    // State flags
    ...state,

    // Core operations
    syncTree,
    generateSecret,
    storeSecret,
    resolveLeafIndex,
    markSpent,
    generateRemintProof,

    // Raw refs (for advanced callers that need direct tree / secret access)
    tree: treeRef.current,
    secrets: secretsRef.current,

    // Derived convenience values
    unspentSecrets,
    totalUnspentAmount,
  };
}
