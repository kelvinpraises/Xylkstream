import { Zap, Edit2, Play, Pause, Trash2, Archive } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/avatar";
import { Button } from "@/components/button";
import { formatCurrency, cn } from "@/utils";

interface StreamCardProps {
  stream: {
    id: number | string;
    recipientName: string;
    recipientAddress: string;
    avatarFallback: string;
    avatarUrl?: string;
    status: "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED" | "PENDING";
    streamedAmount: number;
    streamedCurrency: string;
    rateAmount: number;
    rateInterval: string; // e.g., "/s", "/mo"
    progress: number; // 0-100
  };
  className?: string;
}

export function StreamCard({ stream, className }: StreamCardProps) {
  const isActive = stream.status === "ACTIVE";

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl bg-card border border-white/5 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5 hover:bg-card-hover hover:border-white/10",
        isActive && "border-primary/10 ring-1 ring-primary/5",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 border border-white/10 bg-white/5">
            <AvatarImage src={stream.avatarUrl} />
            <AvatarFallback className="text-xs font-medium text-muted-foreground bg-transparent">
              {stream.avatarFallback}
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="text-sm font-medium text-foreground tracking-tight">
              {stream.recipientName}
            </h3>
            <p className="text-[10px] text-muted-foreground font-mono tracking-wide opacity-70 truncate max-w-[100px]">
              {stream.recipientAddress}
            </p>
          </div>
        </div>

        {/* Status Dot */}
        <div className="relative flex items-center justify-center w-2 h-2">
          <div
            className={cn(
              "w-1.5 h-1.5 rounded-full transition-colors duration-500",
              isActive
                ? "bg-status-active"
                : stream.status === "PAUSED"
                  ? "bg-status-paused"
                  : stream.status === "PENDING"
                    ? "bg-status-pending"
                    : "bg-muted-foreground",
            )}
          />
          {isActive && (
            <div className="absolute inset-0 w-full h-full rounded-full bg-status-active/40 animate-ping opacity-75 duration-[3s]" />
          )}
          {isActive && (
            <div className="absolute inset-[-4px] w-[16px] h-[16px] rounded-full bg-status-active/10 animate-pulse duration-[4s]" />
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Streamed
          </p>
          <div className="font-mono text-lg text-foreground font-light tracking-tight tabular-nums">
            {formatCurrency(stream.streamedAmount)}
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Rate
          </p>
          <div className="font-mono text-lg text-foreground font-light tracking-tight tabular-nums">
            {stream.rateAmount}
            {stream.rateInterval}
          </div>
        </div>
      </div>

      {/* Progress Bar (Liquid Flow) */}
      <div className="relative h-1.5 w-full bg-black/10 rounded-full overflow-hidden mb-5">
        <div
          className="absolute top-0 left-0 h-full bg-foreground/80 rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${stream.progress}%` }}
        >
          {/* Shimmer/Flow Effect */}
          {isActive && (
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
          )}
        </div>
      </div>

      {/* Actions (Hover Reveal) */}
      <div className="flex items-center justify-end gap-2 opacity-0 transform translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-white/10 rounded-md"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </Button>
        {isActive ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
          >
            <Pause className="w-3.5 h-3.5" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-status-active hover:bg-status-active/10 rounded-md"
          >
            <Play className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
