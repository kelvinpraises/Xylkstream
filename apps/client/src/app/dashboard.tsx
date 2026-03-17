import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Droplets, Activity, TrendingUp, Wallet, ShieldCheck } from "lucide-react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useMemo, useState } from "react";
import { formatUnits } from "viem";
import { StreamCard } from "@/components/organisms/stream-card";
import { YieldReactor } from "@/components/organisms/yield-reactor";
import { WelcomeDialog } from "@/components/organisms/welcome-dialog";
import { PasswordDialog } from "@/components/organisms/password-dialog";
import { DepositPrivacyDialog } from "@/components/organisms/deposit-privacy-form";
import { Skeleton } from "@/components/atoms/skeleton";
import { Badge } from "@/components/atoms/badge";
import { truncateAddress, cn } from "@/utils";
import { getStreams } from "@/store/stream-store";
import { useTokenBalance } from "@/hooks/use-stream-reads";
import { useStealthWallet } from "@/hooks/use-stealth-wallet";
import { useChain } from "@/providers/chain-provider";
import { getSendableTokens } from "@/config/chains";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

function StatSkeleton() {
  return (
    <div className="p-6 rounded-2xl bg-card border border-border">
      <Skeleton className="w-12 h-12 rounded-full mb-4" />
      <Skeleton className="w-24 h-4 mb-3" />
      <Skeleton className="w-32 h-8 mb-2" />
      <Skeleton className="w-20 h-4" />
    </div>
  );
}


