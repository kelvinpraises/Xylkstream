import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { encodeFunctionData, parseUnits } from "viem";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/molecules/dialog";
import { Button } from "@/components/atoms/button";
import { Separator } from "@/components/atoms/separator";
import { Copy, Check, ExternalLink, Loader2, Coins } from "lucide-react";
import { toast } from "sonner";
import { useChain } from "@/providers/chain-provider";
import { useStealthWallet } from "@/providers/stealth-wallet-provider";
import { friendlyTxError } from "@/utils";

const ONBOARDED_KEY = "xylkstream_onboarded";

const MINT_ABI = [
  {
    name: "mint",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export function WelcomeDialog() {
  const { user, ready } = usePrivy();
  const { chainConfig } = useChain();
  const stealthWallet = useStealthWallet();
  const queryClient = useQueryClient();
  const isLoading = !ready;
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mintingUsdc, setMintingUsdc] = useState(false);
  const [mintingUsdt, setMintingUsdt] = useState(false);

  const alreadyOnboarded =
    typeof window !== "undefined" && !!localStorage.getItem(ONBOARDED_KEY);
  const open = !isLoading && !!user && !alreadyOnboarded && !dismissed && stealthWallet.isReady;

  const displayAddress =
    stealthWallet.stealthAddress || user?.wallet?.address || "";

  const handleCopy = () => {
    if (!displayAddress) return;
    navigator.clipboard.writeText(displayAddress);
    setCopied(true);
    toast.success("Address copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDismiss = () => {
    localStorage.setItem(ONBOARDED_KEY, "true");
    setDismissed(true);
  };

  const isMinting = mintingUsdc || mintingUsdt;

  const handleMint = async (token: "usdc" | "usdt") => {
    if (!stealthWallet.isReady || !stealthWallet.stealthAddress || isMinting) return;

    const tokenAddress =
      token === "usdc"
        ? chainConfig.contracts.mockUsdc
        : chainConfig.contracts.mockUsdt;

    const tokenSymbol = token === "usdc" ? "tUSDC" : "tUSDT";
    const setMinting = token === "usdc" ? setMintingUsdc : setMintingUsdt;

    setMinting(true);
    try {
      const data = encodeFunctionData({
        abi: MINT_ABI,
        functionName: "mint",
        args: [stealthWallet.stealthAddress as `0x${string}`, parseUnits("1000", 18)],
      });

      await stealthWallet.sendTransaction({ to: tokenAddress, data });
      await queryClient.invalidateQueries({ queryKey: ["tokenBalance"] });
      toast.success(`Minted 1000 ${tokenSymbol} to your wallet`);
    } catch (err) {
      toast.error(friendlyTxError(err));
    } finally {
      setMinting(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleDismiss();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl">Welcome to Xylkstream</DialogTitle>
          <DialogDescription>
            Mint free test tokens to get started. All gas is sponsored — no ETH
            needed.
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
                {displayAddress || (
                  <span className="flex items-center gap-2 text-slate-500">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading...
                  </span>
                )}
              </code>
              {displayAddress && (
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
            {displayAddress && chainConfig.chain.blockExplorers?.default?.url && (
              <a
                href={`${chainConfig.chain.blockExplorers.default.url}/address/${displayAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-amber-400/70 hover:text-amber-400 mt-2 transition-colors"
              >
                View on {chainConfig.chain.blockExplorers.default.name}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {!stealthWallet.isReady && (
            <p className="text-xs text-amber-500/80">
              Unlock your wallet first to mint tokens.
            </p>
          )}

            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleMint("usdt")}
                disabled={isMinting}
              >
                {mintingUsdt ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Coins className="w-4 h-4 mr-2" />
                )}
                Mint 1000 USDT
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleMint("usdc")}
                disabled={isMinting}
              >
                {mintingUsdc ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Coins className="w-4 h-4 mr-2" />
                )}
                Mint 1000 USDC
              </Button>
            </div>

          <div className="flex justify-center">
            <button
              onClick={handleDismiss}
              className="text-xs text-muted-foreground hover:text-white transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
