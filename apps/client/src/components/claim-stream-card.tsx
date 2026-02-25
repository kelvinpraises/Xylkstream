import { useState } from "react";
import { Card } from "@/components/card";
import { Button } from "@/components/button";
import { Badge } from "@/components/badge";
import { Progress } from "@/components/progress";
import { Loader2, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import type { Stream } from "@/hooks/use-claim-pages";

interface ClaimStreamCardProps {
  stream: Stream;
}

export function ClaimStreamCard({ stream }: ClaimStreamCardProps) {
  const [isClaiming, setIsClaiming] = useState(false);

  const calculateProgress = () => {
    const now = new Date().getTime();
    const start = new Date(stream.startDate).getTime();
    const end = new Date(stream.endDate).getTime();

    if (now < start) return 0;
    if (now >= end) return 100;

    return ((now - start) / (end - start)) * 100;
  };

  const calculateVested = () => {
    const progress = calculateProgress();
    return (parseFloat(stream.amount) * progress) / 100;
  };

  const handleClaim = async () => {
    setIsClaiming(true);
    try {
      // Simulate claim transaction
      await new Promise((resolve) => setTimeout(resolve, 2000));
      toast.success("Stream claimed successfully!");
    } catch (error) {
      toast.error("Failed to claim stream");
    } finally {
      setIsClaiming(false);
    }
  };

  const progress = calculateProgress();
  const vested = calculateVested();
  const isActive = stream.status === "ACTIVE";
  const isCompleted = stream.status === "COMPLETED" || progress >= 100;
  const canClaim = isActive && vested > 0;

  const statusColor = {
    ACTIVE: "bg-green-500",
    PENDING: "bg-yellow-500",
    PAUSED: "bg-orange-500",
    COMPLETED: "bg-blue-500",
    CANCELLED: "bg-red-500",
  }[stream.status];

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-medium">
              {stream.recipientName || "Payment Stream"}
            </h3>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${statusColor}`} />
              <Badge variant="secondary" className="text-xs">
                {stream.status}
              </Badge>
            </div>
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            {stream.recipient.slice(0, 10)}...{stream.recipient.slice(-8)}
          </p>
        </div>
        <Badge variant="outline">
          {stream.chain === "sepolia" ? "Sepolia" : "Sui"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Total Amount</p>
          <p className="text-lg font-medium">
            {stream.amount} {stream.asset}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Vested</p>
          <p className="text-lg font-medium text-green-600">
            {vested.toFixed(4)} {stream.asset}
          </p>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">Progress</span>
          <span className="text-xs font-medium">{progress.toFixed(1)}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>Start: {new Date(stream.startDate).toLocaleDateString()}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>End: {new Date(stream.endDate).toLocaleDateString()}</span>
        </div>
      </div>

      <Button
        onClick={handleClaim}
        disabled={!canClaim || isClaiming || isCompleted}
        className="w-full"
      >
        {isClaiming ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Claiming...
          </>
        ) : isCompleted ? (
          <>
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Completed
          </>
        ) : !canClaim ? (
          "Nothing to Claim Yet"
        ) : (
          `Claim ${vested.toFixed(4)} ${stream.asset}`
        )}
      </Button>
    </Card>
  );
}
