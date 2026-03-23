import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useNow } from "@/hooks/use-now";
import { History, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/molecules/card";
import { Badge } from "@/components/atoms/badge";
import { useLocalStreams } from "@/store/stream-store";
import { truncateAddress } from "@/utils";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const navigate = useNavigate();
  const { streams } = useLocalStreams();
  const nowSecs = useNow();

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="mb-12">
        <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight text-foreground mb-3">
          Activity
        </h1>
        <p className="text-muted-foreground text-lg">
          Everything that's happened with your payments
        </p>
      </div>

      {streams.length === 0 ? (
        <Card className="p-12 text-center border border-border">
          <div className="max-w-md mx-auto">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <History className="w-6 h-6 text-amber-400" />
            </div>
            <h3 className="text-lg font-medium mb-2">No activity yet</h3>
            <p className="text-sm text-muted-foreground">
              Streams you create will appear here.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {streams.map((stream) => {
            const isActive = stream.endTimestamp > nowSecs;
            const duration = stream.endTimestamp - stream.startTimestamp;
            const elapsed = Math.max(0, nowSecs - stream.startTimestamp);
            const progress = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;

            return (
              <div
                key={stream.id}
                className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border hover:border-primary/30 transition-all cursor-pointer"
                onClick={() =>
                  navigate({ to: "/streams/$streamId", params: { streamId: stream.id } })
                }
              >
                {/* Timeline dot */}
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      isActive
                        ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]"
                        : "bg-muted-foreground/40"
                    }`}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium lowercase">
                      stream created
                    </span>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 lowercase">
                      {stream.tokenSymbol}
                    </Badge>
                    {stream.isPrivate && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-amber-400 border-amber-400/40 lowercase">
                        private
                      </Badge>
                    )}
                    <Badge
                      variant={isActive ? "default" : "secondary"}
                      className="text-[10px] py-0 px-1.5 lowercase"
                    >
                      {isActive ? "active" : "completed"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground lowercase">
                    {stream.totalAmount} {stream.tokenSymbol} → {truncateAddress(stream.recipientAddress)}
                  </p>
                  <div className="mt-2 h-0.5 bg-muted rounded-full overflow-hidden w-full max-w-xs">
                    <div
                      className="h-full bg-amber-500/50"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Time */}
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground lowercase">
                    {new Date(stream.createdAt).toLocaleDateString()}
                  </p>
                  <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/50 mt-1 ml-auto" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
