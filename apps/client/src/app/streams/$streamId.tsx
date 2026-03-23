import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/atoms/button";
import { Card } from "@/components/molecules/card";
import { Badge } from "@/components/atoms/badge";
import { Progress } from "@/components/atoms/progress";
import { Separator } from "@/components/atoms/separator";
import { ArrowLeft, ExternalLink, Shield } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useLocalStreams } from "@/store/stream-store";
import { useChain } from "@/providers/chain-provider";
import { useNow } from "@/hooks/use-now";

export const Route = createFileRoute("/streams/$streamId")({
  component: StreamDetailPage,
});

function StreamDetailPage() {
  const { streamId } = Route.useParams();
  const navigate = useNavigate();
  const { chainConfig } = useChain();
  const nowSecs = useNow();

  const { streams } = useLocalStreams();
  const stream = streams.find((s) => s.id === streamId);

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
  const duration = stream.endTimestamp - stream.startTimestamp;
  const elapsed = Math.max(0, nowSecs - stream.startTimestamp);
  const progress = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
  const totalAmount = parseFloat(stream.totalAmount);
  const streamed = totalAmount * (progress / 100);
  const remaining = totalAmount - streamed;
  const isActive = stream.endTimestamp > nowSecs;

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
              <h1 className="text-2xl font-bold mb-2 lowercase">
                {stream.tokenSymbol} stream
              </h1>
              <p className="text-sm text-muted-foreground font-mono">
                {stream.recipientAddress}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{chainConfig.chain.name}</Badge>
              {stream.isPrivate && (
                <Badge variant="outline" className="text-amber-400 border-amber-400/40 flex items-center gap-1">
                  <Shield className="w-3 h-3 fill-amber-400/20" />
                  private
                </Badge>
              )}
              <Badge variant={isActive ? "default" : "secondary"}>
                {isActive ? "active" : "completed"}
              </Badge>
            </div>
          </div>
        </Card>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-6">
            <p className="text-sm text-muted-foreground mb-2">Total Amount</p>
            <p className="text-2xl font-bold font-mono">
              {totalAmount.toFixed(2)} {stream.tokenSymbol}
            </p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-muted-foreground mb-2">Delivered</p>
            <p className="text-2xl font-bold text-emerald-400 font-mono">
              {streamed.toFixed(4)} {stream.tokenSymbol}
            </p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-muted-foreground mb-2">Remaining</p>
            <p className="text-2xl font-bold font-mono">
              {remaining.toFixed(4)} {stream.tokenSymbol}
            </p>
          </Card>
        </div>

        {/* Progress */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium lowercase">stream progress</h3>
            <span className="text-sm text-muted-foreground">{progress.toFixed(1)}%</span>
          </div>
          <Progress value={progress} className="h-3 mb-4" />
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground mb-1 lowercase">start date</p>
              <p className="font-medium">
                {new Date(stream.startTimestamp * 1000).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1 lowercase">end date</p>
              <p className="font-medium">
                {new Date(stream.endTimestamp * 1000).toLocaleString()}
              </p>
            </div>
          </div>
        </Card>

        {/* Derived Wallet (Private Streams) */}
        {stream.isPrivate && stream.walletAddress && (
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-amber-400 fill-amber-400/20" />
              <h3 className="font-medium lowercase">private wallet</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Derived Wallet</span>
                <a
                  href={`${chainConfig.chain.blockExplorers?.default?.url ?? ""}/address/${stream.walletAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-mono flex items-center gap-1"
                >
                  {stream.walletAddress.slice(0, 10)}...{stream.walletAddress.slice(-8)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              {stream.walletIndex !== undefined && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Derivation Index</span>
                    <span className="font-mono">{stream.walletIndex}</span>
                  </div>
                </>
              )}
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Privacy</span>
                <span className="text-amber-400">Isolated balance (stealth wallet)</span>
              </div>
            </div>
          </Card>
        )}

        {/* Transaction Info */}
        {stream.txHash && (
          <Card className="p-6">
            <h3 className="font-medium mb-4 lowercase">transaction details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transaction Hash</span>
                <a
                  href={`${chainConfig.chain.blockExplorers?.default?.url ?? ""}/tx/${stream.txHash}`}
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
