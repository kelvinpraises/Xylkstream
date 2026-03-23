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
import { Shield, Loader2, Eye, EyeOff, AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useStealthWallet } from "@/providers/stealth-wallet-provider";

const STEALTH_KEY = "xylkstream_has_stealth";
const PASSWORD_HASH_KEY = "xylkstream_pwd_hash";

/** Simple hash for password verification (not security-critical — wallet derivation uses the real crypto). */
async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode("xylkstream-pwd-check:" + password);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function PasswordDialog() {
  const { authenticated, ready } = usePrivy();
  const { isReady, isDeriving, error, deriveWallet } = useStealthWallet();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [mismatchError, setMismatchError] = useState("");

  const storedHash =
    typeof window !== "undefined"
      ? localStorage.getItem(PASSWORD_HASH_KEY)
      : null;
  const isReturning = !!storedHash;

  // Dialog open: show when authenticated but stealth wallet not yet ready.
  const open = ready && authenticated && !isReady;

  const handleUnlock = async () => {
    if (!password) return;

    // First-time setup: require confirmation
    if (!isReturning) {
      if (password !== confirmPassword) {
        setMismatchError("passwords don't match. please try again.");
        return;
      }
      if (password.length < 4) {
        setMismatchError("password must be at least 4 characters.");
        return;
      }
      setMismatchError("");
      // Store hash for future verification
      const hash = await hashPassword(password);
      localStorage.setItem(PASSWORD_HASH_KEY, hash);
    } else {
      // Returning user: verify password matches stored hash
      const hash = await hashPassword(password);
      if (hash !== storedHash) {
        setMismatchError("incorrect password. if you've forgotten it, you can reset below.");
        return;
      }
      setMismatchError("");
    }

    await deriveWallet(password);
  };

  const handleReset = () => {
    localStorage.removeItem(PASSWORD_HASH_KEY);
    localStorage.removeItem(STEALTH_KEY);
    setPassword("");
    setConfirmPassword("");
    setMismatchError("");
    setShowReset(false);
    toast("Password reset. You'll need to set a new one.", {
      description:
        "Existing stream wallets derived from the old password will no longer be accessible.",
    });
    // Force re-render by reloading
    window.location.reload();
  };

  // Surface toast on success
  useEffect(() => {
    if (isReady && password) {
      localStorage.setItem(STEALTH_KEY, "true");
      toast.success("Stealth wallet unlocked");
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
            <DialogTitle className="text-2xl">
              {isReturning ? "Unlock Your Wallet" : "Set Up Your Wallet"}
            </DialogTitle>
          </div>
          <DialogDescription>
            {isReturning
              ? "enter your password to restore your private stealth wallet for this session."
              : "choose a password to derive your private stealth wallet. each stream gets its own wallet."}
          </DialogDescription>
        </DialogHeader>

        <Separator className="my-2" />

        {/* Warning banner — always visible */}
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/90 leading-relaxed">
            <strong>if you forget this password, your stealth wallets cannot be recovered.</strong>{" "}
            write it down somewhere safe. resetting will make old stream wallets inaccessible.
          </p>
        </div>

        {showReset ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 space-y-3">
              <p className="text-sm text-destructive font-medium">
                Are you sure you want to reset?
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This will clear your stored password. Any existing streams created with the old
                password will use wallets you can no longer access. Only do this if you've truly
                forgotten your password.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReset(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleReset}
                >
                  Reset Password
                </Button>
              </div>
            </div>
          </div>
        ) : (
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
                  onChange={(e) => { setPassword(e.target.value); setMismatchError(""); }}
                  onKeyDown={!isReturning ? undefined : handleKeyDown}
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

            {/* Confirm password — first-time only */}
            {!isReturning && (
              <div className="space-y-2">
                <Label htmlFor="stealth-password-confirm" className="text-sm font-medium text-white">
                  confirm password
                </Label>
                <Input
                  id="stealth-password-confirm"
                  type={showPassword ? "text" : "password"}
                  placeholder="re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setMismatchError(""); }}
                  onKeyDown={handleKeyDown}
                  disabled={isDeriving}
                />
              </div>
            )}

            {(mismatchError || error) && (
              <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                {mismatchError || error}
              </p>
            )}

            <Button
              onClick={handleUnlock}
              disabled={isDeriving || !password || (!isReturning && !confirmPassword)}
              className="w-full bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 transition-all"
            >
              {isDeriving ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Deriving Wallet...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  {isReturning ? "Unlock" : "Set Password & Unlock"}
                </span>
              )}
            </Button>

            {/* Reset option for returning users */}
            {isReturning && (
              <button
                onClick={() => setShowReset(true)}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-amber-400 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                forgot password? reset
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
