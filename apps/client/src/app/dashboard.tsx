import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Droplets, Activity, TrendingUp } from "lucide-react";
import { useStreams } from "@/hooks";
import { useMemo } from "react";
import { StreamCard } from "@/components/stream-card";
import { YieldReactor } from "@/components/yield-reactor";
import { truncateAddress } from "@/utils";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const { data: streams } = useStreams();

  const formattedStreams = useMemo(() => {
    if (!streams) return [];
    return streams.map((s) => ({
      id: s.id,
      recipientName: truncateAddress(s.recipientAddress),
      recipientAddress: truncateAddress(s.recipientAddress),
      avatarFallback: s.recipientAddress.slice(0, 2).toUpperCase(),
      status: s.status as any,
      streamedAmount: s.vestedAmount,
      streamedCurrency: s.asset,
      rateAmount: s.amount / 30, // Mock: amount per 30 days
      rateInterval: "/mo",
      progress: (s.vestedAmount / s.amount) * 100,
    }));
  }, [streams]);

  const stats = useMemo(() => {
    if (!streams) {
      return {
        activeStreams: 0,
        totalVested: 0,
        yieldEarned: 0,
        yieldAPY: 12.5,
        outflowRate: 0.0245,
      };
    }

    const activeStreams = streams.filter((s) => s.status === "ACTIVE").length;
    const totalVested = streams.reduce((sum, s) => sum + s.amount, 0);
    const yieldEarned = streams.reduce((sum, s) => sum + s.yieldEarned, 0);

    return {
      activeStreams,
      totalVested,
      yieldEarned,
      yieldAPY: 12.5,
      outflowRate: 0.0245,
    };
  }, [streams]);

  return (
    <div className="w-full max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight text-foreground mb-3">
          Dashboard
        </h1>
        <p className="text-muted-foreground text-lg">
          Optimize your capital efficiency using AI-driven yield strategies
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid md:grid-cols-3 gap-6 mb-12">
        {/* Total Outflow with Shader */}
        <div className="relative p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all overflow-hidden">
          {/* Shader Background */}
          <div className="absolute inset-0 opacity-30">
            <YieldReactor 
              active={true} 
              intensity={Math.min(Math.max(70, stats.outflowRate * 150), 300)}
            />
          </div>
          
          {/* Content */}
          <div className="relative z-10">
            <div className="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center mb-4">
              <Droplets className="w-6 h-6 text-cyan-400" />
            </div>
            <h3 className="text-muted-foreground text-sm mb-2">Total Outflow</h3>
            <p className="text-3xl font-light text-foreground font-mono">{stats.outflowRate}</p>
            <p className="text-muted-foreground text-sm mt-1">USDC / sec</p>
          </div>
        </div>

        {/* Yield APY */}
        <div className="p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
            <TrendingUp className="w-6 h-6 text-emerald-400" />
          </div>
          <h3 className="text-muted-foreground text-sm mb-2">Avg. Yield APY</h3>
          <p className="text-3xl font-light text-emerald-400 font-mono">+{stats.yieldAPY}%</p>
          <p className="text-muted-foreground text-sm mt-1">Optimized via Deepbook x Uniswap</p>
        </div>

        {/* Active Streams */}
        <div className="p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all">
          <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4">
            <Activity className="w-6 h-6 text-indigo-400" />
          </div>
          <h3 className="text-muted-foreground text-sm mb-2">Active Streams</h3>
          <p className="text-3xl font-light text-foreground font-mono">{stats.activeStreams}</p>
          <p className="text-emerald-400 text-sm mt-1">Processing</p>
        </div>
      </div>

      {/* Streams Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Active Streams
          </h2>
          <button
            onClick={() => navigate({ to: "/streams" })}
            className="flex items-center gap-2 px-8 py-4 text-lg rounded-full bg-gradient-to-r from-[#0B1221] to-[#0f172a] border border-cyan-500/30 text-white font-medium hover:border-cyan-400/60 transition-all shadow-[0_0_25px_-8px_rgba(6,182,212,0.4)] hover:shadow-[0_0_35px_-5px_rgba(6,182,212,0.6)]"
          >
            <Plus className="w-4 h-4" />
            <span>New Stream</span>
          </button>
        </div>

        {formattedStreams.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {formattedStreams.map((stream) => (
              <StreamCard key={stream.id} stream={stream} />
            ))}
          </div>
        ) : (
          <div className="p-12 rounded-2xl bg-card border border-border text-center">
            <div className="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center mx-auto mb-4">
              <Droplets className="w-6 h-6 text-cyan-400" />
            </div>
            <h3 className="text-foreground font-medium mb-2">No active streams</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
              Create a new stream to start vesting funds with automated yield optimization.
            </p>
            <button
              onClick={() => navigate({ to: "/streams" })}
              className="inline-flex items-center gap-2 px-8 py-4 text-lg rounded-full bg-gradient-to-r from-[#0B1221] to-[#0f172a] border border-cyan-500/30 text-white font-medium hover:border-cyan-400/60 transition-all shadow-[0_0_25px_-8px_rgba(6,182,212,0.4)] hover:shadow-[0_0_35px_-5px_rgba(6,182,212,0.6)]"
            >
              <Plus className="w-4 h-4" />
              Create First Stream
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
