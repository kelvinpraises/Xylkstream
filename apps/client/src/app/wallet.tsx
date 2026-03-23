import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { encodeFunctionData, formatUnits, parseUnits } from "viem";
import { Wallet, Copy, Check, Shield, Coins, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useStealthWallet } from "@/providers/stealth-wallet-provider";
import { useChain } from "@/providers/chain-provider";
import { useTokenBalance } from "@/hooks/use-stream-reads";
import { DepositPrivacyDialog } from "@/components/organisms/deposit-privacy-form";

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

function WalletPage() {
  const { chainConfig } = useChain();
  const stealthWallet = useStealthWallet();
  const { stealthAddress, isReady: isStealthReady, sendTransaction } = stealthWallet;

  const [copied, setCopied] = useState(false);
  const [mintingUsdc, setMintingUsdc] = useState(false);
  const [mintingUsdt, setMintingUsdt] = useState(false);
  const [shieldDialogOpen, setShieldDialogOpen] = useState(false);

  const walletAddress = isStealthReady && stealthAddress
    ? (stealthAddress as `0x${string}`)
    : undefined;

  const { data: usdcBalance } = useTokenBalance(walletAddress, chainConfig.contracts.mockUsdc);
  const { data: usdtBalance } = useTokenBalance(walletAddress, chainConfig.contracts.mockUsdt);
  const { data: zwUsdcBalance } = useTokenBalance(walletAddress, chainConfig.contracts.zwUsdc);
  const { data: zwUsdtBalance } = useTokenBalance(walletAddress, chainConfig.contracts.zwUsdt);

  const handleCopy = () => {
    if (!stealthAddress) return;
    navigator.clipboard.writeText(stealthAddress);
    setCopied(true);
    toast.success("Address copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
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

  return (
    <div className="w-full max-w-7xl mx-auto">
      <DepositPrivacyDialog open={shieldDialogOpen} onOpenChange={setShieldDialogOpen} />

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
      </div>
    </div>
  );
}
