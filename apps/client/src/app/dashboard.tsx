import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Droplets, Activity, TrendingUp, Wallet } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useMemo } from "react";
import { StreamCard } from "@/components/stream-card";
import { YieldReactor } from "@/components/yield-reactor";
import { WelcomeDialog } from "@/components/welcome-dialog";
import { Skeleton } from "@/components/skeleton";
import { Badge } from "@/components/badge";
import { truncateAddress, cn } from "@/utils";

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

function StreamSkeleton() {
  return (
    <div className="rounded-2xl bg-card border border-white/5 p-5">
      <div className="flex items-center gap-3 mb-6">
        <Skeleton className="w-9 h-9 rounded-full" />
        <div>
          <Skeleton className="w-24 h-4 mb-1" />
          <Skeleton className="w-16 h-3" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-5">
        <Skeleton className="w-full h-10" />
        <Skeleton className="w-full h-10" />
      </div>
      <Skeleton className="w-full h-1.5 rounded-full" />
    </div>
  );
}

// TODO: restore DeployCTA once useContractDeployment and useDeploymentSSE are reimplemented
function DeployCTA() {
  return null;
}

function DashboardPage() {
  const navigate = useNavigate();
  const { ready } = usePrivy();
  const streams: undefined = undefined;
  const isLoadingStreams = false;
  const balances = null;
  const aggregatedBalances = null;
  const yieldEligibility: undefined = undefined;
  const deployments: undefined[] = [];

  const hasDeployments = (deployments ?? []).length > 0;
  const isLoading = !ready || isLoadingStreams;

  const formattedStreams = useMemo(() => {
    if (!streams) return [];
    return streams.map((s) => ({
      id: s.id,
      recipientName: truncateAddress(s.recipientAddress),
      recipientAddress: truncateAddress(s.recipientAddress),
      avatarFallback: s.recipientAddress.slice(0, 2).toUpperCase(),
      status: s.status,
      streamedAmount: s.vestedAmount,
      streamedCurrency: s.asset,
      rateAmount: s.amount / 30,
      rateInterval: "/mo",
      progress: s.amount > 0 ? (s.vestedAmount / s.amount) * 100 : 0,
    }));
  }, [streams]);

  const stats = useMemo(() => {
    if (!streams || streams.length === 0) {
      return {
        activeStreams: 0,
        pendingStreams: 0,
        totalStreamed: 0,
        totalVested: 0,
        yieldEarned: 0,
        yieldAPY: 0,
        outflowRate: 0,
      };
    }

    const activeStreams = streams.filter((s) => s.status === "ACTIVE").length;
    const pendingStreams = streams.filter((s) => s.status === "PENDING").length;
    const totalStreamed = streams.reduce((sum, s) => sum + s.amount, 0);
    const totalVested = streams.reduce((sum, s) => sum + s.vestedAmount, 0);
    const yieldEarned = streams.reduce((sum, s) => sum + (s.yieldEarned || 0), 0);

    let outflowRate = 0;
    const activeOnes = streams.filter((s) => s.status === "ACTIVE");
    for (const s of activeOnes) {
      const start = new Date(s.startDate).getTime();
      const end = new Date(s.endDate).getTime();
      const durationSecs = (end - start) / 1000;
      if (durationSecs > 0) {
        outflowRate += s.amount / durationSecs;
      }
    }

    const yieldAPY = totalStreamed > 0 ? (yieldEarned / totalStreamed) * 100 : 0;

    return {
      activeStreams,
      pendingStreams,
      totalStreamed,
      totalVested,
      yieldEarned,
      yieldAPY,
      outflowRate,
    };
  }, [streams]);

  // Compute total wallet balance from RPC balances
  const totalBalance = useMemo(() => {
    if (!balances) return null;
    const entries = Object.entries(balances);
    if (entries.length === 0) return null;
    let sum = 0;
    for (const [, val] of entries) {
      const num = parseFloat(val);
      if (!isNaN(num)) sum += num;
    }
    return sum;
  }, [balances]);

  // Aggregated balance breakdown
  const balanceBreakdown = useMemo(() => {
    if (!aggregatedBalances?.balances) return null;
    let wallet = 0, drips = 0, yield_ = 0;
    for (const b of aggregatedBalances.balances) {
      wallet += parseFloat(b.wallet) || 0;
      drips += parseFloat(b.drips) || 0;
      yield_ += parseFloat(b.yieldManager) || 0;
    }
    const total = wallet + drips + yield_;
    return { wallet, drips, yield: yield_, total };
  }, [aggregatedBalances]);

  // Check if any yield pools are available
  const hasYieldPools = useMemo(() => {
    if (!yieldEligibility?.tokens) return false;
    return yieldEligibility.tokens.some(t => t.yieldAvailable);
  }, [yieldEligibility]);

  const hasStreams = streams && streams.length > 0;

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
            {/* Total Outflow / Balance with Shader */}
            <div className="relative p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all overflow-hidden">
              {/* Shader Background -- always visible, faster when streaming */}
              <div className="absolute inset-0 opacity-30">
                <YieldReactor
                  active={true}
                  intensity={hasStreams && stats.outflowRate > 0 ? Math.min(Math.max(70, stats.outflowRate * 150), 300) : 40}
                />
              </div>

              {/* Content */}
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
                      {balanceBreakdown ? balanceBreakdown.total.toFixed(2) : totalBalance !== null ? totalBalance.toFixed(2) : "0.00"}
                    </p>
                    {balanceBreakdown && balanceBreakdown.total > 0 ? (
                      <p className="text-muted-foreground text-xs mt-1" title={`Wallet: $${balanceBreakdown.wallet.toFixed(2)} | In Streams: $${balanceBreakdown.drips.toFixed(2)} | Earning Yield: $${balanceBreakdown.yield.toFixed(2)}`}>
                        Wallet: {balanceBreakdown.wallet.toFixed(2)}
                        {balanceBreakdown.drips > 0 && ` | Streams: ${balanceBreakdown.drips.toFixed(2)}`}
                        {balanceBreakdown.yield > 0 && ` | Yield: ${balanceBreakdown.yield.toFixed(2)}`}
                      </p>
                    ) : (
                      <p className="text-muted-foreground text-sm mt-1">
                        {totalBalance !== null && totalBalance > 0
                          ? "Ready to send"
                          : "Add funds to get started"}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Yield Earned */}
            <div className="p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-muted-foreground text-sm mb-2">Bonus Earned</h3>
              {hasStreams && stats.yieldEarned > 0 ? (
                <>
                  <p className="text-3xl font-light text-emerald-400 font-mono">
                    +{stats.yieldAPY.toFixed(2)}%
                  </p>
                  <p className="text-muted-foreground text-sm mt-1">
                    ${stats.yieldEarned.toFixed(2)} earned
                  </p>
                </>
              ) : hasStreams && !hasYieldPools ? (
                <>
                  <p className="text-3xl font-light text-amber-400/60 font-mono">
                    --
                  </p>
                  <p className="text-amber-400/70 text-sm mt-1">
                    No yield pools on testnet
                  </p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Simulated rewards still accrue
                  </p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-light text-muted-foreground/50 font-mono">
                    --
                  </p>
                  <p className="text-muted-foreground text-sm mt-1">
                    Rewards accrue on active payments
                  </p>
                </>
              )}
            </div>

            {/* Active Streams */}
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
                {hasStreams && stats.pendingStreams > 0
                  ? `${stats.pendingStreams} pending`
                  : hasStreams
                    ? `${streams.length} total`
                    : "No payments yet"}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Deploy CTA -- show only when not loading and no deployments exist */}
      {!isLoading && !hasDeployments && (
        <DeployCTA />
      )}

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
          <button
            onClick={() => navigate({ to: "/streams" })}
            className="flex items-center gap-2 px-8 py-4 text-lg rounded-full bg-gradient-to-r from-[#0B1221] to-[#0f172a] border border-amber-500/30 text-white font-medium hover:border-amber-400/60 transition-all shadow-[0_0_25px_-8px_rgba(251,191,36,0.3)] hover:shadow-[0_0_35px_-5px_rgba(251,191,36,0.5)]"
          >
            <Plus className="w-4 h-4" />
            <span>New Payment</span>
          </button>
        </div>

        {isLoadingStreams ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <StreamSkeleton />
            <StreamSkeleton />
            <StreamSkeleton />
          </div>
        ) : formattedStreams.length > 0 ? (
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
              {hasDeployments
                ? "Send your first payment to get started."
                : "Set up your account first, then send your first payment."}
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
