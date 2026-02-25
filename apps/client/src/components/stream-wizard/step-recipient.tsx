import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { Alert, AlertDescription } from "@/components/alert";
import { Info } from "lucide-react";

interface StepRecipientProps {
  recipient: string;
  recipientName: string;
  onRecipientChange: (value: string) => void;
  onRecipientNameChange: (value: string) => void;
  chain: "sepolia" | "sui";
}

export function StepRecipient({
  recipient,
  recipientName,
  onRecipientChange,
  onRecipientNameChange,
  chain,
}: StepRecipientProps) {
  const isValidAddress = (address: string) => {
    if (chain === "sepolia") {
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    } else {
      return /^0x[a-fA-F0-9]{64}$/.test(address);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-2">Recipient Details</h3>
        <p className="text-sm text-muted-foreground">
          Who will receive this stream?
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="recipient">
            Recipient Address <span className="text-destructive">*</span>
          </Label>
          <Input
            id="recipient"
            placeholder={chain === "sepolia" ? "0x..." : "0x..."}
            value={recipient}
            onChange={(e) => onRecipientChange(e.target.value)}
            className={recipient && !isValidAddress(recipient) ? "border-destructive" : ""}
          />
          {recipient && !isValidAddress(recipient) && (
            <p className="text-xs text-destructive">
              Invalid {chain === "sepolia" ? "Ethereum" : "Sui"} address
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="recipientName">
            Recipient Name <span className="text-muted-foreground text-xs">(optional)</span>
          </Label>
          <Input
            id="recipientName"
            placeholder="e.g., Alice Smith"
            value={recipientName}
            onChange={(e) => onRecipientNameChange(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            A friendly name to help you identify this recipient
          </p>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Make sure the recipient address is correct. Streams cannot be redirected once created.
        </AlertDescription>
      </Alert>
    </div>
  );
}
