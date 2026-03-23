import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, CheckCircle2, AlertCircle, Users, X } from "lucide-react";
import { Button } from "@/components/atoms/button";
import { toast } from "sonner";
import { z } from "zod";
import { useValidateInvite, useJoinCircle } from "@/hooks/use-circles";
import { useCircleCrypto } from "@/hooks/use-circle-crypto";
import { useStealthWallet } from "@/providers/stealth-wallet-provider";
import { usePending } from "@/hooks/use-pending";
import { encryptStealthAddress } from "@/utils/circle-crypto";
import { getPendingByType, removePendingAction } from "@/utils/pending-engine";
import { usePrivy } from "@privy-io/react-auth";

const joinSearchSchema = z.object({
  code: z.string().optional(),
  key: z.string().optional(),
});

export const Route = createFileRoute("/circles/join")({
  validateSearch: joinSearchSchema,
  component: JoinCirclePage,
});

function JoinCirclePage() {
  const navigate = useNavigate();
  const { code, key: senderPubKey } = Route.useSearch();
  const { authenticated, ready: privyReady, login } = usePrivy();
  const { isReady: walletReady, stealthAddress } = useStealthWallet();
  const { addAction, registerProcessor } = usePending();

  const { data: inviteData, isLoading: validating, error: validateError } =
    useValidateInvite(code ?? null);
  const joinCircle = useJoinCircle();
  const circleCrypto = useCircleCrypto();

  // Show cancel button after 10s on loading states
  const [showCancel, setShowCancel] = useState(false);
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLoading = validating || !privyReady;
  const isInvalid = !isLoading && (!code || !senderPubKey || validateError);
  const isUnauthenticated = !isLoading && !isInvalid && !authenticated;
  const isWalletPending = !isLoading && !isInvalid && authenticated && (!walletReady || !stealthAddress);
  const isReady = !isLoading && !isInvalid && authenticated && walletReady && !!stealthAddress;
  const isJoining = joinCircle.isPending || circleCrypto.isDeriving;
  const isSuccess = joinCircle.isSuccess;
  const isError = joinCircle.isError;

  // Start/reset 10s cancel timer on loading/joining states
  useEffect(() => {
    if (isLoading || isJoining || isWalletPending) {
      setShowCancel(false);
      cancelTimerRef.current = setTimeout(() => setShowCancel(true), 10000);
      return () => { if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current); };
    }
    setShowCancel(false);
  }, [isLoading, isJoining, isWalletPending]);

  const handleCancel = useCallback(() => {
    navigate({ to: "/dashboard" });
  }, [navigate]);

  const attemptJoin = useCallback(
    async (inviteCode: string, pubKey: string, stealthAddr: string) => {
      try {
        const { encryptedStealthAddress, ephemeralPubKey } =
          encryptStealthAddress(stealthAddr, pubKey);

        await joinCircle.mutateAsync({
          inviteCode,
          encryptedStealthAddress,
          ephemeralPubKey,
        });

        // Clear any pending circle_join actions so dashboard doesn't redirect back
        for (const a of getPendingByType("circle_join")) {
          removePendingAction(a.id);
        }
        toast.success("you've joined the circle");
        navigate({ to: "/circles" });
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "failed to join circle",
        );
      }
    },
    [joinCircle, navigate],
  );

  // Pending engine processor for deferred joins
  useEffect(() => {
    registerProcessor(
      "circle_join",
      async (action) => {
        const { inviteCode, senderPubKey: storedKey } = action.payload;
        if (!inviteCode || !storedKey) return;
        if (!stealthAddress) return;
        await attemptJoin(inviteCode, storedKey, stealthAddress);
      },
    );
  }, [registerProcessor, stealthAddress, attemptJoin]);

  const handleSignIn = useCallback(() => {
    if (code && senderPubKey) {
      addAction("circle_join", { inviteCode: code, senderPubKey });
    }
    login();
  }, [code, senderPubKey, addAction, login]);

  const joinFiredRef = useRef(false);

  const handleJoin = useCallback(() => {
    if (!code || !senderPubKey || !stealthAddress) return;
    joinFiredRef.current = true;
    attemptJoin(code, senderPubKey, stealthAddress);
  }, [code, senderPubKey, stealthAddress, attemptJoin]);

  const circleName = inviteData?.name ?? "a circle";

  // Whether to show the cancel button in top-right:
  // - Loading states: only after 10s
  // - Authenticated states (ready, wallet pending, joining): always
  // - Not on: unauthenticated (they have sign-in button), success, error, invalid
  const showCancelButton =
    (showCancel && (isLoading || isWalletPending || isJoining)) ||
    (isReady && !isJoining && !isSuccess && !isError);

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(251,191,36,0.04),transparent_60%)]" />

      <div className="relative min-h-screen flex flex-col items-center justify-center p-6">
        {/* Cancel button — top right */}
        {showCancelButton && (
          <button
            onClick={handleCancel}
            className="absolute top-5 right-5 w-9 h-9 rounded-full border border-border/60 hover:border-border hover:bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Circle name header — single source, no icon duplication below */}
        {!isLoading && !isInvalid && (
          <div className="flex flex-col items-center mb-10">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-3">
              {isSuccess
                ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                : isError
                  ? <AlertCircle className="w-5 h-5 text-destructive" />
                  : <Users className="w-5 h-5 text-amber-400" />
              }
            </div>
            <h1 className="text-2xl font-serif font-light tracking-tight text-foreground text-center">
              {circleName}
            </h1>
          </div>
        )}

        {/* State content */}
        <div className="w-full max-w-sm">
          {isLoading && (
            <div className="flex flex-col items-center text-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                validating invite...
              </p>
            </div>
          )}

          {isInvalid && (
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <AlertCircle className="w-5 h-5 text-destructive" />
              </div>
              <h2 className="text-xl font-serif font-light mb-2">invalid invite link</h2>
              <p className="text-sm text-muted-foreground mb-8">
                {validateError instanceof Error
                  ? validateError.message
                  : "this link is missing required parameters or is no longer valid"}
              </p>
              <Button
                variant="outline"
                onClick={() => navigate({ to: "/circles" })}
                className="w-full"
              >
                go to circles
              </Button>
            </div>
          )}

          {isUnauthenticated && (
            <div className="flex flex-col items-center text-center">
              <p className="text-sm text-muted-foreground mb-8 max-w-xs">
                sign in to join this circle. your address will be encrypted so
                only the owner can see it.
              </p>
              <Button onClick={handleSignIn} className="w-full">
                sign in to join
              </Button>
            </div>
          )}

          {isWalletPending && (
            <div className="flex flex-col items-center text-center">
              <p className="text-sm text-muted-foreground mb-6 max-w-xs">
                setting up your wallet. you'll be added automatically once it's ready.
              </p>
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Ready to join — user clicks the button, no auto-join */}
          {isReady && !isJoining && !isSuccess && !isError && (
            <div className="flex flex-col items-center text-center">
              <p className="text-sm text-muted-foreground mb-8 max-w-xs">
                your address will be encrypted so only the circle owner can see it.
              </p>
              <Button onClick={handleJoin} className="w-full">
                join circle
              </Button>
            </div>
          )}

          {isJoining && (
            <div className="flex flex-col items-center text-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                encrypting and joining...
              </p>
            </div>
          )}

          {isSuccess && (
            <div className="flex flex-col items-center text-center">
              <p className="text-sm text-muted-foreground">
                you're in — redirecting...
              </p>
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center text-center">
              <p className="text-sm text-muted-foreground mb-8">
                {joinCircle.error instanceof Error
                  ? joinCircle.error.message
                  : "something went wrong"}
              </p>
              <div className="flex gap-3 w-full">
                <Button
                  variant="outline"
                  onClick={() => navigate({ to: "/circles" })}
                  className="flex-1"
                >
                  go to circles
                </Button>
                <Button
                  onClick={() => {
                    joinFiredRef.current = false;
                    handleJoin();
                  }}
                  className="flex-1"
                >
                  try again
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="absolute bottom-6 text-xs text-muted-foreground/40">
          end-to-end encrypted
        </p>
      </div>
    </div>
  );
}
