import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useNow } from "@/hooks/use-now";
import { Plus, Check, Loader2, Copy, XCircle, CheckCircle2, Shield, Globe } from "lucide-react";
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

import { useCreateStream } from "@/hooks/use-stream-create";
import { useTokenDecimals } from "@/hooks/use-token-decimals";
import { useLocalStreams } from "@/store/stream-store";
import type { LocalStream } from "@/store/stream-store";
import { useChain } from "@/providers/chain-provider";
import { getSendableTokens } from "@/config/chains";

export const Route = createFileRoute("/streams/")({
  component: StreamsPage,
});

// TOKENS is resolved inside the component via useChain

// Wizard steps (chain & deploy are automatic — backend auto-deploys per-account)
const WIZARD_STEPS = [
  { id: "details", title: "Payment Details", description: "Who and How Much" },
  { id: "claim", title: "Personalize", description: "Add a Message" },
];

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

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

function StreamWizard({ onClose }: { onClose: () => void }) {
  const { chainConfig } = useChain();
  const TOKENS = getSendableTokens(chainConfig.contracts);
  const [currentStep, setCurrentStep] = useState(0);
  const [wizardState, setWizardState] = useState<"form" | "processing" | "success" | "error">("form");
  const [successStreamId, setSuccessStreamId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [copiedStreamId, setCopiedStreamId] = useState(false);
  const [formData, setFormData] = useState(() => {
    return {
    streamName: "",
    tokenAddress: TOKENS[0].address,
    recipient: "",
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
        toast.error("Please enter a recipient address or email");
        return;
      }
      if (!isValidAddress(formData.recipient) && !isValidEmail(formData.recipient)) {
        toast.error("Please enter a valid 0x address or email");
        return;
      }
      if (!formData.amount || parseFloat(formData.amount) <= 0) {
        toast.error("Please enter a valid amount");
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
      }).then((result) => {
        setSuccessStreamId(result.txHash);
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

  const selectedToken = TOKENS.find((t) => t.address === formData.tokenAddress);

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <Card className="max-w-3xl w-full p-8" onClick={(e) => e.stopPropagation()}>
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
            {successStreamId && (
              <div className="flex items-center gap-2 mt-2">
                <code className="text-sm font-mono bg-muted/30 px-3 py-2 rounded-lg text-muted-foreground">
                  stream #{successStreamId}
                </code>
                <Button variant="ghost" size="icon" onClick={handleCopyStreamId} className="shrink-0 h-8 w-8">
                  {copiedStreamId ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
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
                        placeholder="0x... address or email@example.com"
                        value={formData.recipient}
                        onChange={(e) => setFormData({ ...formData, recipient: e.target.value })}
                      />
                    </div>

                    {/* Amount */}
                    <div>
                      <Label className="mb-2">
                        Amount
                        {selectedToken && (
                          <span className="text-muted-foreground font-normal ml-1">
                            ({selectedToken.symbol})
                          </span>
                        )}
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
}: {
  stream: LocalStream | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewDetails: (id: string) => void;
}) {
  const nowSecs = useNow();

  if (!stream) return null;

  const duration = stream.endTimestamp - stream.startTimestamp;
  const elapsed = Math.max(0, nowSecs - stream.startTimestamp);
  const progress = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
  const streamed = parseFloat(stream.totalAmount) * (progress / 100);
  const isActive = stream.endTimestamp > nowSecs;
  const monthlyRate = parseFloat(stream.totalAmount) / Math.max(1, duration / (86400 * 30));

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
                <span className="text-sm font-light">{isActive ? "Active" : "Completed"}</span>
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
          </div>
        </div>

        <DrawerFooter>
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
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedStream, setSelectedStream] = useState<LocalStream | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { streams } = useLocalStreams();
  const nowSecs = useNow();

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
            const elapsed = Math.max(0, nowSecs - stream.startTimestamp);
            const progress = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
            const streamed = parseFloat(stream.totalAmount) * (progress / 100);
            const isActive = stream.endTimestamp > nowSecs;
            const monthlyRate = parseFloat(stream.totalAmount) / Math.max(1, duration / (86400 * 30));

            return (
              <Card
                key={stream.id}
                onClick={() => handleStreamClick(stream)}
                className="group relative p-6 border border-border hover:border-primary/30 transition-all cursor-pointer"
              >
                {/* Header */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-light text-foreground">
                      {stream.tokenSymbol} Stream
                    </h3>
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
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        isActive
                          ? "bg-white/70 shadow-[0_0_8px_rgba(255,255,255,0.4)]"
                          : "bg-muted-foreground/40"
                      }`}
                      style={isActive ? { animation: "breathe 4s ease-in-out infinite" } : undefined}
                    />
                    <span className="text-xs text-muted-foreground">
                      {stream.recipientAddress.slice(0, 6)}...{stream.recipientAddress.slice(-4)}
                    </span>
                  </div>
                  {stream.isPrivate && stream.walletAddress && (
                    <div className="mt-2 text-[10px] text-muted-foreground/60 font-mono">
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
                      {monthlyRate.toFixed(2)}
                      <span className="text-xs text-muted-foreground ml-1">/mo</span>
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
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
                  <div className="text-xs text-muted-foreground mt-2">{progress.toFixed(0)}%</div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Wizard */}
      {wizardOpen && <StreamWizard onClose={() => setWizardOpen(false)} />}

      {/* Stream Detail Drawer */}
      <StreamDetailDrawer
        stream={selectedStream}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onViewDetails={(id) => {
          setDrawerOpen(false);
          navigate({ to: "/streams/$streamId", params: { streamId: id } });
        }}
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
