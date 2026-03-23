// collect-privacy-form.tsx — collects streamed funds with an optional ZK remint step for privacy

import { useState, useCallback, useEffect } from "react";
import { formatUnits } from "viem";
import {
  Shield,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/molecules/dialog";
import { Button } from "@/components/atoms/button";
import { Switch } from "@/components/atoms/switch";
import { toast } from "sonner";
import { useCollectStream } from "@/hooks/use-stream-collect";
import { useSplittable, useCollectable } from "@/hooks/use-stream-reads";
import { useStealthWallet } from "@/providers/stealth-wallet-provider";
import { usePrivacyEngine } from "@/hooks/use-privacy-engine";
import { useChain } from "@/providers/chain-provider";

// --- types ---

export interface CollectPrivacyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: bigint;
  tokenAddress: string;
}

type DialogStep = "preview" | "collecting" | "reminting" | "done";

const STEP_ORDER: DialogStep[] = ["preview", "collecting", "reminting", "done"];

// The 3 sub-steps inside the collecting phase
const COLLECT_SUB_STEPS = ["receiveStreams", "split", "collect"] as const;
type CollectSubStep = (typeof COLLECT_SUB_STEPS)[number];

const COLLECT_SUB_STEP_LABELS: Record<CollectSubStep, string> = {
  receiveStreams: "receive streams",
  split: "split balance",
  collect: "collect funds",
};

// Token display decimals (USDC/USDT are 18 dec)
const TOKEN_DECIMALS = 18;

// --- step indicator ---

