import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNow } from "@/hooks/use-now";
import { Plus, Check, Loader2, Copy, XCircle, CheckCircle2, Shield, Globe, Edit2, Pause, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { Card } from "@/components/molecules/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/atoms/select";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/molecules/drawer";
import { Separator } from "@/components/atoms/separator";
import { CSVBatchDialog } from "@/components/organisms/csv-batch-dialog";
import { StreamEditDrawer } from "@/components/organisms/stream-edit-drawer";

import { useCreateStream } from "@/hooks/use-stream-create";
import { usePauseStream, useResumeStream, useCancelStream, useEditStream } from "@/hooks/use-stream-actions";
import { useTokenDecimals } from "@/hooks/use-token-decimals";
import { useTokenBalance } from "@/hooks/use-stream-reads";
import { useLocalStreams, updateStream, getStreams } from "@/store/stream-store";
import type { LocalStream } from "@/store/stream-store";
import { useChain } from "@/providers/chain-provider";
import { useStealthWallet } from "@/providers/stealth-wallet-provider";
import { getSendableTokens } from "@/config/chains";
import { usePrivy } from "@privy-io/react-auth";
import { formatUnits } from "viem";
import { config } from "@/config";

interface StreamsSearch {
  recipient?: string;
  batchRecipients?: string;
}

export const Route = createFileRoute("/streams/")({
  component: StreamsPage,
  validateSearch: (search: Record<string, unknown>): StreamsSearch => ({
    recipient: typeof search.recipient === "string" ? search.recipient : undefined,
    batchRecipients: typeof search.batchRecipients === "string" ? search.batchRecipients : undefined,
  }),
});

// TOKENS is resolved inside the component via useChain

// Wizard steps (chain & deploy are automatic — backend auto-deploys per-account)
const WIZARD_STEPS = [
  { id: "details", title: "Payment Details", description: "Who and How Much" },
  { id: "claim", title: "Personalize", description: "Add a Message" },
];

const isValidAddress = (addr: string) =>
  /^0x[a-fA-F0-9]{40}$/.test(addr);

type TimeUnit = "minutes" | "hours" | "days" | "weeks" | "months";

const toSeconds = (value: number, unit: TimeUnit) => {
  const multipliers: Record<TimeUnit, number> = {
    minutes: 60,
    hours: 3600,
    days: 86400,
    weeks: 604800,
    months: 2592000, // 30 days
  };
  return value * multipliers[unit];
};

function StreamWizard({ onClose, initialRecipient }: { onClose: () => void; initialRecipient?: string }) {
  const { chainConfig, chainId } = useChain();
  const { getAccessToken } = usePrivy();
  const { stealthAddress } = useStealthWallet();
  const TOKENS = getSendableTokens(chainConfig.contracts);
  const [currentStep, setCurrentStep] = useState(0);
  const [wizardState, setWizardState] = useState<"form" | "processing" | "success" | "error">("form");
  const [successStreamId, setSuccessStreamId] = useState<string | null>(null);
  const [claimLink, setClaimLink] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [copiedClaimLink, setCopiedClaimLink] = useState(false);
  const [copiedStreamId, setCopiedStreamId] = useState(false);
  const [formData, setFormData] = useState(() => {
    return {
    streamName: "",
    tokenAddress: TOKENS[0].address,
    recipient: initialRecipient ?? "",
    amount: "",
    startValue: 0,
    startUnit: "minutes" as TimeUnit,
    endValue: 3,
    endUnit: "months" as TimeUnit,
    claimPageTitle: "",
    claimPageSubtitle: "",
    };
  });

  const { data: tokenDecimals } = useTokenDecimals(formData.tokenAddress as `0x${string}`);
  const { data: rawBalance } = useTokenBalance(
    stealthAddress as `0x${string}` | undefined,
    formData.tokenAddress as `0x${string}`,
  );
  const walletBalance = rawBalance !== undefined
    ? parseFloat(formatUnits(rawBalance, tokenDecimals ?? 18))
    : undefined;
  const sendStream = useCreateStream();

  const handleNext = async () => {
    // Validation for details step
    if (currentStep === 0) {
      if (!formData.streamName) {
        toast.error("Please enter a stream name");
        return;
      }
      if (!formData.tokenAddress) {
        toast.error("Please select a token");
        return;
      }
      if (!formData.recipient) {
        toast.error("Please enter a recipient address");
        return;
      }
      if (!isValidAddress(formData.recipient)) {
        toast.error("Please enter a valid 0x wallet address");
        return;
      }
      if (!formData.amount || parseFloat(formData.amount) <= 0) {
        toast.error("Please enter a valid amount");
        return;
      }
      if (walletBalance !== undefined && parseFloat(formData.amount) > walletBalance) {
        toast.error(`Insufficient balance. You have ${walletBalance.toFixed(2)} ${selectedToken?.symbol ?? "tokens"}`);
        return;
      }
      if (formData.endValue <= 0) {
        toast.error("Please set a duration");
        return;
      }
    }

    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Submit - create stream on-chain via AddressDriver
      setWizardState("processing");

      const nowSecs = Math.floor(Date.now() / 1000);
      const startTimestamp = nowSecs + toSeconds(formData.startValue, formData.startUnit);
      const endTimestamp = startTimestamp + toSeconds(formData.endValue, formData.endUnit);
      const durationSeconds = endTimestamp - startTimestamp;
      const selectedToken = TOKENS.find(t => t.address === formData.tokenAddress);

      sendStream.mutateAsync({
        tokenAddress: formData.tokenAddress as `0x${string}`,
        recipientAddress: formData.recipient as `0x${string}`,
        totalAmount: formData.amount,
        tokenDecimals: tokenDecimals ?? 18,
        durationSeconds,
        usePrivacy: true,
        tokenSymbol: selectedToken?.symbol ?? "TOKEN",
        startTimestamp: Math.floor(startTimestamp),
      }).then(async (result) => {
        setSuccessStreamId(result.txHash);

        // Create claim page on server
        try {
          const token = await getAccessToken();
          const res = await fetch(`${config.API_URL}/claims`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              streamId: result.txHash,
              recipientAddress: formData.recipient,
              tokenAddress: formData.tokenAddress,
              tokenSymbol: selectedToken?.symbol ?? "TOKEN",
              totalAmount: formData.amount,
              amtPerSec: String(
                Number(formData.amount) / durationSeconds,
              ),
              startTimestamp: Math.floor(startTimestamp),
              endTimestamp: Math.floor(endTimestamp),
              title: formData.claimPageTitle || "You've Got Money!",
              subtitle: formData.claimPageSubtitle || "",
              chainId,
            }),
          });
          if (res.ok) {
            const { claim } = await res.json();
            setClaimLink(`${window.location.origin}/claim/${claim.id}`);
            // Persist claimId in localStorage so stream detail page can show the link
            const match = getStreams(chainId).find((s) => s.txHash === result.txHash);
            if (match) updateStream(chainId, match.id, { claimId: claim.id });
          }
        } catch {
          // Non-fatal — stream was created, claim link just won't be available
        }

        setWizardState("success");
      }).catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "Failed to create stream");
        setWizardState("error");
      });
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && wizardState !== "processing") {
      onClose();
    }
  };

  const handleCopyStreamId = () => {
    if (!successStreamId) return;
    navigator.clipboard.writeText(String(successStreamId));
    setCopiedStreamId(true);
    toast.success("Stream ID copied");
    setTimeout(() => setCopiedStreamId(false), 2000);
  };

  const handleCopyClaimLink = () => {
    if (!claimLink) return;
    navigator.clipboard.writeText(claimLink);
    setCopiedClaimLink(true);
    toast.success("Claim link copied");
    setTimeout(() => setCopiedClaimLink(false), 2000);
  };

  const selectedToken = TOKENS.find((t) => t.address === formData.tokenAddress);

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <Card className="max-w-3xl w-full p-8 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {wizardState === "processing" && (
          <div className="flex flex-col items-center justify-center min-h-[350px] gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <h2 className="text-xl font-serif font-light">Creating your payment...</h2>
            <p className="text-sm text-muted-foreground">Submitting to the blockchain</p>
          </div>
        )}

        {wizardState === "success" && (
          <div className="flex flex-col items-center justify-center min-h-[350px] gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-serif font-light">Payment sent!</h2>

            {claimLink && (
              <div className="w-full max-w-sm mt-2">
                <p className="text-sm text-muted-foreground text-center mb-2">
                  Share this link with your recipient
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                  <code className="text-xs font-mono text-amber-400/80 truncate flex-1">
                    {claimLink}
                  </code>
                  <Button variant="ghost" size="icon" onClick={handleCopyClaimLink} className="shrink-0 h-8 w-8">
                    {copiedClaimLink ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-amber-400" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            {successStreamId && (
              <div className="flex items-center gap-2 mt-1">
                <code className="text-xs font-mono text-muted-foreground/60">
                  tx: {String(successStreamId).slice(0, 10)}...{String(successStreamId).slice(-6)}
                </code>
                <Button variant="ghost" size="icon" onClick={handleCopyStreamId} className="shrink-0 h-6 w-6">
                  {copiedStreamId ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </Button>
              </div>
            )}

            <Button onClick={onClose} className="mt-4">
              Done
            </Button>
          </div>
        )}

        {wizardState === "error" && (
          <div className="flex flex-col items-center justify-center min-h-[350px] gap-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-serif font-light">Something went wrong</h2>
            <p className="text-sm text-muted-foreground text-center max-w-md">{errorMessage}</p>
            <div className="flex gap-3 mt-4">
              <Button
                variant="outline"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setWizardState("form");
                  setErrorMessage("");
                }}
              >
                Try Again
              </Button>
            </div>
          </div>
        )}

        {wizardState === "form" && (
          <>
            <div className="mb-8">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-serif font-light mb-2">Set Up a New Payment</h2>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/50 border border-border text-xs text-muted-foreground">
                  <Globe className="w-3 h-3" />
                  {chainConfig.chain.name}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Step {currentStep + 1} of {WIZARD_STEPS.length}
              </p>
            </div>

            {/* Progress Steps */}
            <div className="mb-8">
              <div className="flex items-start">
                {WIZARD_STEPS.map((step, index) => (
                  <div key={step.id} className="flex items-start flex-1">
                    <div className="flex flex-col items-center flex-1">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                          index <= currentStep
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {index < currentStep ? <Check className="w-5 h-5" /> : index + 1}
                      </div>
                      <div className="mt-2 text-center">
                        <div className="text-xs font-medium">{step.title}</div>
                        <div className="text-xs text-muted-foreground">{step.description}</div>
                      </div>
                    </div>
                    {index < WIZARD_STEPS.length - 1 && (
                      <div
                        className={`h-0.5 w-16 shrink-0 mt-5 -mx-2 transition-colors ${
                          index < currentStep ? "bg-primary" : "bg-border"
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Step Content */}
            <div className="min-h-[300px] mb-8">
              {currentStep === 0 && (
                <div className="space-y-5">
                  <h3 className="text-lg font-medium">Payment Details</h3>
                  <div className="space-y-5">
                    {/* Stream Name */}
                    <div>
                      <Label className="mb-2">Payment Name</Label>
                      <Input
                        placeholder="e.g., Monthly allowance for Alex"
                        value={formData.streamName}
                        onChange={(e) => setFormData({ ...formData, streamName: e.target.value })}
                      />
                    </div>

                    {/* Token Selection */}
                    <div>
                      <Label className="mb-2">Token</Label>
                      <Select
                        value={formData.tokenAddress}
                        onValueChange={(value) => setFormData({ ...formData, tokenAddress: value as `0x${string}` })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a token" />
                        </SelectTrigger>
                        <SelectContent>
                          {TOKENS.map((token) => (
                            <SelectItem key={token.address} value={token.address}>
                              <span>{token.symbol}</span>
                              <span className="text-xs text-muted-foreground ml-2">
                                on {chainConfig.chain.name}
                              </span>
                              <span className="text-xs text-muted-foreground ml-2 font-mono">
                                ({token.address.slice(0, 6)}...{token.address.slice(-4)})
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Recipient */}
                    <div>
                      <Label className="mb-2">Recipient</Label>
                      <Input
                        placeholder="0x... wallet address"
                        value={formData.recipient}
                        onChange={(e) => setFormData({ ...formData, recipient: e.target.value })}
                      />
                    </div>

                    {/* Amount */}
                    <div>
                      <Label className="mb-2">
                        Amount
                        {selectedToken && walletBalance !== undefined ? (
                          <span className="text-muted-foreground font-normal ml-1">
                            (Balance: {walletBalance.toFixed(2)} {selectedToken.symbol})
                          </span>
                        ) : selectedToken ? (
                          <span className="text-muted-foreground font-normal ml-1">
                            ({selectedToken.symbol})
                          </span>
                        ) : null}
                      </Label>
                      <Input
                        type="number"
                        placeholder="e.g., 10000"
                        min="0"
                        step="any"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      />
                    </div>

                    {/* Duration */}
                    <div className="space-y-3">
                      <Label className="mb-2">Duration</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          value={formData.startValue}
                          onChange={(e) => setFormData({ ...formData, startValue: parseInt(e.target.value) || 0 })}
                          className="w-20"
                        />
                        <Select
                          value={formData.startUnit}
                          onValueChange={(v) => setFormData({ ...formData, startUnit: v as TimeUnit })}
                        >
                          <SelectTrigger className="w-[110px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(["minutes", "hours", "days", "weeks", "months"] as TimeUnit[]).map((unit) => (
                              <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-sm text-muted-foreground">from now, it starts</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="1"
                          value={formData.endValue}
                          onChange={(e) => setFormData({ ...formData, endValue: parseInt(e.target.value) || 1 })}
                          className="w-20"
                        />
                        <Select
                          value={formData.endUnit}
                          onValueChange={(v) => setFormData({ ...formData, endUnit: v as TimeUnit })}
                        >
                          <SelectTrigger className="w-[110px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(["minutes", "hours", "days", "weeks", "months"] as TimeUnit[]).map((unit) => (
                              <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-sm text-muted-foreground">later, it ends</span>
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {currentStep === 1 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Personalize</h3>
                  <p className="text-sm text-muted-foreground">
                    Add a message for the person you're sending to
                  </p>
                  <div className="space-y-4">
                    <div>
                      <Label className="mb-2">Page Title</Label>
                      <Input
                        placeholder="e.g., Happy Birthday!"
                        value={formData.claimPageTitle}
                        onChange={(e) =>
                          setFormData({ ...formData, claimPageTitle: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label className="mb-2">Subtitle (optional)</Label>
                      <Input
                        placeholder="e.g., Here's a little something for you"
                        value={formData.claimPageSubtitle}
                        onChange={(e) =>
                          setFormData({ ...formData, claimPageSubtitle: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  {/* Summary */}
                  <Separator className="my-4" />
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Payment Summary</h4>
                    <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Token</span>
                        <span className="font-mono">{selectedToken?.symbol || "---"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Amount</span>
                        <span className="font-mono">{formData.amount || "---"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Recipient</span>
                        <span className="font-mono text-xs truncate max-w-[200px]">
                          {formData.recipient || "---"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Duration</span>
                        <span>
                          {formData.startValue === 0 ? "Starts now" : `Starts in ${formData.startValue} ${formData.startUnit}`}, runs for {formData.endValue} {formData.endUnit}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Mode</span>
                        <span className="text-amber-400">Private (stealth wallet)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <div className="flex gap-2">
                {currentStep > 0 && (
                  <Button variant="outline" onClick={handleBack}>
                    Back
                  </Button>
                )}
                <Button
                  onClick={handleNext}
                >
                  {currentStep === WIZARD_STEPS.length - 1 ? "Send Payment" : "Next"}
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// Stream detail drawer component
function StreamDetailDrawer({
  stream,
  open,
  onOpenChange,
  onViewDetails,
  onPause,
  onResume,
  onEdit,
  onCancel,
  isActionPending,
  claimLink,
}: {
  stream: LocalStream | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewDetails: (id: string) => void;
  onPause?: (stream: LocalStream) => void;
  onResume?: (stream: LocalStream) => void;
  onEdit?: (stream: LocalStream) => void;
  onCancel?: (stream: LocalStream) => void;
  isActionPending?: boolean;
  claimLink?: string;
}) {
  const nowSecs = useNow();

  if (!stream) return null;

  const duration = stream.endTimestamp - stream.startTimestamp;
  const isPaused = stream.status === "PAUSED";
  const isTerminal = stream.status === "CANCELLED";
  const isActive = stream.endTimestamp > nowSecs && !isPaused && !isTerminal;

  // Freeze progress when paused
  let progress: number;
  let streamed: number;
  let monthlyRate: number;
  if (isPaused && stream.pausedRemainingDuration !== undefined) {
    const elapsedAtPause = duration - stream.pausedRemainingDuration;
    progress = duration > 0 ? Math.min(100, (elapsedAtPause / duration) * 100) : 0;
    streamed = parseFloat(stream.totalAmount) - parseFloat(stream.pausedRemainingAmount ?? "0");
    monthlyRate = 0;
  } else {
    const elapsed = Math.max(0, nowSecs - stream.startTimestamp);
    progress = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
    streamed = parseFloat(stream.totalAmount) * (progress / 100);
    monthlyRate = parseFloat(stream.totalAmount) / Math.max(1, duration / (86400 * 30));
  }

  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast.success("Address copied to clipboard");
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{stream.tokenSymbol} Stream</DrawerTitle>
          <DrawerDescription>
            Payment Details
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-4 overflow-y-auto max-h-[70vh]">
          <div className="max-w-2xl mx-auto">
            {/* Status and Progress */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    isActive
                      ? "bg-white/70 shadow-[0_0_8px_rgba(255,255,255,0.4)]"
                      : "bg-muted-foreground/40"
                  }`}
                  style={isActive ? { animation: "breathe 4s ease-in-out infinite" } : undefined}
                />
                <span className="text-sm font-light">{isActive ? "Active" : isPaused ? "Paused" : isTerminal ? "Cancelled" : "Completed"}</span>
              </div>

              <div className="h-0.5 bg-muted rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-foreground/50 relative"
                  style={{ width: `${progress}%` }}
                >
                  {isActive && (
                    <div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                      style={{ animation: "flow 2s infinite" }}
                    />
                  )}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {streamed.toFixed(2)} / {stream.totalAmount} {stream.tokenSymbol} ({progress.toFixed(0)}%)
              </div>
            </div>

            {/* Stream Details */}
            <div className="space-y-3 mb-6">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Sending</div>
                  <div className="text-base font-light font-mono">
                    {monthlyRate.toFixed(2)}
                    <span className="text-xs text-muted-foreground ml-1">/mo</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Asset</div>
                  <div className="text-base font-light font-mono">{stream.tokenSymbol}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Start Date</div>
                  <div className="text-base font-light">
                    {new Date(stream.startTimestamp * 1000).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">End Date</div>
                  <div className="text-base font-light">
                    {new Date(stream.endTimestamp * 1000).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>

            <Separator className="my-4" />

            {/* Private Wallet */}
            {stream.isPrivate && stream.walletAddress && (
              <div className="mb-4">
                <div className="flex items-center gap-1.5 text-sm font-light mb-3">
                  <Shield className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
                  <span className="text-amber-400">Private Wallet</span>
                </div>
                <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                  <code className="text-xs text-amber-400/70 block truncate font-light font-mono">
                    {stream.walletAddress}
                  </code>
                  {stream.walletIndex !== undefined && (
                    <span className="text-[10px] text-muted-foreground mt-1 block">
                      derivation index: {stream.walletIndex}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Recipient */}
            <div>
              <div className="text-sm font-light mb-3">Recipient</div>
              <div className="p-3 rounded-lg bg-muted/30">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <code className="text-xs text-muted-foreground block truncate font-light">
                      {stream.recipientAddress}
                    </code>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopyAddress(stream.recipientAddress)}
                    className="shrink-0 ml-2 h-6 w-6 p-0"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Claim Link */}
            {claimLink && (
              <div className="mt-4">
                <div className="text-sm font-light mb-3">Claim Link</div>
                <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-amber-400/70 truncate flex-1">
                      {claimLink}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(claimLink);
                        toast.success("Claim link copied");
                      }}
                      className="shrink-0 h-6 w-6 p-0"
                    >
                      <Copy className="w-3 h-3 text-amber-400" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DrawerFooter>
          {!isTerminal && (
            <div className="flex gap-2">
              {isActive && (
                <Button variant="outline" className="flex-1" onClick={() => onPause?.(stream)} disabled={isActionPending}>
                  <Pause className="w-4 h-4 mr-2" /> Pause
                </Button>
              )}
              {isPaused && (
                <Button variant="outline" className="flex-1" onClick={() => onResume?.(stream)} disabled={isActionPending}>
                  <Play className="w-4 h-4 mr-2" /> Resume
                </Button>
              )}
              <Button variant="outline" className="flex-1" onClick={() => onEdit?.(stream)} disabled={isActionPending}>
                <Edit2 className="w-4 h-4 mr-2" /> Edit
              </Button>
              <Button variant="destructive" className="flex-1" onClick={() => onCancel?.(stream)} disabled={isActionPending}>
                <Trash2 className="w-4 h-4 mr-2" /> Cancel
              </Button>
            </div>
          )}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onViewDetails(stream.id)}
          >
            View Full Details
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function StreamsPage() {
  const navigate = useNavigate();
  const { getAccessToken } = usePrivy();
  const { recipient, batchRecipients } = Route.useSearch();
  const batchAddresses = batchRecipients?.split(",").filter((a) => a.startsWith("0x")) ?? [];
  const [wizardOpen, setWizardOpen] = useState(!!recipient);
  const [batchOpen, setBatchOpen] = useState(batchAddresses.length > 0);
  const [selectedStream, setSelectedStream] = useState<LocalStream | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LocalStream | null>(null);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const { streams } = useLocalStreams();
  const nowSecs = useNow();

  // Fetch sender's claim pages to build streamId→claimLink map
  const { data: claimsData } = useQuery({
    queryKey: ["senderClaims"],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) return [];
      const res = await fetch(`${config.API_URL}/claims`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const { claims } = await res.json();
      return claims as Array<{ id: string; stream_id: string }>;
    },
    staleTime: 30_000,
  });

  const claimMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of claimsData ?? []) {
      map.set(c.stream_id, `${window.location.origin}/claim/${c.id}`);
    }
    return map;
  }, [claimsData]);


  // Stream action mutations
  const pauseStream = usePauseStream();
  const resumeStream = useResumeStream();
  const cancelStream = useCancelStream();
  const editStream = useEditStream();

  const handleStreamClick = (stream: LocalStream) => {
    setSelectedStream(stream);
    setDrawerOpen(true);
  };

  return (
    <div className="w-full max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight text-foreground mb-3">
              Payments
            </h1>
            <p className="text-muted-foreground text-lg">
              Manage your payments
            </p>
          </div>
          <div className="flex items-center gap-3">
            <CSVBatchDialog />
            <button
              onClick={() => setWizardOpen(true)}
              className="px-8 py-4 text-lg rounded-full bg-gradient-to-r from-[#0B1221] to-[#0f172a] border border-amber-500/30 text-white font-medium transition-all flex items-center gap-2 hover:border-amber-400/60 shadow-[0_0_25px_-8px_rgba(251,191,36,0.3)] hover:shadow-[0_0_35px_-5px_rgba(251,191,36,0.5)]"
            >
              <Plus className="w-4 h-4" />
              <span>New Payment</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stream Collections */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {streams.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            No payments yet. Send your first payment to get started.
          </div>
        ) : (
          streams.map((stream) => {
            const duration = stream.endTimestamp - stream.startTimestamp;
            const isPaused = stream.status === "PAUSED";
            const isTerminal = stream.status === "CANCELLED";
            const isActive = stream.endTimestamp > nowSecs && !isPaused && !isTerminal;

            // Freeze progress when paused
            let progress: number;
            let streamed: number;
            let monthlyRate: number;
            if (isPaused && stream.pausedRemainingDuration !== undefined) {
              const elapsedAtPause = duration - stream.pausedRemainingDuration;
              progress = duration > 0 ? Math.min(100, (elapsedAtPause / duration) * 100) : 0;
              streamed = parseFloat(stream.totalAmount) - parseFloat(stream.pausedRemainingAmount ?? "0");
              monthlyRate = 0;
            } else {
              const elapsed = Math.max(0, nowSecs - stream.startTimestamp);
              progress = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
              streamed = parseFloat(stream.totalAmount) * (progress / 100);
              monthlyRate = parseFloat(stream.totalAmount) / Math.max(1, duration / (86400 * 30));
            }

            return (
              <Card
                key={stream.id}
                onClick={() => handleStreamClick(stream)}
                className="group relative p-6 border border-border hover:border-primary/30 transition-all cursor-pointer"
              >
                {/* Header */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isActive
                            ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                            : isPaused
                              ? "bg-amber-400"
                              : "bg-muted-foreground/40"
                        }`}
                      />
                      <div>
                        <h3 className="text-sm font-medium text-foreground tracking-tight">
                          {stream.tokenSymbol} Stream
                        </h3>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {stream.recipientAddress.slice(0, 6)}...{stream.recipientAddress.slice(-4)}
                          {isPaused && " · paused"}
                          {isTerminal && " · cancelled"}
                        </span>
                      </div>
                    </div>

                    {stream.isPrivate && (
                      <div
                        title="private stream — sent via stealth wallet"
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20"
                      >
                        <Shield className="w-2.5 h-2.5 text-amber-400 fill-amber-400/20" />
                        <span className="text-[9px] text-amber-400 uppercase tracking-wider font-medium">
                          private
                        </span>
                      </div>
                    )}
                  </div>
                  {stream.isPrivate && stream.walletAddress && (
                    <div className="mt-1 text-[10px] text-muted-foreground/60 font-mono ml-3.5">
                      wallet: {stream.walletAddress.slice(0, 6)}...{stream.walletAddress.slice(-4)}
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Delivered</div>
                    <div className="text-lg font-light font-mono">
                      {streamed.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Rate</div>
                    <div className="text-lg font-light font-mono">
                      {isPaused ? (
                        <span className="text-amber-400/70 text-sm">Paused</span>
                      ) : (
                        <>
                          {monthlyRate.toFixed(2)}
                          <span className="text-xs text-muted-foreground ml-1">/mo</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress + Actions row */}
                <div>
                  <div className="h-0.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-foreground/50 relative"
                      style={{ width: `${progress}%` }}
                    >
                      {isActive && (
                        <div
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                          style={{ animation: "flow 2s infinite" }}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">{progress.toFixed(0)}%</span>
                    {!isTerminal && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button
                          className="p-1 rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted/80 transition-colors"
                          title="Edit"
                          onClick={(e) => { e.stopPropagation(); setEditTarget(stream); setEditDrawerOpen(true); }}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {isActive && (
                          <button
                            className="p-1 rounded-md text-muted-foreground/70 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                            title="Pause"
                            onClick={(e) => { e.stopPropagation(); pauseStream.mutate({ stream }); }}
                          >
                            <Pause className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isPaused && (
                          <button
                            className="p-1 rounded-md text-muted-foreground/70 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                            title="Resume"
                            onClick={(e) => { e.stopPropagation(); resumeStream.mutate({ stream }); }}
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          className="p-1 rounded-md text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Cancel"
                          onClick={(e) => { e.stopPropagation(); cancelStream.mutate({ stream }); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Wizard */}
      {wizardOpen && (
        <StreamWizard
          onClose={() => {
            setWizardOpen(false);
            if (recipient) navigate({ to: "/streams", search: {} });
          }}
          initialRecipient={recipient}
        />
      )}

      {/* Batch dialog from circle "Stream to All" */}
      {batchAddresses.length > 0 && (
        <CSVBatchDialog
          initialAddresses={batchAddresses}
          externalOpen={batchOpen}
          onExternalOpenChange={(open) => {
            setBatchOpen(open);
            if (!open) navigate({ to: "/streams", search: {} });
          }}
        />
      )}

      {/* Stream Detail Drawer */}
      <StreamDetailDrawer
        stream={selectedStream}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onViewDetails={(id) => {
          setDrawerOpen(false);
          navigate({ to: "/streams/$streamId", params: { streamId: id } });
        }}
        onPause={(s) => pauseStream.mutate({ stream: s })}
        onResume={(s) => resumeStream.mutate({ stream: s })}
        onEdit={(s) => { setDrawerOpen(false); setEditTarget(s); setEditDrawerOpen(true); }}
        onCancel={(s) => cancelStream.mutate({ stream: s })}
        isActionPending={pauseStream.isPending || resumeStream.isPending || cancelStream.isPending}
        claimLink={selectedStream?.txHash ? claimMap.get(selectedStream.txHash) : undefined}
      />

      {/* Edit Drawer */}
      <StreamEditDrawer
        stream={editTarget}
        open={editDrawerOpen}
        onOpenChange={setEditDrawerOpen}
        onSubmit={({ newTotalAmount, newDurationSeconds }) => {
          if (!editTarget) return;
          editStream.mutate(
            { stream: editTarget, newTotalAmount, newDurationSeconds, newTokenDecimals: 18 },
            { onSuccess: () => setEditDrawerOpen(false) },
          );
        }}
        isPending={editStream.isPending}
      />

      <style>{`
        @keyframes breathe {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes flow {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
