import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";
import { Card } from "@/components/card";

interface StepAmountProps {
  amount: string;
  asset: string;
  onAmountChange: (value: string) => void;
  onAssetChange: (value: string) => void;
  chain: "sepolia" | "sui";
}

export function StepAmount({ amount, asset, onAmountChange, onAssetChange, chain }: StepAmountProps) {
  const assets = chain === "sepolia" 
    ? [
        { value: "ETH", label: "ETH", balance: "0.5" },
        { value: "USDC", label: "USDC", balance: "1000" },
        { value: "DAI", label: "DAI", balance: "500" },
      ]
    : [
        { value: "SUI", label: "SUI", balance: "100" },
        { value: "USDC", label: "USDC", balance: "1000" },
      ];

  const selectedAsset = assets.find((a) => a.value === asset);
  const usdValue = amount && !isNaN(parseFloat(amount)) 
    ? (parseFloat(amount) * (asset === "USDC" ? 1 : asset === "ETH" ? 2000 : asset === "SUI" ? 1.5 : 1)).toFixed(2)
    : "0.00";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-2">Amount & Asset</h3>
        <p className="text-sm text-muted-foreground">
          How much do you want to stream?
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="asset">
            Asset <span className="text-destructive">*</span>
          </Label>
          <Select value={asset} onValueChange={onAssetChange}>
            <SelectTrigger id="asset">
              <SelectValue placeholder="Select asset" />
            </SelectTrigger>
            <SelectContent>
              {assets.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  <div className="flex items-center justify-between w-full">
                    <span>{a.label}</span>
                    <span className="text-xs text-muted-foreground ml-4">
                      Balance: {a.balance}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="amount">
            Amount <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Input
              id="amount"
              type="number"
              step="0.000001"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              className="pr-16"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {asset || "Asset"}
            </div>
          </div>
          {selectedAsset && (
            <p className="text-xs text-muted-foreground">
              Available: {selectedAsset.balance} {asset}
            </p>
          )}
        </div>
      </div>

      {amount && parseFloat(amount) > 0 && (
        <Card className="p-4 bg-muted/50">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Estimated USD Value</span>
            <span className="text-lg font-medium">${usdValue}</span>
          </div>
        </Card>
      )}
    </div>
  );
}
