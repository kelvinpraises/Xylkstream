import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Badge } from "@/components/badge";
import { Progress } from "@/components/progress";
import { Separator } from "@/components/separator";
import { useClaimPages } from "@/hooks/use-claim-pages";
import { ArrowLeft, ExternalLink, Pause, Play, XCircle } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/streams/$streamId")({
  component: StreamDetailPage,
});

function StreamDetailPage() {
  const { streamId } = Route.useParams();
  const navigate = useNavigate();
  const { getStream, getClaimPage } = useClaimPages();

  const stream = getStream(streamId);
  const page = stream ? getClaimPage(stream.claimPageId) : null;

  if (!stream) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <h1 className="text-2xl font-bold mb-2">Stream Not Found</h1>
          <p className="text-muted-foreground mb-6">
            This stream doesn't exist or has been removed.
          </p>
          <Button onClick={() => navigate({ to: "/streams" })}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Streams
          </Button>
        </div>
      </div>
    );
  }

  const calculateProgress = () => {
    const now = new Date().getTime();
    const start = new Date(stream.startDate).getTime();
    const end = new Date(stream.endDate).getTime();

    if (now < start) return 0;
    if (now >= end) return 100;

    return ((now - start) / (end - start)) * 100;
  };

  const progress = calculateProgress();
  const vested = (parseFloat(stream.amount) * progress) / 100;

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Button
        variant="ghost"
        onClick={() => navigate({ to: "/streams" })}
        className="mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Streams
      </Button>

      <div className="space-y-6">
        {/* Header */}
        <Card className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold mb-2">
                {stream.recipientName || "Payment Stream"}
              </h1>
              <p className="text-sm text-muted-foreground font-mono">
                {stream.recipient}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {stream.chain === "sepolia" ? "Sepolia" : "Sui"}
              </Badge>
              <Badge variant={stream.status === "ACTIVE" ? "default" : "secondary"}>
                {stream.status}
              </Badge>
            </div>
          </div>

          {page && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Claim Page:</span>
              <a
                href={`/claim/${page.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center gap-1"
              >
                {page.title}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </Card>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-6">
            <p className="text-sm text-muted-foreground mb-2">Total Amount</p>
            <p className="text-2xl font-bold">
              {stream.amount} {stream.asset}
            </p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-muted-foreground mb-2">Vested</p>
            <p className="text-2xl font-bold text-green-600">
              {vested.toFixed(4)} {stream.asset}
            </p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-muted-foreground mb-2">Remaining</p>
            <p className="text-2xl font-bold">
              {(parseFloat(stream.amount) - vested).toFixed(4)} {stream.asset}
            </p>
          </Card>
        </div>

        {/* Progress */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium">Vesting Progress</h3>
            <span className="text-sm text-muted-foreground">{progress.toFixed(1)}%</span>
          </div>
          <Progress value={progress} className="h-3 mb-4" />
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground mb-1">Start Date</p>
              <p className="font-medium">{new Date(stream.startDate).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">End Date</p>
              <p className="font-medium">{new Date(stream.endDate).toLocaleString()}</p>
            </div>
            {stream.cliffDate && (
              <div className="col-span-2">
                <p className="text-muted-foreground mb-1">Cliff Date</p>
                <p className="font-medium">{new Date(stream.cliffDate).toLocaleString()}</p>
              </div>
            )}
          </div>
        </Card>

        {/* Actions */}
        <Card className="p-6">
          <h3 className="font-medium mb-4">Actions</h3>
          <div className="flex gap-3">
            {stream.status === "ACTIVE" ? (
              <Button variant="outline">
                <Pause className="w-4 h-4 mr-2" />
                Pause Stream
              </Button>
            ) : stream.status === "PAUSED" ? (
              <Button variant="outline">
                <Play className="w-4 h-4 mr-2" />
                Resume Stream
              </Button>
            ) : null}
            <Button variant="destructive" disabled={stream.status === "CANCELLED"}>
              <XCircle className="w-4 h-4 mr-2" />
              Cancel Stream
            </Button>
          </div>
        </Card>

        {/* Transaction Info */}
        {stream.txHash && (
          <Card className="p-6">
            <h3 className="font-medium mb-4">Transaction Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transaction Hash</span>
                <a
                  href={`https://${stream.chain === "sepolia" ? "sepolia.etherscan.io" : "suiscan.xyz/testnet"}/tx/${stream.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-mono flex items-center gap-1"
                >
                  {stream.txHash.slice(0, 10)}...{stream.txHash.slice(-8)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(stream.createdAt).toLocaleString()}</span>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
