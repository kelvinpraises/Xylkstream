import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/dialog";
import { Button } from "@/components/button";
import { Separator } from "@/components/separator";
import { Copy, Check, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

const ONBOARDED_KEY = "xylkstream_onboarded";

export function WelcomeDialog() {
  const { user, ready } = usePrivy();
  const isLoading = !ready;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isLoading || !user) return;

    const onboarded = localStorage.getItem(ONBOARDED_KEY);
    if (!onboarded) {
      setOpen(true);
    }
  }, [user, isLoading]);

  const walletAddress = user?.wallet?.address || "";

  const handleCopy = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    toast.success("Address copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGetStarted = () => {
    localStorage.setItem(ONBOARDED_KEY, "true");
    setOpen(false);
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) {
        localStorage.setItem(ONBOARDED_KEY, "true");
      }
      setOpen(v);
    }}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            Welcome to Xylkstream
          </DialogTitle>
          <DialogDescription>
            You're on BSC Testnet. Your wallet has been funded with test tokens.
          </DialogDescription>
        </DialogHeader>

        <Separator className="my-2" />

        <div className="space-y-4">
          <div>
            <span className="text-sm font-medium text-white">
              Your Account Address
            </span>
            <div className="flex items-center gap-2 mt-2">
              <code className="flex-1 text-sm font-mono bg-white/5 border border-white/10 px-3 py-2.5 rounded-lg truncate text-amber-300">
                {walletAddress || (
                  <span className="flex items-center gap-2 text-slate-500">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading...
                  </span>
                )}
              </code>
              {walletAddress && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              )}
            </div>
            {walletAddress && (
              <a
                href={`https://testnet.bscscan.com/address/${walletAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-amber-400/70 hover:text-amber-400 mt-2 transition-colors"
              >
                View on BscScan
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-1">
          On testnet, yield rewards are simulated. On mainnet, idle funds earn real yield via PancakeSwap V3.
        </p>

        <div className="flex justify-end mt-2">
          <Button onClick={handleGetStarted}>
            Get Started
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
