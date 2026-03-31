import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { encodeFunctionData, formatUnits, parseUnits } from "viem";
import {
  Wallet,
  Copy,
  Check,
  Shield,
  Coins,
  Loader2,
  ArrowDownToLine,
  Users,
  Zap,
  Download,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useStealthWallet } from "@/providers/stealth-wallet-provider";
import { useChain } from "@/providers/chain-provider";
import { useTokenBalance } from "@/hooks/use-stream-reads";
import { DepositPrivacyDialog } from "@/components/organisms/deposit-privacy-form";
import { CollectPrivacyDialog } from "@/components/organisms/collect-privacy-form";
import { useCollectableScanner } from "@/hooks/use-collectable-scanner";
import { useWalletRegistry } from "@/store/wallet-registry";
import { useSweep, useSweepAll } from "@/hooks/use-sweep";
import { useWalletDiscovery } from "@/hooks/use-wallet-discovery";
import { truncateAddress } from "@/utils";
import { getPublicClient, addressDriverAbi } from "@/utils/streams";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/wallet")({
  component: WalletPage,
});

const MINT_ABI = [
  {
    name: "mint",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

function BalanceItem({
  symbol,
  balance,
}: {
  symbol: string;
  balance: bigint | undefined;
}) {
  const formatted = useMemo(() => {
    if (balance === undefined) return "—";
    return parseFloat(formatUnits(balance, 18)).toFixed(2);
  }, [balance]);

  return (
    <div className="p-4 rounded-xl bg-background/50 border border-border">
      <p className="text-xs text-muted-foreground mb-1">{symbol}</p>
      <p className="text-xl font-light font-mono text-foreground">{formatted}</p>
    </div>
  );
}

function TypeBadge({ type }: { type: "stream" | "circle" }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        type === "stream"
          ? "bg-amber-500/10 text-amber-400"
          : "bg-lavender-500/10 text-lavender-400",
      ].join(" ")}
    >
      {type === "stream" ? <Zap className="w-3 h-3" /> : <Users className="w-3 h-3" />}
      {type}
    </span>
  );
}

