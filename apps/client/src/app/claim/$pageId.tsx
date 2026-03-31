import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { formatUnits, createWalletClient, custom, encodeFunctionData } from "viem";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Card } from "@/components/molecules/card";
import {
  Wallet,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Link2,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { config } from "@/config";
import { useNow } from "@/hooks/use-now";
import { useChain } from "@/providers/chain-provider";
import { useStealthWallet } from "@/providers/stealth-wallet-provider";
import { calcAccountId, addressDriverAbi, getPublicClient } from "@/utils/streams";
import { getRegistry } from "@/store/wallet-registry";

export const Route = createFileRoute("/claim/$pageId")({
  component: ClaimPage,
});

const TOKEN_DECIMALS = 18;

const COLLECT_SUB_STEPS = ["receiveStreams", "split", "collect"] as const;
type CollectSubStep = (typeof COLLECT_SUB_STEPS)[number];

const COLLECT_SUB_STEP_LABELS: Record<CollectSubStep, string> = {
  receiveStreams: "receive streams",
  split: "split balance",
  collect: "collect funds",
};

interface ClaimData {
  id: string;
  stream_id: string;
  recipient_address: string;
  token_address: string;
  token_symbol: string;
  total_amount: string;
  amt_per_sec: string;
  start_timestamp: number;
  end_timestamp: number;
  title: string;
  subtitle: string;
  chain_id: number;
}

// --- wallet matching ---

type WalletMatch =
  | { type: "stealth" }
  | { type: "derived"; index: number }
  | { type: "external"; address: string }
  | { type: "none" };

function useWalletMatch(
  recipientAddress: string,
  stealthAddress: string | null | undefined,
  chainId: number,
  authenticated: boolean,
): WalletMatch {
  return useMemo(() => {
    if (!authenticated) return { type: "none" };

    const recipient = recipientAddress.toLowerCase();

    // Check main stealth wallet
    if (stealthAddress && stealthAddress.toLowerCase() === recipient) {
      return { type: "stealth" };
    }

    // Check derived wallets in registry
    const registry = getRegistry(chainId);
    const derived = registry.find(
      (w) => w.address.toLowerCase() === recipient,
    );
    if (derived) {
      return { type: "derived", index: derived.index };
    }

    return { type: "none" };
  }, [recipientAddress, stealthAddress, chainId, authenticated]);
}

// --- page ---

function ClaimPage() {
  const { pageId } = Route.useParams();
  const { login, authenticated, ready } = usePrivy();

  const { data: claim, isLoading } = useQuery<ClaimData>({
    queryKey: ["claim", pageId],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/claims/${pageId}`);
      if (!res.ok) throw new Error("Claim not found");
      const { claim } = await res.json();
      return claim;
    },
  });

  if (isLoading || !ready) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </PageShell>
    );
  }

  if (!claim) {
    return (
      <PageShell>
        <div className="text-center mb-12">
          <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-7 h-7 text-muted-foreground" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight text-foreground mb-4">
            Link Not Found
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            This payment link doesn't exist. Check with the sender for the correct link.
          </p>
        </div>
      </PageShell>
    );
  }

  if (!authenticated) {
    return <UnauthenticatedView claim={claim} onLogin={login} />;
  }

  return <AuthenticatedView claim={claim} />;
}

// --- page shell ---

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-background via-background to-amber-950/20 flex flex-col items-center justify-center px-6 py-16">
      <motion.div
        className="w-full max-w-2xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {children}
      </motion.div>
      <div className="mt-12 text-center">
        <p className="text-sm text-muted-foreground">
          Powered by{" "}
          <a href="/" className="font-medium text-foreground hover:underline">
            Xylkstream
          </a>
        </p>
      </div>
    </div>
  );
}

// --- stream progress (shared) ---

function useStreamProgress(claim: ClaimData) {
  const nowSecs = useNow();
  const duration = claim.end_timestamp - claim.start_timestamp;
  const elapsed = Math.max(0, nowSecs - claim.start_timestamp);
  const progress = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
  const streamed = parseFloat(claim.total_amount) * (progress / 100);
  const monthlyRate = parseFloat(claim.total_amount) / Math.max(1, duration / (86400 * 30));
  return { progress, streamed, monthlyRate, duration, elapsed };
}

function StreamProgressCard({ claim, children }: { claim: ClaimData; children?: React.ReactNode }) {
  const { progress, streamed, monthlyRate } = useStreamProgress(claim);

  return (
    <div className="mb-8">
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Delivered</p>
          <p className="text-2xl font-light font-mono">{streamed.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Total</p>
          <p className="text-2xl font-light font-mono">
            {claim.total_amount} <span className="text-sm text-muted-foreground">{claim.token_symbol}</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Rate</p>
          <p className="text-2xl font-light font-mono">
            {monthlyRate.toFixed(2)}<span className="text-sm text-muted-foreground">/{claim.token_symbol === "USDT" || claim.token_symbol === "USDC" ? "mo" : "mo"}</span>
          </p>
        </div>
      </div>

      <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-amber-500/60 rounded-full relative transition-all duration-1000"
          style={{ width: `${progress}%` }}
        >
          {progress < 100 && (
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
              style={{ animation: "flow 2s infinite" }}
            />
          )}
        </div>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{progress.toFixed(0)}% delivered</span>
        <span>{monthlyRate.toFixed(2)} {claim.token_symbol}/mo</span>
      </div>

      {children}
    </div>
  );
}

// --- unauthenticated view ---

function UnauthenticatedView({ claim, onLogin }: { claim: ClaimData; onLogin: () => void }) {
  return (
    <PageShell>
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-6">
          <Wallet className="w-4 h-4 text-amber-400" />
          <span className="text-sm text-amber-400">{claim.token_symbol} Payment</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight text-foreground mb-4">
          {claim.title}
        </h1>
        {claim.subtitle && (
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            {claim.subtitle}
          </p>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <Card className="p-8 border border-amber-500/20 bg-gradient-to-b from-card to-amber-950/5">
          <StreamProgressCard claim={claim} />
          <div className="text-center">
            <Button
              onClick={onLogin}
              className="px-8 py-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-full text-lg font-medium shadow-[0_0_25px_-8px_rgba(251,191,36,0.3)] hover:shadow-[0_0_35px_-5px_rgba(251,191,36,0.5)] transition-all"
            >
              Sign In to Collect
            </Button>
          </div>
        </Card>
      </motion.div>

      <style>{`
        @keyframes flow {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </PageShell>
  );
}

// --- authenticated view ---

function AuthenticatedView({ claim }: { claim: ClaimData }) {
  const { chainConfig, chainId, switchChain } = useChain();
  const claimChain = Number(claim.chain_id);
  const chainReady = chainId === claimChain;

  // Switch to the claim's chain — the claim knows where the stream lives
  useEffect(() => {
    if (!chainReady) switchChain(claimChain);
  }, [chainReady, claimChain, switchChain]);

  // Don't render until we're on the right chain
  if (!chainReady) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
          <p className="text-sm text-muted-foreground">Switching to the right network...</p>
        </div>
      </PageShell>
    );
  }
  const { stealthAddress, isReady: stealthReady, isDeriving, deriveWallet, sendTransaction, sendTransactionFrom, waitForUserOp } = useStealthWallet();
  const { wallets } = useWallets();
  const { connectWallet: privyConnectWallet, authenticated } = usePrivy();
  const { streamed, progress } = useStreamProgress(claim);

  const [collectState, setCollectState] = useState<"ready" | "collecting" | "done" | "error">("ready");
  const [activeSubStep, setActiveSubStep] = useState<CollectSubStep | null>(null);
  const [isBatched, setIsBatched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collectTxHash, setCollectTxHash] = useState<string | null>(null);
  const [stealthPassword, setStealthPassword] = useState("");
  const [stealthUnlockError, setStealthUnlockError] = useState("");

  // Match recipient to a wallet we control
  const walletMatch = useWalletMatch(claim.recipient_address, stealthAddress, chainId, authenticated);

  // Derive accountId directly — read driverId from contract
  const tokenAddr = claim.token_address as `0x${string}`;
  const { data: driverId } = useQuery({
    queryKey: ["driverId", chainId],
    queryFn: async () => {
      const client = getPublicClient(chainConfig.chain);
      const id = await client.readContract({
        address: chainConfig.contracts.addressDriver,
        abi: addressDriverAbi,
        functionName: "DRIVER_ID",
      });
      return BigInt(id as number | bigint);
    },
    staleTime: Infinity,
  });

  const accountId = useMemo(() => {
    if (driverId === undefined) return undefined;
    return calcAccountId(driverId, claim.recipient_address);
  }, [driverId, claim.recipient_address]);

  // On-chain balance reads — direct contract calls using claim's chain
  // Drips requires receiveStreams (state-changing) before funds appear in splittable.
  // We simulate receiveStreams via eth_call to get the pre-splittable receivable amount.
  const { data: onChainData } = useQuery({
    queryKey: ["claim-balances", chainId, accountId?.toString(), tokenAddr],
    queryFn: async () => {
      if (!accountId) return { splittable: 0n, collectable: 0n, receivable: 0n };
      const client = getPublicClient(chainConfig.chain);
      const [splittable, collectable, receivable] = await Promise.all([
        client.readContract({
          address: chainConfig.contracts.dripsProxy,
          abi: [{ type: "function", name: "splittable", inputs: [{ type: "uint256" }, { type: "address" }], outputs: [{ type: "uint128" }], stateMutability: "view" }],
          functionName: "splittable",
          args: [accountId, tokenAddr],
        }) as Promise<bigint>,
        client.readContract({
          address: chainConfig.contracts.dripsProxy,
          abi: [{ type: "function", name: "collectable", inputs: [{ type: "uint256" }, { type: "address" }], outputs: [{ type: "uint128" }], stateMutability: "view" }],
          functionName: "collectable",
          args: [accountId, tokenAddr],
        }) as Promise<bigint>,
        // Simulate receiveStreams to get the amount sitting in cycles (not yet in splittable)
        client.simulateContract({
          address: chainConfig.contracts.dripsProxy,
          abi: [{ type: "function", name: "receiveStreams", inputs: [{ type: "uint256", name: "accountId" }, { type: "address", name: "erc20" }, { type: "uint32", name: "maxCycles" }], outputs: [{ type: "uint128", name: "receivedAmt" }], stateMutability: "nonpayable" }],
          functionName: "receiveStreams",
          args: [accountId, tokenAddr, 1000],
        }).then((r) => r.result as bigint).catch(() => 0n),
      ]);
      return { splittable, collectable, receivable };
    },
    enabled: !!accountId,
    refetchInterval: 15_000,
  });

  const onChainAvailable = (onChainData?.splittable ?? 0n) + (onChainData?.collectable ?? 0n) + (onChainData?.receivable ?? 0n);
  const onChainFormatted = formatUnits(onChainAvailable, TOKEN_DECIMALS);

  // Check all connected wallets (Privy embedded + any external like MetaMask)
  const recipientLower = claim.recipient_address.toLowerCase();
  const matchingWallet = wallets.find((w) => w.address.toLowerCase() === recipientLower);

  // Can collect if: delivered > 0 AND we have a matching wallet (stealth, derived, or external)
  const hasMatchingWallet = authenticated && (walletMatch.type !== "none" || !!matchingWallet);

  // Detect "already collected" — stream finished, on-chain query loaded, nothing left
  const streamEnded = progress >= 100;
  const alreadyCollected = streamEnded && onChainData !== undefined && onChainAvailable === 0n;

  const canCollect = streamed > 0 && hasMatchingWallet && !alreadyCollected;

  // Sub-steps are set directly in handleCollect via setActiveSubStep calls

  const handleCollect = useCallback(async () => {
    if (!accountId) {
      toast.error("Could not resolve recipient account. Try refreshing.");
      return;
    }
    setError(null);
    setCollectState("collecting");
    setActiveSubStep("receiveStreams");

    try {
      const publicClient = getPublicClient(chainConfig.chain);
      const { contracts } = chainConfig;

      const receiveStreamsData = encodeFunctionData({
        abi: [{ type: "function", name: "receiveStreams", inputs: [{ type: "uint256" }, { type: "address" }, { type: "uint32" }], outputs: [{ type: "uint128" }], stateMutability: "nonpayable" }],
        functionName: "receiveStreams",
        args: [accountId, tokenAddr, 1000],
      });
      const splitData = encodeFunctionData({
        abi: [{ type: "function", name: "split", inputs: [{ type: "uint256" }, { type: "address" }, { type: "tuple[]", components: [{ type: "uint256", name: "accountId" }, { type: "uint32", name: "weight" }] }], outputs: [{ type: "uint128" }, { type: "uint128" }], stateMutability: "nonpayable" }],
        functionName: "split",
        args: [accountId, tokenAddr, []],
      });

      // --- INTERNAL PATH: Xylkstream wallet (stealth or derived) ---
      // Batch all 3 calls into a single UserOp via Safe multiSend.
      if (walletMatch.type === "stealth" || walletMatch.type === "derived") {
        const destination = stealthAddress as `0x${string}` ?? claim.recipient_address as `0x${string}`;
        const collectCalldata = encodeFunctionData({
          abi: addressDriverAbi,
          functionName: "collect",
          args: [tokenAddr, destination],
        });

        const batchTxs = [
          { to: contracts.dripsProxy, data: receiveStreamsData, value: 0n },
          { to: contracts.dripsProxy, data: splitData, value: 0n },
          { to: contracts.addressDriver, data: collectCalldata, value: 0n },
        ];

        toast.loading("Collecting funds...", { id: "claim-collect" });
        setIsBatched(true);
        setActiveSubStep("receiveStreams");

        const send = walletMatch.type === "stealth"
          ? () => sendTransaction(batchTxs)
          : () => sendTransactionFrom(walletMatch.index, batchTxs);

        const result = await send();
        if (result.hash) await waitForUserOp(result.hash as string);
        setCollectTxHash(result.hash as string);
        setActiveSubStep("collect");

      // --- EXTERNAL PATH: MetaMask / connected wallet ---
      // Steps 1-2 permissionless via external wallet, step 3 collect from it.
      } else if (matchingWallet) {
        await matchingWallet.switchChain(chainConfig.chain.id);
        const extProvider = await matchingWallet.getEthereumProvider();
        const extClient = createWalletClient({
          account: matchingWallet.address as `0x${string}`,
          chain: chainConfig.chain,
          transport: custom(extProvider),
        });

        toast.loading("Step 1/3 — receiving streams...", { id: "claim-collect" });
        const h1 = await extClient.sendTransaction({ to: contracts.dripsProxy, data: receiveStreamsData });
        await publicClient.waitForTransactionReceipt({ hash: h1 });

        setActiveSubStep("split");
        toast.loading("Step 2/3 — splitting balance...", { id: "claim-collect" });
        const h2 = await extClient.sendTransaction({ to: contracts.dripsProxy, data: splitData });
        await publicClient.waitForTransactionReceipt({ hash: h2 });

        setActiveSubStep("collect");
        toast.loading("Step 3/3 — collecting funds...", { id: "claim-collect" });
        const collectHash = await extClient.writeContract({
          address: contracts.addressDriver,
          abi: addressDriverAbi,
          functionName: "collect",
          args: [tokenAddr, matchingWallet.address as `0x${string}`],
        });
        await publicClient.waitForTransactionReceipt({ hash: collectHash });
        setCollectTxHash(collectHash);

      } else {
        throw new Error("No wallet matching the recipient address. Connect the correct wallet.");
      }

      setCollectState("done");
      toast.success(`Collected ${streamed.toFixed(2)} ${claim.token_symbol}!`, { id: "claim-collect" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Collection failed";
      setError(msg);
      setCollectState("error");
      toast.error(msg, { id: "claim-collect" });
    }
  }, [accountId, tokenAddr, walletMatch, matchingWallet, stealthAddress, wallets, chainConfig, sendTransaction, sendTransactionFrom, waitForUserOp, claim.recipient_address]);

  function subStepStatus(sub: CollectSubStep): "pending" | "active" | "done" {
    if (collectState === "done") return "done";
    if (activeSubStep === null) return "pending";
    const activeIdx = COLLECT_SUB_STEPS.indexOf(activeSubStep);
    const subIdx = COLLECT_SUB_STEPS.indexOf(sub);
    if (subIdx < activeIdx) return "done";
    if (subIdx === activeIdx) return "active";
    return "pending";
  }

  return (
    <PageShell>
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-6">
          <Wallet className="w-4 h-4 text-amber-400" />
          <span className="text-sm text-amber-400">{claim.token_symbol} Payment</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight text-foreground mb-4">
          {claim.title}
        </h1>
        {claim.subtitle && (
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            {claim.subtitle}
          </p>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <Card className="p-8 border border-amber-500/20 bg-gradient-to-b from-card to-amber-950/5">
          <StreamProgressCard claim={claim}>
            {/* On-chain balance breakdown */}
            {onChainAvailable > 0n && (
              <div className="rounded-lg border border-amber-500/15 bg-amber-500/5 p-3 mt-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">On-chain available</p>
                <p className="font-mono text-lg text-amber-400 font-light">
                  {parseFloat(onChainFormatted).toFixed(4)}
                  <span className="text-xs text-muted-foreground ml-1.5">{claim.token_symbol}</span>
                </p>
              </div>
            )}
          </StreamProgressCard>

          {/* Wallet status */}
          {collectState === "ready" && !alreadyCollected && (
            <>
              {hasMatchingWallet && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 mb-6">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <p className="text-xs text-emerald-300/80">
                    Wallet matched. Ready to collect.
                  </p>
                </div>
              )}

              {!hasMatchingWallet && (
                <div className="space-y-4 mb-6">
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-300/80">
                      <p>Connect the wallet this payment was sent to.</p>
                      <p className="text-muted-foreground mt-1 font-mono text-[10px] break-all">
                        {claim.recipient_address}
                      </p>
                    </div>
                  </div>

                  {!stealthReady && localStorage.getItem("xylkstream_pwd_hash") ? (
                    // Existing user on this browser — unlock stealth wallet
                    <div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="password"
                          placeholder="Enter your password"
                          value={stealthPassword}
                          onChange={(e) => { setStealthPassword(e.target.value); setStealthUnlockError(""); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && stealthPassword) {
                              deriveWallet(stealthPassword).catch((err: Error) => setStealthUnlockError(err.message));
                            }
                          }}
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          onClick={() => {
                            if (!stealthPassword) return;
                            deriveWallet(stealthPassword).catch((err: Error) => setStealthUnlockError(err.message));
                          }}
                          disabled={isDeriving || !stealthPassword}
                        >
                          {isDeriving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Unlock"}
                        </Button>
                      </div>
                      {stealthUnlockError && (
                        <p className="text-xs text-rose-400 mt-2">{stealthUnlockError}</p>
                      )}
                    </div>
                  ) : (
                    // New user or stealth already unlocked but didn't match — connect external wallet
                    <Button
                      variant="outline"
                      onClick={() => privyConnectWallet()}
                      className="w-full"
                    >
                      <Link2 className="w-4 h-4 mr-2" />
                      Connect Wallet
                    </Button>
                  )}
                </div>
              )}
            </>
          )}

          {/* Already collected */}
          {collectState === "ready" && alreadyCollected && (
            <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-900/5 p-5 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-foreground font-medium">Already collected</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {parseFloat(claim.total_amount).toFixed(2)} {claim.token_symbol} was fully collected from this stream.
                </p>
              </div>
              <div className="pt-2">
                <Link to="/dashboard">
                  <Button variant="outline" className="rounded-full">
                    Go to Dashboard
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {/* Collect button */}
          {collectState === "ready" && !alreadyCollected && (
            <div className="text-center">
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 mb-4">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-300">{error}</p>
                </div>
              )}
              <Button
                onClick={handleCollect}
                disabled={!canCollect}
                className="px-8 py-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-full text-lg font-medium shadow-[0_0_25px_-8px_rgba(251,191,36,0.3)] hover:shadow-[0_0_35px_-5px_rgba(251,191,36,0.5)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ArrowRight className="w-5 h-5 mr-2" />
                Collect {streamed > 0 ? `${streamed.toFixed(2)} ${claim.token_symbol}` : "Funds"}
              </Button>
              {streamed === 0 && (
                <p className="text-xs text-muted-foreground mt-3">
                  No funds delivered yet. Check back later.
                </p>
              )}
            </div>
          )}

          {/* Collecting state */}
          {collectState === "collecting" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
                <Loader2 className="w-5 h-5 text-amber-400 animate-spin shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-300">Collecting on-chain</p>
                  <p className="text-xs text-amber-300/60 mt-0.5">
                    {isBatched
                      ? "Processing — do not close this window"
                      : "3 transactions required — do not close this window"}
                  </p>
                </div>
              </div>

              {/* Step-by-step progress only for external wallets (3 separate txs) */}
              {!isBatched && (
                <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                  {COLLECT_SUB_STEPS.map((sub) => {
                    const status = subStepStatus(sub);
                    return (
                      <div key={sub} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                          {status === "done" ? (
                            <CheckCircle2 className="w-4 h-4 text-amber-400" />
                          ) : status === "active" ? (
                            <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                          ) : (
                            <div className="w-3 h-3 rounded-full border border-stone-600" />
                          )}
                        </div>
                        <span
                          className={
                            status === "done"
                              ? "text-sm text-muted-foreground line-through"
                              : status === "active"
                                ? "text-sm text-amber-300 font-medium"
                                : "text-sm text-stone-500"
                          }
                        >
                          {COLLECT_SUB_STEP_LABELS[sub]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Error state */}
          {collectState === "error" && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <p className="text-xs text-rose-300">{error}</p>
              </div>
              <div className="text-center">
                <Button
                  variant="outline"
                  onClick={() => {
                    setError(null);
                    setCollectState("ready");
                  }}
                >
                  Try Again
                </Button>
              </div>
            </div>
          )}

          {/* Done state */}
          {collectState === "done" && (
            <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-rose-500/5 p-5 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <p className="text-foreground font-medium">Funds collected!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {streamed.toFixed(2)} {claim.token_symbol} transferred to your wallet
                </p>
              </div>
              {collectTxHash && (
                <a
                  href={`${chainConfig.chain.blockExplorers?.default?.url ?? ""}/tx/${collectTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-amber-400/70 hover:text-amber-400 transition-colors"
                >
                  View on block explorer
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <div className="pt-2">
                <Link to="/dashboard">
                  <Button className="bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-full">
                    Go to Dashboard
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </Card>
      </motion.div>

      <style>{`
        @keyframes flow {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </PageShell>
  );
}