function DashboardPage() {
  const navigate = useNavigate();
  const { ready } = usePrivy();
  const { wallets } = useWallets();
  const [shieldDialogOpen, setShieldDialogOpen] = useState(false);

  // Privy embedded wallet address
  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
  const walletAddress = embeddedWallet?.address as `0x${string}` | undefined;

  // Stealth wallet (privacy layer)
  const { stealthAddress, isReady: isStealthReady } = useStealthWallet();

  // Chain config
  const { chainConfig, chainId } = useChain();

  // Primary token balance
  const primaryToken = getSendableTokens(chainConfig.contracts)[0]?.address;

  const { data: tokenBalanceRaw } = useTokenBalance(walletAddress, primaryToken);

  const walletBalance = useMemo(() => {
    if (tokenBalanceRaw === undefined) return null;
    return parseFloat(formatUnits(tokenBalanceRaw, 18));
  }, [tokenBalanceRaw]);

  // Stealth wallet balance (zwUSDC)
  const { data: stealthBalanceRaw } = useTokenBalance(
    isStealthReady && stealthAddress ? (stealthAddress as `0x${string}`) : undefined,
    chainConfig.contracts.zwUsdc,
  );
  const stealthBalance = useMemo(() => {
    if (!stealthBalanceRaw) return 0;
    return parseFloat(formatUnits(stealthBalanceRaw, 18));
  }, [stealthBalanceRaw]);

  // Streams from localStorage (partitioned by chain)
  const streams = useMemo(() => getStreams(chainId), [chainId]);
  const isLoading = !ready;

  const [nowSecs] = useState(() => Math.floor(Date.now() / 1000));

  // Compute stats from localStorage streams
  const stats = useMemo(() => {
    const activeStreams = streams.filter((s) => s.endTimestamp > nowSecs).length;
    const totalAmount = streams.reduce((sum, s) => sum + parseFloat(s.totalAmount || "0"), 0);
    const outflowRate = streams
      .filter((s) => s.endTimestamp > nowSecs)
      .reduce((sum, s) => {
        // amtPerSec is in internal Drips units (wei * 10^9), convert back to tokens/sec
        const rawPerSec = BigInt(s.amtPerSec);
        const tokensPerSec = Number(rawPerSec) / 1e27; // 10^18 decimals * 10^9 multiplier
        return sum + tokensPerSec;
      }, 0);
    return { activeStreams, totalAmount, outflowRate };
  }, [streams, nowSecs]);

  // Format streams for StreamCard
  const formattedStreams = useMemo(() => {
    return streams.map((s) => {
      const duration = s.endTimestamp - s.startTimestamp;
      const elapsed = Math.max(0, nowSecs - s.startTimestamp);
      const progress = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
      const streamed = parseFloat(s.totalAmount) * (progress / 100);
      const isActive = s.endTimestamp > nowSecs;
      return {
        id: s.id,
        recipientName: truncateAddress(s.recipientAddress),
        recipientAddress: truncateAddress(s.recipientAddress),
        avatarFallback: s.recipientAddress.slice(2, 4).toUpperCase(),
        status: (isActive ? "ACTIVE" : "COMPLETED") as "ACTIVE" | "COMPLETED",
        streamedAmount: streamed,
        streamedCurrency: s.tokenSymbol,
        rateAmount: parseFloat(s.totalAmount) / Math.max(1, duration / (86400 * 30)),
        rateInterval: "/mo",
        progress,
      };
    });
  }, [streams, nowSecs]);

  const hasStreams = streams.length > 0;
  const totalDisplayBalance = (walletBalance ?? 0) + stealthBalance;

  return (
    <div className="w-full max-w-7xl mx-auto">
      {/* Welcome dialog for new users */}
      <WelcomeDialog />
      {/* Password dialog — derives stealth wallet after login */}
      <PasswordDialog />
      {/* Privacy deposit dialog */}
      <DepositPrivacyDialog open={shieldDialogOpen} onOpenChange={setShieldDialogOpen} />

      {/* Header */}
      <div className="mb-12">
        <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight text-foreground mb-3">
          Home
        </h1>
        <p className="text-muted-foreground text-lg">
          See how your payments are doing
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid md:grid-cols-3 gap-6 mb-12">
        {isLoading ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : (
          <>
            {/* Total Outflow / Balance with Shader */}
            <div className="relative p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all overflow-hidden">
              <div className="absolute inset-0 opacity-30">
                <YieldReactor
                  active={true}
                  intensity={hasStreams && stats.outflowRate > 0 ? Math.min(Math.max(70, stats.outflowRate * 150), 300) : 40}
                />
              </div>

              <div className="relative z-10">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
                  {hasStreams ? (
                    <Droplets className="w-6 h-6 text-amber-400" />
                  ) : (
                    <Wallet className="w-6 h-6 text-amber-400" />
                  )}
                </div>
                <h3 className="text-muted-foreground text-sm mb-2">
                  {hasStreams ? "Sending" : "Your Balance"}
                </h3>
                {hasStreams ? (
                  <>
                    <p className="text-3xl font-light text-foreground font-mono">
                      {(stats.outflowRate * 86400 * 30).toFixed(2)}
                    </p>
                    <p className="text-muted-foreground text-sm mt-1">/ month</p>
                  </>
                ) : (
                  <>
                    <p className="text-3xl font-light text-foreground font-mono">
                      {totalDisplayBalance.toFixed(2)}
                    </p>
                    <p className="text-muted-foreground text-sm mt-1">
                      {totalDisplayBalance > 0 ? "Ready to send" : "Add funds to get started"}
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Bonus Earned — coming soon */}
            <div className="p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-muted-foreground text-sm mb-2">Bonus Earned</h3>
              <p className="text-3xl font-light text-muted-foreground/50 font-mono">--</p>
              <p className="text-muted-foreground text-sm mt-1">
                Yield coming soon
              </p>
            </div>

            {/* Active Payments */}
            <div className="p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center mb-4">
                <Activity className="w-6 h-6 text-rose-400" />
              </div>
              <h3 className="text-muted-foreground text-sm mb-2">Active Payments</h3>
              <p
                className={cn(
                  "text-3xl font-light font-mono",
                  hasStreams ? "text-foreground" : "text-muted-foreground/50",
                )}
              >
                {hasStreams ? stats.activeStreams : "--"}
              </p>
              <p className="text-muted-foreground text-sm mt-1">
                {hasStreams
                  ? `${streams.length} total`
                  : "No payments yet"}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Streams Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Active Payments
            </h2>
            {hasStreams && (
              <Badge variant="secondary" className="text-xs">
                {stats.activeStreams} active
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShieldDialogOpen(true)}
              className="flex items-center gap-2 px-6 py-4 text-base rounded-full bg-gradient-to-r from-amber-600/20 to-rose-600/10 border border-amber-500/40 text-amber-300 font-medium hover:border-amber-400/70 hover:text-amber-200 transition-all shadow-[0_0_20px_-8px_rgba(251,191,36,0.25)] hover:shadow-[0_0_30px_-4px_rgba(251,191,36,0.4)]"
            >
              <ShieldCheck className="w-4 h-4" />
              <span className="lowercase">shield funds</span>
            </button>
            <button
              onClick={() => navigate({ to: "/streams" })}
              className="flex items-center gap-2 px-8 py-4 text-lg rounded-full bg-gradient-to-r from-[#0B1221] to-[#0f172a] border border-amber-500/30 text-white font-medium hover:border-amber-400/60 transition-all shadow-[0_0_25px_-8px_rgba(251,191,36,0.3)] hover:shadow-[0_0_35px_-5px_rgba(251,191,36,0.5)]"
            >
              <Plus className="w-4 h-4" />
              <span>New Payment</span>
            </button>
          </div>
        </div>

        {formattedStreams.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {formattedStreams.map((stream) => (
              <StreamCard key={stream.id} stream={stream} />
            ))}
          </div>
        ) : (
          <div className="p-12 rounded-2xl bg-card border border-border text-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <Droplets className="w-6 h-6 text-amber-400" />
            </div>
            <h3 className="text-foreground font-medium mb-2">No payments yet</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
              Send your first payment to get started.
            </p>
            <button
              onClick={() => navigate({ to: "/streams" })}
              className="inline-flex items-center gap-2 px-8 py-4 text-lg rounded-full bg-gradient-to-r from-[#0B1221] to-[#0f172a] border border-amber-500/30 text-white font-medium hover:border-amber-400/60 transition-all shadow-[0_0_25px_-8px_rgba(251,191,36,0.3)] hover:shadow-[0_0_35px_-5px_rgba(251,191,36,0.5)]"
            >
              <Plus className="w-4 h-4" />
              Send Your First Payment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
