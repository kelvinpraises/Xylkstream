import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/molecules/dialog";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { Separator } from "@/components/atoms/separator";
import { Shield, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useStealthWalletContext } from "@/providers/stealth-wallet-provider";

const STEALTH_KEY = "xylkstream_has_stealth";

export function PasswordDialog() {
  const { authenticated, ready } = usePrivy();
  const { isReady, isDeriving, error, deriveWallet } = useStealthWalletContext();

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const isReturning = typeof window !== "undefined" && !!localStorage.getItem(STEALTH_KEY);

  // Derive open: show when authenticated but stealth wallet not yet ready.
  const open = ready && authenticated && !isReady;

  const handleUnlock = async () => {
    if (!password) return;
    await deriveWallet(password);
    // Check state after — error is surfaced inline via `error` from context.
    // On success isReady will flip to true which closes the dialog via the effect above.
  };

  // Surface toast on success (isReady flip)
  useEffect(() => {
    if (isReady) {
      localStorage.setItem(STEALTH_KEY, "true");
      toast.success("stealth wallet unlocked");
    }
  }, [isReady]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isDeriving && password) {
      handleUnlock();
    }
  };

  if (!authenticated) return null;

  return (
    <Dialog open={open} onOpenChange={() => {/* intentionally blocked */}}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-lg"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-amber-400" />
            </div>
            <DialogTitle className="text-2xl lowercase">
              unlock your wallet
            </DialogTitle>
          </div>
          <DialogDescription>
            {isReturning
              ? "enter your password to restore your private stealth wallet for this session."
              : "choose a password to derive your private stealth wallet. it never leaves your device."}
          </DialogDescription>
        </DialogHeader>

        <Separator className="my-2" />

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="stealth-password" className="text-sm font-medium text-white">
              {isReturning ? "your password" : "choose a password"}
            </Label>
            <div className="relative">
              <Input
                id="stealth-password"
                type={showPassword ? "text" : "password"}
                placeholder={isReturning ? "enter your password" : "choose a strong password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isDeriving}
                className="pr-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? "hide password" : "show password"}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {isReturning
              ? "your password is never stored — it re-derives the same wallet every time. if you forget it, your stealth funds cannot be recovered."
              : "this password derives a deterministic private wallet. write it down somewhere safe — there is no recovery option."}
          </p>

          {error && (
            <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button
            onClick={handleUnlock}
            disabled={isDeriving || !password}
            className="w-full lowercase bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-400/50 text-amber-300 hover:text-amber-200 transition-all"
            variant="ghost"
          >
            {isDeriving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                deriving wallet...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                unlock
              </span>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
