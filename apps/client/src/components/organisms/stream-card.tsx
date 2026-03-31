import { Shield } from "lucide-react";
import { cn } from "@/utils";

interface StreamCardProps {
  stream: {
    id: number | string;
    recipientName: string;
    recipientAddress: string;
    status: "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED" | "PENDING";
    streamedAmount: number;
    streamedCurrency: string;
    rateAmount: number;
    rateInterval: string; // e.g., "/s", "/mo"
    progress: number; // 0-100
  };
  isPrivate?: boolean;
  walletAddress?: string;
  className?: string;
}

export function StreamCard({
  stream,
  isPrivate,
  walletAddress,
  className,
}: StreamCardProps) {
  const isActive = stream.status === "ACTIVE";
  const isPaused = stream.status === "PAUSED";

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl bg-card border border-border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30",
        isActive && "border-primary/20 ring-1 ring-primary/5",
        className,
      )}
    >
      {/* Header — recipient + badge */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[10px] text-muted-foreground font-mono tracking-wide truncate max-w-[140px]">
            {stream.recipientAddress}
          </p>
          {isPrivate && walletAddress && (
            <p className="text-[9px] text-amber-400/50 font-mono tracking-wide truncate max-w-[140px] mt-0.5">
              via {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </p>
          )}
        </div>
        {isPrivate && (
          <div
            title="private stream — sent via stealth wallet"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20"
          >
            <Shield className="w-2.5 h-2.5 text-amber-400 fill-amber-400/20" />
            <span className="text-[9px] text-amber-400 uppercase tracking-wider font-medium">
              private
            </span>
          </div>
        )}
      </div>

      {/* Amount — the main number */}
      <div className="mb-1">
        <span className="font-mono text-2xl text-foreground font-light tracking-tight tabular-nums">
          {stream.streamedAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className="text-sm text-muted-foreground ml-1.5">{stream.streamedCurrency}</span>
      </div>

      {/* Rate */}
      <p className="text-xs text-muted-foreground mb-5 font-mono tabular-nums">
        {isPaused ? (
          <span className="text-amber-400/70">paused</span>
        ) : (
          <>
            {stream.rateAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {stream.rateInterval}
          </>
        )}
      </p>

      {/* Progress */}
      <div className="relative h-1 w-full bg-muted rounded-full overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full bg-foreground/80 rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${stream.progress}%` }}
        >
          {isActive && (
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
          )}
        </div>
      </div>
    </div>
  );
}