function StepIndicator({
  current,
  withRemint,
}: {
  current: DialogStep;
  withRemint: boolean;
}) {
  const steps: DialogStep[] = withRemint
    ? ["collecting", "reminting", "done"]
    : ["collecting", "done"];

  return (
    <div className="flex items-center gap-1 mb-6">
      {steps.map((step, idx) => {
        const currentIdx = STEP_ORDER.indexOf(current);
        const stepIdx = STEP_ORDER.indexOf(step);
        const isCompleted = currentIdx > stepIdx;
        const isActive = current === step;

        return (
          <div key={step} className="flex items-center gap-1 flex-1 min-w-0">
            <div
              className={[
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0 transition-all",
                isCompleted
                  ? "bg-amber-500 text-stone-950"
                  : isActive
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/60 ring-2 ring-amber-500/20"
                    : "bg-stone-800 text-stone-500 border border-stone-700",
              ].join(" ")}
            >
              {isCompleted ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <span>{idx + 1}</span>
              )}
            </div>
            {idx < steps.length - 1 && (
              <div
                className={[
                  "h-px flex-1 transition-all",
                  isCompleted ? "bg-amber-500/60" : "bg-stone-700",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- collect sub-step row ---

function CollectSubStepRow({
  label,
  status,
}: {
  label: string;
  status: "pending" | "active" | "done";
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-5 h-5 shrink-0 flex items-center justify-center">
        {status === "done" ? (
          <CheckCircle2 className="w-4 h-4 text-amber-400" />
        ) : status === "active" ? (
          <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
        ) : (
          <div className="w-3 h-3 rounded-full border border-stone-600" />
        )}
      </div>
      <span
        className={[
          "text-sm lowercase",
          status === "done"
            ? "text-muted-foreground line-through"
            : status === "active"
              ? "text-amber-300 font-medium"
              : "text-stone-500",
        ].join(" ")}
      >
        {label}
      </span>
    </div>
  );
}

// --- proof progress label ---

const PROOF_PROGRESS_LABELS = {
  idle: "initialising...",
  "building-tree": "rebuilding merkle tree...",
  "generating-proof": "generating groth16 proof...",
  encoding: "encoding calldata...",
} as const;

// --- main dialog ---

export function CollectPrivacyDialog({
  open,
  onOpenChange,
  accountId,
  tokenAddress,
}: CollectPrivacyDialogProps) {
  const tokenAddr = tokenAddress as `0x${string}`;

  // On-chain balance reads
  const { data: splittable } = useSplittable(accountId, tokenAddr);
  const { data: collectable } = useCollectable(accountId, tokenAddr);

  // Collect pipeline
  const collect = useCollectStream();

  // Privacy
  const { stealthAddress, isReady: stealthReady } = useStealthWallet();
  const { generateRemintProof, syncTree, proofProgress } = usePrivacyEngine();
  const { chainConfig } = useChain();

  // Dialog state
  const [step, setStep] = useState<DialogStep>("preview");
  const [privacyEnabled, setPrivacyEnabled] = useState(true);
  const [destinationAddress, setDestinationAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [collectResult, setCollectResult] = useState<{
    collectTxHash: `0x${string}`;
    amount: bigint;
  } | null>(null);
  const [activeSubStep, setActiveSubStep] = useState<CollectSubStep | null>(
    null,
  );

  // Pre-fill destination with stealth address when privacy is on
  useEffect(() => {
    if (privacyEnabled && stealthAddress) {
      setDestinationAddress(stealthAddress);
    }
  }, [privacyEnabled, stealthAddress]);

  // Reset on close
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setStep("preview");
        setError(null);
        setCollectResult(null);
        setActiveSubStep(null);
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  // Total claimable = splittable + collectable
  const totalClaimable = (splittable ?? 0n) + (collectable ?? 0n);
  const claimableFormatted = formatUnits(totalClaimable, TOKEN_DECIMALS);

  // The address funds land in after collect (before optional remint)
  const effectiveDestination =
    privacyEnabled && stealthAddress
      ? (stealthAddress as `0x${string}`)
      : (destinationAddress as `0x${string}`);

  // track currentStep ref changes reactively for UI

  useEffect(() => {
    if (step !== "collecting") return;
    const raw = collect.currentStep.current;
    if (
      raw === "receiveStreams" ||
      raw === "split" ||
      raw === "collect"
    ) {
      setActiveSubStep(raw);
    }
  }, [step, collect.currentStep]);

  // --- main action ---

  const handleCollect = useCallback(async () => {
    setError(null);

    if (!effectiveDestination || !effectiveDestination.startsWith("0x")) {
      setError("please enter a valid destination address");
      return;
    }
    if (totalClaimable === 0n) {
      setError("nothing to collect");
      return;
    }

    // ── Collecting phase ────────────────────────────────────────────────────
    setStep("collecting");
    setActiveSubStep("receiveStreams");

    let result;
    try {
      result = await collect.mutateAsync({
        accountId,
        tokenAddress: tokenAddr,
        transferTo: effectiveDestination,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "collection failed — please retry",
      );
      setStep("preview");
      return;
    }

    setCollectResult({
      collectTxHash: result.collectTxHash,
      amount: totalClaimable,
    });

    // ── Optional remint phase ───────────────────────────────────────────────
    if (privacyEnabled && stealthReady && stealthAddress) {
      setStep("reminting");

      try {
        // Sync the Merkle tree so the proof is up to date
        await syncTree();

        // We need the privacy address stored in the engine; the stealth wallet
        // holds the unspent secrets. We generate the proof for the stealth
        // address as recipient using the most recent unspent secret.
        // In practice callers should pass an explicit privacyAddress; here we
        // find the first unspent leaf in the engine.
        await generateRemintProof(
          stealthAddress,
          stealthAddress as `0x${string}`,
          totalClaimable,
        );

        toast.success("funds collected and re-minted privately");
      } catch (err) {
        // Remint failure is non-fatal — funds are already in the stealth wallet
        const msg =
          err instanceof Error ? err.message : "remint failed";
        setError(
          `funds collected, but remint proof failed: ${msg}. your funds are safe in the stealth wallet.`,
        );
        toast.warning("collected, but remint proof could not be generated");
      }
    } else {
      toast.success("funds collected");
    }

    setStep("done");
  }, [
    effectiveDestination,
    totalClaimable,
    accountId,
    tokenAddr,
    privacyEnabled,
    stealthReady,
    stealthAddress,
    collect,
    syncTree,
    generateRemintProof,
  ]);

  // --- sub-step status helper ---

  function subStepStatus(sub: CollectSubStep): "pending" | "active" | "done" {
    if (step === "done" || step === "reminting") return "done";
    if (activeSubStep === null) return "pending";
    const order = COLLECT_SUB_STEPS;
    const activeIdx = order.indexOf(activeSubStep);
    const subIdx = order.indexOf(sub);
    if (subIdx < activeIdx) return "done";
    if (subIdx === activeIdx) return "active";
    return "pending";
  }

  // --- render ---

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="lowercase flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
            collect funds
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator — shown after preview */}
        {step !== "preview" && (
          <StepIndicator current={step} withRemint={privacyEnabled} />
        )}

        <div className="space-y-5">
          {/* ── Step 1: Preview ── */}
          {step === "preview" && (
            <div className="space-y-4">
              {/* Claimable amount */}
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground lowercase mb-1">
                    available to collect
                  </p>
                  <p className="font-mono text-2xl text-amber-400 font-light">
                    {parseFloat(claimableFormatted).toFixed(4)}
                    <span className="text-sm text-muted-foreground ml-2">
                      tokens
                    </span>
                  </p>
                </div>

                {/* Breakdown */}
                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-amber-500/10">
                  <div>
                    <p className="text-xs text-muted-foreground lowercase">
                      splittable
                    </p>
                    <p className="text-sm font-mono text-foreground mt-0.5">
                      {formatUnits(splittable ?? 0n, TOKEN_DECIMALS)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground lowercase">
                      collectable
                    </p>
                    <p className="text-sm font-mono text-foreground mt-0.5">
                      {formatUnits(collectable ?? 0n, TOKEN_DECIMALS)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Privacy toggle */}
              <div className="flex items-center justify-between rounded-xl border border-border bg-card/50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-400" />
                  <div>
                    <p className="text-sm font-medium lowercase">
                      withdraw privately
                    </p>
                    <p className="text-xs text-muted-foreground">
                      remint to a fresh stealth address
                    </p>
                  </div>
                </div>
                <Switch
                  checked={privacyEnabled}
                  onCheckedChange={(v) => {
                    setPrivacyEnabled(v);
                    if (!v) setDestinationAddress("");
                  }}
                />
              </div>

              {/* Destination address */}
              {!privacyEnabled && (
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground lowercase">
                    destination address
                  </label>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-amber-500/50 transition-colors"
                  />
                </div>
              )}

              {/* Stealth wallet not ready warning */}
              {privacyEnabled && !stealthReady && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300/80">
                    stealth wallet not unlocked — enter your password on the
                    dashboard first, or disable private withdrawal
                  </p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-300">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="lowercase"
                  onClick={() => handleOpenChange(false)}
                >
                  cancel
                </Button>
                <Button
                  size="sm"
                  disabled={
                    totalClaimable === 0n ||
                    (privacyEnabled && !stealthReady) ||
                    (!privacyEnabled && !destinationAddress.startsWith("0x"))
                  }
                  onClick={handleCollect}
                  className="lowercase bg-gradient-to-r from-amber-600 to-amber-500 text-stone-950 hover:from-amber-500 hover:to-amber-400 border-0"
                >
                  <ArrowRight className="w-4 h-4 mr-1.5" />
                  collect
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 2: Collecting ── */}
          {step === "collecting" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
                <Loader2 className="w-5 h-5 text-amber-400 animate-spin shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-amber-300 lowercase">
                    collecting on-chain
                  </p>
                  <p className="text-xs text-amber-300/60 mt-0.5">
                    3 transactions required — do not close this window
                  </p>
                </div>
              </div>

              <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                {COLLECT_SUB_STEPS.map((sub) => (
                  <div key={sub} className="px-4">
                    <CollectSubStepRow
                      label={COLLECT_SUB_STEP_LABELS[sub]}
                      status={subStepStatus(sub)}
                    />
                  </div>
                ))}
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-300">{error}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-xs lowercase shrink-0"
                    onClick={() => {
                      setError(null);
                      setStep("preview");
                    }}
                  >
                    retry
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Reminting ── */}
          {step === "reminting" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
                <Loader2 className="w-5 h-5 text-amber-400 animate-spin shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-amber-300 lowercase">
                    generating privacy proof
                  </p>
                  <p className="text-xs text-amber-300/60 mt-0.5">
                    {PROOF_PROGRESS_LABELS[proofProgress]}
                  </p>
                </div>
              </div>

              {/* Funds already collected confirmation */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-500/60 shrink-0" />
                <span className="lowercase">collecting — done</span>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-300">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Done ── */}
          {step === "done" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-rose-500/5 p-5 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <p className="text-foreground font-medium lowercase">
                    {privacyEnabled ? "funds collected privately" : "funds collected"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {parseFloat(claimableFormatted).toFixed(4)} tokens transferred
                    {privacyEnabled && stealthReady
                      ? " to your stealth wallet"
                      : ` to ${effectiveDestination.slice(0, 10)}...`}
                  </p>
                </div>

                {collectResult?.collectTxHash && (
                  <a
                    href={`${chainConfig.chain.blockExplorers?.default?.url ?? ""}/tx/${collectResult.collectTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-amber-400/70 hover:text-amber-400 transition-colors"
                  >
                    view on block explorer
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {/* Non-fatal error (e.g. remint failed but collect succeeded) */}
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-300">{error}</p>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="lowercase"
                  onClick={() => handleOpenChange(false)}
                >
                  done
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