function WalletPage() {
  const { chainConfig, chainId } = useChain();
  const stealthWallet = useStealthWallet();
  const { stealthAddress, isReady: isStealthReady, sendTransaction } = stealthWallet;

  const [copied, setCopied] = useState(false);
  const [mintingUsdc, setMintingUsdc] = useState(false);
  const [mintingUsdt, setMintingUsdt] = useState(false);
  const [shieldDialogOpen, setShieldDialogOpen] = useState(false);
  const [collectDialogOpen, setCollectDialogOpen] = useState(false);
  const [collectTokenAddress, setCollectTokenAddress] = useState<string>("");

  const walletAddress = isStealthReady && stealthAddress
    ? (stealthAddress as `0x${string}`)
    : undefined;

  const { data: usdcBalance } = useTokenBalance(walletAddress, chainConfig.contracts.mockUsdc);
  const { data: usdtBalance } = useTokenBalance(walletAddress, chainConfig.contracts.mockUsdt);
  const { data: zwUsdcBalance } = useTokenBalance(walletAddress, chainConfig.contracts.zwUsdc);
  const { data: zwUsdtBalance } = useTokenBalance(walletAddress, chainConfig.contracts.zwUsdt);

  // Collectable scanner
  const { collectableTokens, totalCollectable, scanResult, isScanning } = useCollectableScanner();

  // Derived wallets
  const { data: registry = [] } = useWalletRegistry(chainId);

  // Wallet discovery (orphan recovery)
  const { strandedWallets, isScanning: isDiscoveryScanning, rescan } = useWalletDiscovery();

  // Sweep hooks
  const sweep = useSweep();
  const sweepAll = useSweepAll();

  // Resolve main accountId for collect dialog
  const { data: mainAccountId } = useQuery({
    queryKey: ["accountId", chainId, stealthAddress],
    queryFn: async () => {
      const client = getPublicClient(chainConfig.chain);
      return client.readContract({
        address: chainConfig.contracts.addressDriver,
        abi: addressDriverAbi,
        functionName: "calcAccountId",
        args: [stealthAddress as `0x${string}`],
      });
    },
    enabled: isStealthReady && !!stealthAddress,
    staleTime: Infinity,
  });

  const handleCopy = () => {
    if (!stealthAddress) return;
    navigator.clipboard.writeText(stealthAddress);
    setCopied(true);
    toast.success("Address copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast.success("Address copied to clipboard");
  };

  const handleMint = async (token: "usdc" | "usdt") => {
    if (!isStealthReady || !stealthAddress) return;
    const tokenAddress =
      token === "usdc"
        ? chainConfig.contracts.mockUsdc
        : chainConfig.contracts.mockUsdt;
    const tokenSymbol = token === "usdc" ? "USDC" : "USDT";
    const setMinting = token === "usdc" ? setMintingUsdc : setMintingUsdt;
    setMinting(true);
    try {
      const data = encodeFunctionData({
        abi: MINT_ABI,
        functionName: "mint",
        args: [stealthAddress as `0x${string}`, parseUnits("1000", 18)],
      });
      await sendTransaction({ to: tokenAddress, data });
      toast.success(`Minted 1000 ${tokenSymbol} to your wallet`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mint failed";
      toast.error(`Failed to mint ${tokenSymbol}: ${message}`);
    } finally {
      setMinting(false);
    }
  };

  const handleCollect = (tokenAddress: string) => {
    setCollectTokenAddress(tokenAddress);
    setCollectDialogOpen(true);
  };

  const handleSweep = (walletIndex: number, walletAddress: `0x${string}`, tokenAddress: `0x${string}`) => {
    sweep.mutate({ walletIndex, walletAddress, tokenAddress });
  };

  const handleSweepAll = () => {
    const wallets = registry.map((w) => ({
      index: w.index,
      address: w.address as `0x${string}`,
    }));
    sweepAll.mutate({ wallets });
  };

  // Find derived wallet balances from scan result
  const getDerivedWalletTokens = (walletAddress: string) => {
    return scanResult.addresses.find(
      (a) => a.address.toLowerCase() === walletAddress.toLowerCase(),
    )?.tokens ?? [];
  };

  return (
    <div className="w-full max-w-7xl mx-auto">
      <DepositPrivacyDialog open={shieldDialogOpen} onOpenChange={setShieldDialogOpen} />
      {mainAccountId !== undefined && (
        <CollectPrivacyDialog
          open={collectDialogOpen}
          onOpenChange={setCollectDialogOpen}
          accountId={mainAccountId}
          tokenAddress={collectTokenAddress}
        />
      )}

      {/* Header */}
      <div className="mb-12">
        <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight text-foreground mb-3">
          Wallet
        </h1>
        <p className="text-muted-foreground text-lg">Manage your funds</p>
      </div>

      <div className="space-y-6">
        {/* Privacy Address Card */}
        <div className="p-6 rounded-2xl bg-card border border-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-foreground font-medium">Privacy Address</h2>
              <p className="text-muted-foreground text-sm">
                This is your private stealth address
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm font-mono bg-white/5 border border-white/10 px-3 py-2.5 rounded-lg truncate text-amber-300">
              {isStealthReady && stealthAddress ? (
                stealthAddress
              ) : (
                <span className="flex items-center gap-2 text-slate-500">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading…
                </span>
              )}
            </code>
            {isStealthReady && stealthAddress && (
              <button
                onClick={handleCopy}
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-border hover:border-amber-500/40 transition-all text-muted-foreground hover:text-foreground"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Balances Card */}
        <div className="p-6 rounded-2xl bg-card border border-border">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Coins className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-foreground font-medium">Balances</h2>
              <p className="text-muted-foreground text-sm">All tokens in your stealth wallet</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <BalanceItem symbol="USDT" balance={usdtBalance} />
            <BalanceItem symbol="USDC" balance={usdcBalance} />
            <BalanceItem symbol="zwUSDT" balance={zwUsdtBalance} />
            <BalanceItem symbol="zwUSDC" balance={zwUsdcBalance} />
          </div>
        </div>

        {/* Collectable Funds Card */}
        {totalCollectable > 0 && (
          <div className="p-6 rounded-2xl bg-card border border-amber-500/20">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Download className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-foreground font-medium">Collectable Funds</h2>
                <p className="text-muted-foreground text-sm">
                  {totalCollectable.toFixed(2)} tokens available to collect
                </p>
              </div>
              {isScanning && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
            </div>

            {/* Per-address breakdown */}
            {scanResult.addresses.length > 0 && (
              <div className="space-y-3 mb-4">
                {scanResult.addresses.map((addr) => (
                  <div
                    key={addr.address}
                    className="rounded-xl bg-background/50 border border-border p-4"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-mono text-muted-foreground">
                        {addr.label === "main" ? "Main wallet" : addr.label}
                      </span>
                      <span className="text-xs text-muted-foreground/60">
                        {truncateAddress(addr.address)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {addr.tokens.map((t) => (
                        <div key={t.symbol} className="flex items-center gap-2">
                          <span className="text-sm font-mono text-foreground">
                            {t.amount.toFixed(2)}
                          </span>
                          <span className="text-xs text-muted-foreground">{t.symbol}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Collect buttons — one per token with collectable balance */}
            <div className="flex flex-wrap gap-2">
              {collectableTokens.map((t) => (
                <button
                  key={t.symbol}
                  onClick={() => handleCollect(t.address)}
                  disabled={!mainAccountId}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-amber-500/30 text-sm font-medium text-amber-300 hover:bg-amber-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  Collect {t.amount.toFixed(2)} {t.symbol}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Mint Test Tokens */}
          <div className="p-6 rounded-2xl bg-card border border-border">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Coins className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-foreground font-medium">Mint Test Tokens</h2>
                <p className="text-muted-foreground text-sm">Free testnet tokens</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleMint("usdt")}
                disabled={!isStealthReady || mintingUsdt}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-border text-sm font-medium text-foreground hover:border-amber-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {mintingUsdt ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Mint 1000 USDT
              </button>
              <button
                onClick={() => handleMint("usdc")}
                disabled={!isStealthReady || mintingUsdc}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-border text-sm font-medium text-foreground hover:border-amber-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {mintingUsdc ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Mint 1000 USDC
              </button>
            </div>
          </div>

          {/* Shield Funds */}
          <div className="p-6 rounded-2xl bg-card border border-border">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h2 className="text-foreground font-medium">Shield Funds</h2>
                <p className="text-muted-foreground text-sm">Convert to private tokens</p>
              </div>
            </div>
            <p className="text-muted-foreground text-sm mb-4">
              Convert tokens to their private (zw) versions for private streaming.
            </p>
            <button
              onClick={() => setShieldDialogOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-border text-sm font-medium text-foreground hover:border-rose-500/40 transition-all"
            >
              <Shield className="w-4 h-4" />
              Shield Funds
            </button>
          </div>
        </div>

        {/* Stranded Wallets — orphaned funds from failed stream creation */}
        {strandedWallets.length > 0 && (
          <div className="p-6 rounded-2xl bg-card border border-rose-500/20">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-foreground font-medium">Stranded Funds</h2>
                <p className="text-muted-foreground text-sm">
                  Wallets with tokens but no active stream — sweep back to your main wallet
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {strandedWallets.map((w) => (
                <div
                  key={w.index}
                  className="rounded-xl bg-background/50 border border-rose-500/15 p-4"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <button
                      onClick={() => handleCopyAddress(w.address)}
                      className="text-sm font-mono text-foreground/80 hover:text-foreground transition-colors"
                    >
                      {truncateAddress(w.address)}
                    </button>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400">
                      <AlertTriangle className="w-3 h-3" />
                      stranded
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {w.erc20Balances.map((b) => (
                      <div key={b.token.symbol} className="flex items-center gap-2">
                        <span className="text-sm font-mono text-foreground">
                          {parseFloat(formatUnits(b.balance, 18)).toFixed(2)}
                        </span>
                        <span className="text-xs text-muted-foreground">{b.token.symbol}</span>
                        <button
                          onClick={() =>
                            handleSweep(w.index, w.address as `0x${string}`, b.token.address)
                          }
                          disabled={sweep.isPending}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-amber-400 border border-amber-500/30 hover:bg-amber-500/10 transition-all disabled:opacity-50"
                        >
                          <ArrowDownToLine className="w-3 h-3" />
                          sweep
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Derived Wallets Card */}
        <div className="p-6 rounded-2xl bg-card border border-border">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-lavender-500/10 flex items-center justify-center">
              <ArrowDownToLine className="w-5 h-5 text-lavender-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-foreground font-medium">Derived Wallets</h2>
              <p className="text-muted-foreground text-sm">
                Isolated wallets for streams and circles
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isDiscoveryScanning && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Scanning…
                </span>
              )}
              <button
                onClick={rescan}
                disabled={isDiscoveryScanning}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-lavender-500/40 transition-all disabled:opacity-50"
              >
                <RefreshCw className="w-3 h-3" />
                Rescan
              </button>
              {registry.length > 1 && (
                <button
                  onClick={handleSweepAll}
                  disabled={sweepAll.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-amber-500/40 transition-all disabled:opacity-50"
                >
                  {sweepAll.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <ArrowDownToLine className="w-3 h-3" />
                  )}
                  Sweep All
                </button>
              )}
            </div>
          </div>

          {registry.length === 0 ? (
            <div className="rounded-xl bg-background/50 border border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No derived wallets yet. Enable derived wallets in Settings to isolate stream funds.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {registry
                .filter((entry) => {
                  // Hide wallets with zero balances everywhere
                  const walletTokens = getDerivedWalletTokens(entry.address);
                  return walletTokens.length > 0;
                })
                .map((entry) => {
                  const walletTokens = getDerivedWalletTokens(entry.address);
                  return (
                    <div
                      key={entry.entityId}
                      className="rounded-xl bg-background/50 border border-border p-4"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <button
                          onClick={() => handleCopyAddress(entry.address)}
                          className="text-sm font-mono text-foreground/80 hover:text-foreground transition-colors"
                        >
                          {truncateAddress(entry.address)}
                        </button>
                        <TypeBadge type={entry.type} />
                        {entry.isOrphan && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400">
                            recovered
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground/60 ml-auto">
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Entity ID */}
                      <p className="text-xs text-muted-foreground mb-2 truncate">
                        {entry.type === "stream" ? "Stream" : "Circle"}: {entry.entityId}
                      </p>

                      {/* Token balances from scan + sweep buttons */}
                      <div className="flex items-center gap-3 flex-wrap">
                        {walletTokens.map((t) => (
                          <div key={t.symbol} className="flex items-center gap-2">
                            <span className="text-sm font-mono text-foreground">
                              {t.amount.toFixed(2)}
                            </span>
                            <span className="text-xs text-muted-foreground">{t.symbol}</span>
                            <button
                              onClick={() =>
                                handleSweep(entry.index, entry.address as `0x${string}`, t.address)
                              }
                              disabled={sweep.isPending}
                              className="text-xs text-amber-400/70 hover:text-amber-400 transition-colors disabled:opacity-50"
                            >
                              sweep
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              {registry.every((entry) => getDerivedWalletTokens(entry.address).length === 0) && (
                <div className="rounded-xl bg-background/50 border border-border p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    All derived wallets are empty.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
