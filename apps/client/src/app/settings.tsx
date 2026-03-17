import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
// TODO: restore useContractDeployment and useYieldEligibility once new hooks are implemented
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/molecules/card";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { Switch } from "@/components/atoms/switch";
import { Separator } from "@/components/atoms/separator";
import { Badge } from "@/components/atoms/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import {
  Copy,
  Check,
  Wallet,
  TrendingUp,
  Bell,
  Shield,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user, ready } = usePrivy();
  const accountLoading = !ready;
  // TODO: const { getDeployment } = useContractDeployment();
  // TODO: const { data: yieldEligibility } = useYieldEligibility();

  const [copied, setCopied] = useState<string | null>(null);

  // Yield optimization state (local only — server policy stubbed out)
  const [yieldEnabled, setYieldEnabled] = useState(false);
  const [riskTolerance, setRiskTolerance] = useState<"low" | "medium" | "high">("medium");
  const [minYieldThreshold, setMinYieldThreshold] = useState("1.0");

  // Auto-compound state
  const [autoCompound, setAutoCompound] = useState(false);

  // Notification preferences state
  const [notifLowFunds, setNotifLowFunds] = useState(true);
  const [notifStreamCompleted, setNotifStreamCompleted] = useState(true);
  const [notifYieldUpdates, setNotifYieldUpdates] = useState(true);
  const [notifPluginErrors, setNotifPluginErrors] = useState(true);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copied`);
    setTimeout(() => setCopied(null), 2000);
  };

  // The wallet address comes from Privy
  const managedAddress = user?.wallet?.address || "";

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="mb-12">
        <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight text-foreground mb-3">
          Settings
        </h1>
        <p className="text-muted-foreground text-lg">
          Manage your account and preferences
        </p>
      </div>

      <div className="grid gap-8 max-w-3xl">
        {/* Account Info */}
        <Card className="border border-border">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex items-center gap-3">
                <CardTitle className="text-lg">Account</CardTitle>
                {user && (
                  <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                    Active
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Your Account Address
                </Label>
                <p className="text-[11px] text-muted-foreground mt-0.5 mb-1">
                  This is your unique payment address
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono bg-muted/30 px-3 py-2 rounded-lg truncate">
                    {accountLoading ? "Loading..." : managedAddress || "No wallet assigned"}
                  </code>
                  {managedAddress && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        copyToClipboard(managedAddress, "Wallet address")
                      }
                      className="shrink-0"
                    >
                      {copied === "Wallet address" ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {user && (
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                    Network
                  </Label>
                  <div className="mt-1">
                    <Badge variant="secondary" className="text-xs">
                      BNB Smart Chain
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* TODO: Deployed Contracts section — restore once useContractDeployment is reimplemented */}

        {/* Yield Optimization */}
        <Card className="border border-border">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              </div>
              <CardTitle className="text-lg">Rewards</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {!user ? (
              <p className="text-sm text-muted-foreground py-4">
                Sign in to manage reward settings.
              </p>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">
                      Enable Rewards
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Your idle funds can earn rewards automatically
                    </p>
                  </div>
                  <Switch
                    checked={yieldEnabled}
                    onCheckedChange={setYieldEnabled}
                  />
                </div>

                {/* TODO: Pool status — restore once useYieldEligibility is reimplemented */}

                <Separator />

                <div className="space-y-4">
                  <div>
                    <Label className="text-sm">Reward Style</Label>
                    <Select
                      value={riskTolerance}
                      onValueChange={(v) => setRiskTolerance(v as "low" | "medium" | "high")}
                      disabled={!yieldEnabled}
                    >
                      <SelectTrigger className="w-full mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">
                          Safe & Steady (0.05% fee)
                        </SelectItem>
                        <SelectItem value="medium">
                          Balanced (0.25% fee)
                        </SelectItem>
                        <SelectItem value="high">
                          Adventurous (1% fee)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm">Minimum Reward Rate (%)</Label>
                    <Input
                      type="number"
                      value={minYieldThreshold}
                      onChange={(e) => setMinYieldThreshold(e.target.value)}
                      disabled={!yieldEnabled}
                      placeholder="1.0"
                      step="0.1"
                      min="0"
                      className="mt-1.5"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Only use strategies with rewards above this rate
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">
                        Reinvest Rewards
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Automatically put earned rewards back to work
                      </p>
                    </div>
                    <Switch
                      checked={autoCompound}
                      onCheckedChange={setAutoCompound}
                      disabled={!yieldEnabled}
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notification Preferences */}
        <Card className="border border-border">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Bell className="w-5 h-5 text-amber-400" />
              </div>
              <CardTitle className="text-lg">Notifications</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {!user ? (
              <p className="text-sm text-muted-foreground py-4">
                Sign in to manage notification preferences.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Low Funds Alerts</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Notify when your balance is running low
                    </p>
                  </div>
                  <Switch
                    checked={notifLowFunds}
                    onCheckedChange={setNotifLowFunds}
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Payment Completed</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Notify when a payment finishes
                    </p>
                  </div>
                  <Switch
                    checked={notifStreamCompleted}
                    onCheckedChange={setNotifStreamCompleted}
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Reward Updates</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Notify on reward changes or earnings
                    </p>
                  </div>
                  <Switch
                    checked={notifYieldUpdates}
                    onCheckedChange={setNotifYieldUpdates}
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Plugin Errors</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Notify when an attached plugin encounters an error
                    </p>
                  </div>
                  <Switch
                    checked={notifPluginErrors}
                    onCheckedChange={setNotifPluginErrors}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Security */}
        <Card className="border border-border">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-rose-400" />
              </div>
              <CardTitle className="text-lg">Security</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Account Security</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your account is protected with bank-grade security.
                </p>
              </div>

              <Separator />

              {/* TODO: Backend method needed for spending limits */}
              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Spending Limits
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Per-transaction and daily spending limits are not yet configurable.
                  Default policy limits apply.
                </p>
              </div>

              {/* TODO: Backend method needed for session management */}
              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Active Sessions
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Session management is handled automatically via Privy authentication.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
