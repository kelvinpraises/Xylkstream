import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Card } from "@/components/card";
import { Button } from "@/components/button";
import { Badge } from "@/components/badge";
import { Progress } from "@/components/progress";
import { Loader2, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { newHttpBatchRpcSession } from "capnweb";
import type { AuthTarget, VestingStreamItem } from "@/lib/rpc-client";
import { API_URL } from "@/config";

interface ClaimStreamCardProps {
  stream: VestingStreamItem;
}

export function ClaimStreamCard({ stream }: ClaimStreamCardProps) {
  const [isClaiming, setIsClaiming] = useState(false);
  const { getAccessToken } = usePrivy();

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
    return (stream.amount * progress) / 100;
  };

  const handleClaim = async () => {
    setIsClaiming(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");

      const batch = newHttpBatchRpcSession<AuthTarget>(
        `${API_URL}/rpc/external/auth`
      );
      const session = await batch.authenticate({ accessToken: token });
      await session.claimStream({ streamId: stream.id });
      toast.success("Payment collected!");
    } catch (error: any) {
      toast.error(error.message || "Failed to collect");
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

  const statusLabel: Record<string, string> = {
    ACTIVE: "Sending",
    PENDING: "Starting soon",
    COMPLETED: "Delivered",
    PAUSED: "Paused",
    CANCELLED: "Cancelled",
  };

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-medium">
              Payment #{stream.id}
            </h3>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${statusColor}`} />
              <Badge variant="secondary" className="text-xs">
                {statusLabel[stream.status] || stream.status}
              </Badge>
            </div>
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            {stream.recipientAddress.slice(0, 10)}...{stream.recipientAddress.slice(-8)}
          </p>
        </div>
        <Badge variant="outline">
          BSC
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
          <p className="text-xs text-muted-foreground mb-1">Available</p>
          <p className="text-lg font-medium text-amber-500">
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
            Collecting...
          </>
        ) : isCompleted ? (
          <>
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Delivered
          </>
        ) : !canClaim ? (
          "Nothing to collect yet"
        ) : (
          `Collect ${vested.toFixed(4)} ${stream.asset}`
        )}
      </Button>
    </Card>
  );
}
