import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Droplets, Activity, TrendingUp, Wallet } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useMemo } from "react";
import { useNow } from "@/hooks/use-now";
import { getPendingByType } from "@/utils/pending-engine";
import { formatUnits } from "viem";
import { StreamCard } from "@/components/organisms/stream-card";
import { StreamReactor } from "@/components/organisms/stream-reactor";
import { WelcomeDialog } from "@/components/organisms/welcome-dialog";

import { Skeleton } from "@/components/atoms/skeleton";
import { Badge } from "@/components/atoms/badge";
import { truncateAddress, cn } from "@/utils";
import { useLocalStreams, cleanupCompletedStreams } from "@/store/stream-store";
import { useTokenBalance } from "@/hooks/use-stream-reads";
import { useStealthWallet } from "@/providers/stealth-wallet-provider";
import { useChain } from "@/providers/chain-provider";
import { getSendableTokens } from "@/config/chains";
import { useAutoCollect } from "@/hooks/use-auto-collect";

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
  const { ready, authenticated } = usePrivy();

  // Redirect to pending circle join if one exists (post-login flow)
  useEffect(() => {
    if (!ready || !authenticated) return;
    const pending = getPendingByType("circle_join");
    if (pending.length === 0) return;
    const { inviteCode, senderPubKey } = pending[0].payload;
    if (inviteCode && senderPubKey) {
      navigate({ to: "/circles/join", search: { code: inviteCode, key: senderPubKey } });
    }
  }, [ready, authenticated, navigate]);

  // Stealth wallet (privacy layer)
  const stealthWallet = useStealthWallet();
  const { stealthAddress, isReady: isStealthReady } = stealthWallet;

  // Chain config
  const { chainConfig, chainId } = useChain();

  // Token balances — query each sendable token
  const tokens = getSendableTokens(chainConfig.contracts);
  const walletAddr = isStealthReady && stealthAddress ? (stealthAddress as `0x${string}`) : undefined;

  const { data: usdtBalanceRaw } = useTokenBalance(walletAddr, tokens[0]?.address);
  const { data: usdcBalanceRaw } = useTokenBalance(walletAddr, tokens[1]?.address);

  const usdcBalance = useMemo(() => {
    if (usdcBalanceRaw === undefined) return null;
    return parseFloat(formatUnits(usdcBalanceRaw, 18));
  }, [usdcBalanceRaw]);

  const usdtBalance = useMemo(() => {
    if (usdtBalanceRaw === undefined) return null;
    return parseFloat(formatUnits(usdtBalanceRaw, 18));
  }, [usdtBalanceRaw]);

  const totalBalance = (usdcBalance ?? 0) + (usdtBalance ?? 0);

  // Streams from localStorage (partitioned by chain)
  const { streams } = useLocalStreams();

  // Clean up completed streams older than 30 days
  useEffect(() => {
    cleanupCompletedStreams(chainId);
  }, [chainId]);
  const isLoading = !ready;

  // Auto-collect incoming payments when enabled in settings
  useAutoCollect();

  const nowSecs = useNow();

  // Compute stats from localStorage streams
  const stats = useMemo(() => {
    const activeStreams = streams.filter((s) => s.endTimestamp > nowSecs).length;
    const totalAmount = streams.reduce((sum, s) => sum + parseFloat(s.totalAmount || "0"), 0);
    const outflowRate = streams
      .filter((s) => s.endTimestamp > nowSecs)
      .reduce((sum, s) => {
        // amtPerSec is in internal Drips units (wei * 10^9), convert back to tokens/sec
        const rawPerSec = BigInt(s.amtPerSec);
        const tokensPerSec = parseFloat(formatUnits(rawPerSec, 27));
        return sum + tokensPerSec;
      }, 0);
    return { activeStreams, totalAmount, outflowRate };
  }, [streams, nowSecs]);

  // Format streams for StreamCard — show active and paused on the dashboard
  const activeStreams = useMemo(() => {
    return streams
      .filter((s) => s.status !== "CANCELLED" && (s.endTimestamp > nowSecs || s.status === "PAUSED"))
      .map((s) => {
        const isPaused = s.status === "PAUSED";
        const duration = s.endTimestamp - s.startTimestamp;

        // When paused, freeze progress at the moment of pausing
        let progress: number;
        let streamed: number;
        let rateAmount: number;
        if (isPaused && s.pausedRemainingDuration !== undefined) {
          const elapsedAtPause = duration - s.pausedRemainingDuration;
          progress = duration > 0 ? Math.min(100, (elapsedAtPause / duration) * 100) : 0;
          streamed = parseFloat(s.totalAmount) - parseFloat(s.pausedRemainingAmount ?? "0");
          rateAmount = 0; // not actively sending
        } else {
          const elapsed = Math.max(0, nowSecs - s.startTimestamp);
          progress = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
          streamed = parseFloat(s.totalAmount) * (progress / 100);
          rateAmount = parseFloat(s.totalAmount) / Math.max(1, duration / (86400 * 30));
        }

        const status = isPaused ? "PAUSED" as const : "ACTIVE" as const;
        return {
          id: s.id,
          recipientName: truncateAddress(s.recipientAddress),
          recipientAddress: truncateAddress(s.recipientAddress),
          status,
          streamedAmount: streamed,
          streamedCurrency: s.tokenSymbol,
          rateAmount,
          rateInterval: isPaused ? "" : "/mo",
          progress,
          isPrivate: s.isPrivate,
          walletAddress: s.walletAddress,
          localStream: s,
        };
      });
  }, [streams, nowSecs]);

  const completedCount = streams.length - activeStreams.length;
  const hasStreams = streams.length > 0;
  const hasActiveStreams = stats.activeStreams > 0;

  return (
    <div className="w-full max-w-7xl mx-auto">
      {/* Welcome dialog for new users */}
      <WelcomeDialog />

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
            {/* Balance / Outflow with Shader */}
            <div className="relative p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all overflow-hidden">
              <div className="absolute inset-0 opacity-30">
                <StreamReactor
                  active={true}
                  intensity={hasActiveStreams && stats.outflowRate > 0 ? Math.min(Math.max(70, stats.outflowRate * 150), 300) : 40}
                />
              </div>
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                    {hasActiveStreams ? (
                      <Droplets className="w-6 h-6 text-amber-400" />
                    ) : (
                      <Wallet className="w-6 h-6 text-amber-400" />
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {chainConfig.chain.name}
                  </Badge>
                </div>
                <h3 className="text-muted-foreground text-sm mb-2">
                  {hasActiveStreams ? "Sending" : "Your Balance"}
                </h3>
                {hasActiveStreams ? (
                  <>
                    <p className="text-3xl font-light text-foreground font-mono">
                      ${(stats.outflowRate * 86400 * 30).toFixed(2)}
                    </p>
                    <p className="text-muted-foreground text-sm mt-1">/ month</p>
                  </>
                ) : (
                  <>
                    <p className="text-3xl font-light text-foreground font-mono">
                      ${totalBalance.toFixed(2)}
                    </p>
                    <p className="text-muted-foreground text-sm mt-1">
                      {totalBalance > 0 ? "Ready to send" : "Add funds to get started"}
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Bonus Earned — coming soon */}
            <div className="p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all overflow-hidden">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-muted-foreground text-sm mb-2">Bonus Earned</h3>
              <p className="text-3xl font-light text-muted-foreground/50 font-mono">--</p>
              <button
                onClick={() => navigate({ to: "/settings" })}
                className="text-sm mt-1 text-amber-400 hover:text-amber-300 transition-colors"
              >
                Connect agent to start yield
              </button>
            </div>

            {/* Active Payments */}
            <div className="p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all overflow-hidden">
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
              <>
                <Badge variant="secondary" className="text-xs">
                  {activeStreams.length} active
                </Badge>
                {completedCount > 0 && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    {completedCount} completed
                  </Badge>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate({ to: "/streams" })}
              className="flex items-center gap-2 px-8 py-4 text-lg rounded-full bg-gradient-to-r from-[#0B1221] to-[#0f172a] border border-amber-500/30 text-white font-medium hover:border-amber-400/60 transition-all shadow-[0_0_25px_-8px_rgba(251,191,36,0.3)] hover:shadow-[0_0_35px_-5px_rgba(251,191,36,0.5)]"
            >
              <Plus className="w-4 h-4" />
              <span>New Payment</span>
            </button>
          </div>
        </div>

        {activeStreams.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeStreams.map((stream) => (
              <div
                key={stream.id}
                className="cursor-pointer"
                onClick={() => navigate({ to: "/streams/$streamId", params: { streamId: String(stream.id) } })}
              >
                <StreamCard
                  stream={stream}
                  isPrivate={stream.isPrivate}
                  walletAddress={stream.walletAddress}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 rounded-2xl bg-card border border-border text-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <Droplets className="w-6 h-6 text-amber-400" />
            </div>
            <h3 className="text-foreground font-medium mb-2">
              {completedCount > 0 ? "All payments completed" : "No payments yet"}
            </h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
              {completedCount > 0
                ? `${completedCount} payment${completedCount > 1 ? "s" : ""} finished. Start a new one or check your history.`
                : "Send your first payment to get started."}
            </p>
            <button
              onClick={() => navigate({ to: "/streams" })}
              className="inline-flex items-center gap-2 px-8 py-4 text-lg rounded-full bg-gradient-to-r from-[#0B1221] to-[#0f172a] border border-amber-500/30 text-white font-medium hover:border-amber-400/60 transition-all shadow-[0_0_25px_-8px_rgba(251,191,36,0.3)] hover:shadow-[0_0_35px_-5px_rgba(251,191,36,0.5)]"
            >
              <Plus className="w-4 h-4" />
              {completedCount > 0 ? "New Payment" : "Send Your First Payment"}
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
