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
import { Label } from "@/components/atoms/label";
import { Badge } from "@/components/atoms/badge";
import {
  Copy,
  Check,
  Wallet,
  Bot,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
// OAuth flow handles agent auth now — no client-side agent connection state needed
import { useChain } from "@/providers/chain-provider";
import { useStealthWallet } from "@/providers/stealth-wallet-provider";
import { usePrivacyMode } from "@/store/wallet-registry";
import { Switch } from "@/components/atoms/switch";
import { cn } from "@/utils";
import { useAutoCollectSetting } from "@/hooks/use-auto-collect";
import { ArrowDownToLine } from "lucide-react";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user, ready } = usePrivy();
  const accountLoading = !ready;
  // TODO: const { getDeployment } = useContractDeployment();
  // TODO: const { data: yieldEligibility } = useYieldEligibility();

  const [copied, setCopied] = useState<string | null>(null);
  const { chainConfig } = useChain();
  const { stealthAddress } = useStealthWallet();
  const privacyMode = usePrivacyMode();
  const autoCollect = useAutoCollectSetting();

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copied`);
    setTimeout(() => setCopied(null), 2000);
  };

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
                  Privacy Address
                </Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 text-sm font-mono bg-muted/30 px-3 py-2 rounded-lg truncate">
                    {accountLoading ? "Loading..." : stealthAddress || "No wallet assigned"}
                  </code>
                  {stealthAddress && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        copyToClipboard(stealthAddress, "Privacy address")
                      }
                      className="shrink-0"
                    >
                      {copied === "Privacy address" ? (
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
                      {chainConfig.chain.name}
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Privacy */}
        <Card className="border border-border">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <CardTitle className="text-lg">Privacy</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Derived wallets</Label>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                    Each stream and circle gets its own wallet for balance isolation. Funds are transferred from your main wallet before streaming.
                  </p>
                </div>
                <Switch
                  checked={privacyMode.enabled}
                  onCheckedChange={privacyMode.toggle}
                  className={cn(
                    "transition-all duration-300",
                    privacyMode.enabled && "data-[state=checked]:bg-amber-500/80 shadow-[0_0_12px_-2px_rgba(251,191,36,0.5)]",
                  )}
                />
              </div>
              {privacyMode.enabled && (
                <p className="text-[11px] text-amber-400/70 leading-relaxed">
                  New streams will use per-card derived wallets. The main-to-derived transfer is visible on-chain. Shielded routing (ZW tokens) is coming soon.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Auto-collect */}
        <Card className="border border-border">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <ArrowDownToLine className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <CardTitle className="text-lg">Auto-collect</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Automatically collect incoming payments</Label>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                    When a collectable balance is detected, funds are swept to your stealth wallet without manual action.
                  </p>
                </div>
                <Switch
                  checked={autoCollect.enabled}
                  onCheckedChange={autoCollect.set}
                  className={cn(
                    "transition-all duration-300",
                    autoCollect.enabled && "data-[state=checked]:bg-amber-500/80 shadow-[0_0_12px_-2px_rgba(251,191,36,0.5)]",
                  )}
                />
              </div>
              {autoCollect.enabled && (
                <p className="text-[11px] text-amber-400/70 leading-relaxed">
                  Auto-collect checks every 60 seconds while the dashboard is open. Your stealth wallet must be unlocked for collection to work.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* TODO: Deployed Contracts section — restore once useContractDeployment is reimplemented */}

        {/* Agent Connection */}
        <Card className="border border-border">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Bot className="w-5 h-5 text-purple-400" />
              </div>
              <CardTitle className="text-lg">Agent</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {!user ? (
              <p className="text-sm text-muted-foreground py-4">
                Sign in to connect an agent.
              </p>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">MCP Server</Label>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                    Point any MCP-compatible agent at this URL. It supports OAuth 2.1 — the agent will open a browser for you to approve access.
                  </p>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                    MCP Endpoint
                  </Label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 text-xs font-mono bg-muted/30 px-3 py-2 rounded-lg truncate">
                      {`${window.location.origin.replace(/:\d+$/, ':4848')}/mcp`}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const endpoint = `${window.location.origin.replace(/:\d+$/, ':4848')}/mcp`;
                        navigator.clipboard.writeText(endpoint);
                        toast.success("MCP endpoint copied");
                      }}
                      className="shrink-0"
                    >
                      {copied === "MCP endpoint" ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  Agents can read your circles, streams, and balances, and create proposals that require your approval before execution.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
