import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Badge } from "@/components/badge";
import { Separator } from "@/components/separator";
import { CheckCircle2, Loader2 } from "lucide-react";

interface StepReviewProps {
  chain: "sepolia" | "sui";
  recipient: string;
  recipientName: string;
  amount: string;
  asset: string;
  startDate: string;
  endDate: string;
  cliffDate: string;
  isCreating: boolean;
  onCreate: () => void;
}

export function StepReview({
  chain,
  recipient,
  recipientName,
  amount,
  asset,
  startDate,
  endDate,
  cliffDate,
  isCreating,
  onCreate,
}: StepReviewProps) {
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "Not set";
    return new Date(dateStr).toLocaleString();
  };

  const calculateDuration = () => {
    if (!startDate || !endDate) return "N/A";
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    return `${days} day${days !== 1 ? "s" : ""}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-2">Review & Create</h3>
        <p className="text-sm text-muted-foreground">
          Review your stream details before creating
        </p>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Blockchain</span>
          <Badge variant="secondary">
            {chain === "sepolia" ? "Sepolia" : "Sui Testnet"}
          </Badge>
        </div>

        <Separator />

        <div>
          <span className="text-sm text-muted-foreground block mb-1">Recipient</span>
          <p className="font-mono text-sm break-all">{recipient}</p>
          {recipientName && (
            <p className="text-sm text-muted-foreground mt-1">{recipientName}</p>
          )}
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Amount</span>
          <span className="font-medium">
            {amount} {asset}
          </span>
        </div>

        <Separator />

        <div>
          <span className="text-sm text-muted-foreground block mb-2">Schedule</span>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Start</span>
              <span>{formatDate(startDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">End</span>
              <span>{formatDate(endDate)}</span>
            </div>
            {cliffDate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cliff</span>
                <span>{formatDate(cliffDate)}</span>
              </div>
            )}
            <div className="flex justify-between font-medium">
              <span className="text-muted-foreground">Duration</span>
              <span>{calculateDuration()}</span>
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground">Estimated Gas</span>
          <span className="text-sm">
            ~{chain === "sepolia" ? "0.001 ETH" : "0.0001 SUI"}
          </span>
        </div>
      </Card>

      <Button 
        onClick={onCreate} 
        disabled={isCreating}
        className="w-full"
        size="lg"
      >
        {isCreating ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Creating Stream...
          </>
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Create Stream
          </>
        )}
      </Button>

      {isCreating && (
        <p className="text-xs text-center text-muted-foreground">
          Please confirm the transaction in your wallet
        </p>
      )}
    </div>
  );
}
