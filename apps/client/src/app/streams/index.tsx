import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Check, Loader2, StopCircle, Play, Copy, XCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { Card } from "@/components/card";
import { Badge } from "@/components/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/select";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/drawer";
import { Separator } from "@/components/separator";
import { CSVBatchDialog } from "@/components/csv-batch-dialog";
import { useSendStream } from "@/hooks";

export const Route = createFileRoute("/streams/")({
  component: StreamsPage,
});

// BSC well-known tokens
const BSC_TOKENS = [
  { symbol: "USDT", address: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd", decimals: 18 },
  { symbol: "USDC", address: "0x64544969ed7EBf5f083679233325356EbE738930", decimals: 18 },
  { symbol: "BUSD", address: "0xaB1a4d4f1D656d2450692D237fdD6C7f9146e814", decimals: 18 },
  { symbol: "WBNB", address: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd", decimals: 18 },
];

// Wizard steps (chain & deploy are automatic — backend auto-deploys per-account)
const WIZARD_STEPS = [
  { id: "details", title: "payment details", description: "who and how much" },
  { id: "claim", title: "personalize", description: "add a message" },
];

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isValidAddress = (addr: string) =>
  /^0x[a-fA-F0-9]{40}$/.test(addr);

function formatDateForInput(date: Date) {
  return date.toISOString().split("T")[0];
}

function StreamWizard({ onClose }: { onClose: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [wizardState, setWizardState] = useState<"form" | "processing" | "success" | "error">("form");
  const [successStreamId, setSuccessStreamId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [copiedStreamId, setCopiedStreamId] = useState(false);
  const [formData, setFormData] = useState({
    streamName: "",
    tokenAddress: BSC_TOKENS[0].address,
    recipient: "",
    amount: "",
    startDate: formatDateForInput(new Date()),
    endDate: formatDateForInput(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)),
    claimPageTitle: "",
    claimPageSubtitle: "",
  });

  const sendStream = useSendStream();
  const yieldEligibility: undefined = undefined;

  const handleNext = async () => {
    // Validation for details step
    if (currentStep === 0) {
      if (!formData.streamName) {
        toast.error("please enter a stream name");
        return;
      }
      if (!formData.tokenAddress) {
        toast.error("please select a token");
        return;
      }
      if (!formData.recipient) {
        toast.error("please enter a recipient address or email");
        return;
      }
      if (!isValidAddress(formData.recipient) && !isValidEmail(formData.recipient)) {
        toast.error("please enter a valid 0x address or email");
        return;
      }
      if (!formData.amount || parseFloat(formData.amount) <= 0) {
        toast.error("please enter a valid amount");
        return;
      }
      if (!formData.startDate || !formData.endDate) {
        toast.error("please set start and end dates");
        return;
      }
      if (new Date(formData.endDate) <= new Date(formData.startDate)) {
        toast.error("end date must be after start date");
        return;
      }
    }

    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Submit - create stream on-chain via AddressDriver
      setWizardState("processing");

      const startTimestamp = new Date(formData.startDate).getTime() / 1000;
      const endTimestamp = new Date(formData.endDate).getTime() / 1000;
      const durationSeconds = Math.floor(endTimestamp - startTimestamp);
      const selectedToken = BSC_TOKENS.find(t => t.address === formData.tokenAddress);

      sendStream.mutateAsync({
        tokenAddress: formData.tokenAddress as `0x${string}`,
        recipientAddress: formData.recipient as `0x${string}`,
        totalAmount: formData.amount,
        tokenDecimals: selectedToken?.decimals ?? 18,
        durationSeconds,
      }).then((result) => {
        setSuccessStreamId(result.txHash);
        setWizardState("success");
      }).catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "failed to create stream");
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
    toast.success("stream ID copied");
    setTimeout(() => setCopiedStreamId(false), 2000);
  };

  const selectedToken = BSC_TOKENS.find((t) => t.address === formData.tokenAddress);

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <Card className="max-w-3xl w-full p-8" onClick={(e) => e.stopPropagation()}>
        {wizardState === "processing" && (
          <div className="flex flex-col items-center justify-center min-h-[350px] gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <h2 className="text-xl font-serif font-light lowercase">creating your payment...</h2>
            <p className="text-sm text-muted-foreground lowercase">submitting to the blockchain</p>
          </div>
        )}

        {wizardState === "success" && (
          <div className="flex flex-col items-center justify-center min-h-[350px] gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-serif font-light lowercase">payment sent!</h2>
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
            <Button onClick={onClose} className="mt-4 lowercase">
              done
            </Button>
          </div>
        )}

        {wizardState === "error" && (
          <div className="flex flex-col items-center justify-center min-h-[350px] gap-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-serif font-light lowercase">something went wrong</h2>
            <p className="text-sm text-muted-foreground text-center max-w-md">{errorMessage}</p>
            <div className="flex gap-3 mt-4">
              <Button
                variant="outline"
                onClick={onClose}
                className="lowercase"
              >
                cancel
              </Button>
              <Button
                onClick={() => {
                  setWizardState("form");
                  setErrorMessage("");
                }}
                className="lowercase"
              >
                try again
              </Button>
            </div>
          </div>
        )}

        {wizardState === "form" && (
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-serif font-light mb-2 lowercase">set up a new payment</h2>
              <p className="text-sm text-muted-foreground">
                step {currentStep + 1} of {WIZARD_STEPS.length}
              </p>
            </div>

            {/* Progress Steps */}
            <div className="mb-8">
              <div className="flex items-center justify-between">
                {WIZARD_STEPS.map((step, index) => (
                  <div key={step.id} className="flex items-center flex-1">
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
                        <div className="text-xs font-medium lowercase">{step.title}</div>
                        <div className="text-xs text-muted-foreground lowercase">{step.description}</div>
                      </div>
                    </div>
                    {index < WIZARD_STEPS.length - 1 && (
                      <div
                        className={`h-0.5 flex-1 mx-2 transition-colors ${
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
                  <h3 className="text-lg font-medium lowercase">payment details</h3>
                  <div className="space-y-5">
                    {/* Stream Name */}
                    <div>
                      <Label className="lowercase mb-2">payment name</Label>
                      <Input
                        placeholder="e.g., Monthly allowance for Alex"
                        value={formData.streamName}
                        onChange={(e) => setFormData({ ...formData, streamName: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground mt-1 lowercase">
                        a name for this payment
                      </p>
                    </div>

                    {/* Token Selection */}
                    <div>
                      <Label className="lowercase mb-2">token</Label>
                      <Select
                        value={formData.tokenAddress}
                        onValueChange={(value) => setFormData({ ...formData, tokenAddress: value })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="select a token" />
                        </SelectTrigger>
                        <SelectContent>
                          {BSC_TOKENS.map((token) => {
                            const eligibility = yieldEligibility?.tokens.find(t => t.address.toLowerCase() === token.address.toLowerCase());
                            return (
                              <SelectItem key={token.address} value={token.address}>
                                <span className="lowercase">{token.symbol}</span>
                                <span className="text-xs text-muted-foreground ml-2 font-mono">
                                  {token.address.slice(0, 6)}...{token.address.slice(-4)}
                                </span>
                                {eligibility?.yieldAvailable && (
                                  <Badge variant="secondary" className="ml-2 text-[10px] py-0 px-1.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                    yield eligible
                                  </Badge>
                                )}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Recipient */}
                    <div>
                      <Label className="lowercase mb-2">recipient</Label>
                      <Input
                        placeholder="0x... address or email@example.com"
                        value={formData.recipient}
                        onChange={(e) => setFormData({ ...formData, recipient: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground mt-1 lowercase">
                        enter an address or email
                      </p>
                    </div>

                    {/* Amount */}
                    <div>
                      <Label className="lowercase mb-2">
                        amount
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
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="lowercase mb-2">start date</Label>
                        <Input
                          type="date"
                          value={formData.startDate}
                          onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="lowercase mb-2">end date</Label>
                        <Input
                          type="date"
                          value={formData.endDate}
                          onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 1 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium lowercase">personalize</h3>
                  <p className="text-sm text-muted-foreground lowercase">
                    add a message for the person you're sending to
                  </p>
                  <div className="space-y-4">
                    <div>
                      <Label className="lowercase mb-2">page title</Label>
                      <Input
                        placeholder="e.g., Happy Birthday!"
                        value={formData.claimPageTitle}
                        onChange={(e) =>
                          setFormData({ ...formData, claimPageTitle: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label className="lowercase mb-2">subtitle (optional)</Label>
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
                    <h4 className="text-sm font-medium lowercase">payment summary</h4>
                    <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground lowercase">token</span>
                        <span className="font-mono">{selectedToken?.symbol || "---"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground lowercase">amount</span>
                        <span className="font-mono">{formData.amount || "---"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground lowercase">recipient</span>
                        <span className="font-mono text-xs truncate max-w-[200px]">
                          {formData.recipient || "---"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground lowercase">duration</span>
                        <span className="lowercase">
                          {formData.startDate} to {formData.endDate}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={onClose} className="lowercase">
                cancel
              </Button>
              <div className="flex gap-2">
                {currentStep > 0 && (
                  <Button variant="outline" onClick={handleBack} className="lowercase">
                    back
                  </Button>
                )}
                <Button
                  onClick={handleNext}
                  className="lowercase"
                >
                  {currentStep === WIZARD_STEPS.length - 1 ? "send payment" : "next"}
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
  onOpenChange
}: {
  stream: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const streamId = stream?.id ?? 0;
  void streamId;
  const pauseStream: any = { mutate: () => {} };
  const resumeStream: any = { mutate: () => {} };
  const cancelStream: any = { mutate: () => {} };

  if (!stream) return null;

  const progress = ((stream.totalDistributed || 0) / (stream.totalAmount || 1)) * 100;

  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast.success("address copied to clipboard");
  };

  const handleCopyClaimPage = () => {
    if (stream?.claimPageUrl) {
      navigator.clipboard.writeText(stream.claimPageUrl);
      toast.success("claim page url copied to clipboard");
    }
  };

  const handlePauseResume = () => {
    if (stream.status === "ACTIVE") {
      pauseStream.mutate();
    } else {
      resumeStream.mutate();
    }
  };

  const handleStop = () => {
    cancelStream.mutate();
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="lowercase">{stream.title}</DrawerTitle>
          <DrawerDescription className="lowercase">
            payment details
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-4 overflow-y-auto max-h-[70vh]">
          <div className="max-w-2xl mx-auto">
            {/* Status and Progress */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    stream.status === "ACTIVE"
                      ? "bg-white/70 shadow-[0_0_8px_rgba(255,255,255,0.4)]"
                      : "bg-muted-foreground/40"
                  }`}
                  style={
                    stream.status === "ACTIVE"
                      ? { animation: "breathe 4s ease-in-out infinite" }
                      : undefined
                  }
                />
                <span className="text-sm font-light lowercase">{stream.status}</span>
              </div>

              <div className="h-0.5 bg-muted rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-foreground/50 relative"
                  style={{ width: `${progress}%` }}
                >
                  {stream.status === "ACTIVE" && (
                    <div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                      style={{ animation: "flow 2s infinite" }}
                    />
                  )}
                </div>
              </div>
              <div className="text-xs text-muted-foreground lowercase">
                {stream.totalDistributed.toLocaleString()} / {stream.totalAmount.toLocaleString()} ({progress.toFixed(0)}%)
              </div>
            </div>

            {/* Stream Details */}
            <div className="space-y-3 mb-6">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground lowercase mb-1">sending</div>
                  <div className="text-base font-light font-mono">
                    {((stream.amountPerPeriod / stream.periodDuration) * 86400 * 30).toFixed(2)}
                    <span className="text-xs text-muted-foreground ml-1">/mo</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground lowercase mb-1">asset</div>
                  <div className="text-base font-light font-mono">{stream.assetId}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground lowercase mb-1">start date</div>
                  <div className="text-base font-light lowercase">
                    {new Date(stream.startDate).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground lowercase mb-1">end date</div>
                  <div className="text-base font-light lowercase">
                    {new Date(stream.endDate).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>

            <Separator className="my-4" />

            {/* Recipient */}
            <div>
              <div className="text-sm font-light lowercase mb-3">recipient</div>
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
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 lowercase"
              onClick={handlePauseResume}
            >
              {stream.status === "ACTIVE" ? (
                <>
                  <StopCircle className="w-4 h-4 mr-2" />
                  pause payment
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  resume payment
                </>
              )}
            </Button>
            <Button
              variant="outline"
              className="flex-1 lowercase text-destructive hover:text-destructive"
              onClick={handleStop}
            >
              <StopCircle className="w-4 h-4 mr-2" />
              stop payment
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function StreamsPage() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedStream, setSelectedStream] = useState<any | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const streams: any[] = [];
  const isLoading = false;

  const handleStreamClick = (stream: any) => {
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
            <p className="text-muted-foreground text-lg lowercase">
              manage your payments
            </p>
          </div>
          <div className="flex items-center gap-3">
            <CSVBatchDialog />
            <button
              onClick={() => setWizardOpen(true)}
              className="px-8 py-4 text-lg rounded-full bg-gradient-to-r from-[#0B1221] to-[#0f172a] border border-amber-500/30 text-white font-medium transition-all flex items-center gap-2 hover:border-amber-400/60 shadow-[0_0_25px_-8px_rgba(251,191,36,0.3)] hover:shadow-[0_0_35px_-5px_rgba(251,191,36,0.5)]"
            >
              <Plus className="w-4 h-4" />
              <span className="lowercase">new payment</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stream Collections */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full text-center py-12 text-muted-foreground lowercase">
            loading payments...
          </div>
        ) : streams.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground lowercase">
            no payments yet. send your first payment to get started.
          </div>
        ) : (
          streams.map((collection) => {
            const progress = ((collection.totalDistributed || 0) / (collection.totalAmount || 1)) * 100;
            const streamRate = collection.amountPerPeriod / collection.periodDuration;
            return (
              <Card
                key={collection.id}
                onClick={() => handleStreamClick(collection)}
                className="group relative p-6 border border-border hover:border-primary/30 transition-all cursor-pointer"
              >
                {/* Collection Header */}
                <div className="mb-6">
                  <h3 className="text-lg font-light text-foreground mb-3 lowercase">
                    {collection.title}
                  </h3>
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        collection.status === "ACTIVE"
                          ? "bg-white/70 shadow-[0_0_8px_rgba(255,255,255,0.4)]"
                          : "bg-muted-foreground/40"
                      }`}
                      style={
                        collection.status === "ACTIVE"
                          ? {
                              animation: "breathe 4s ease-in-out infinite",
                            }
                          : undefined
                      }
                    />
                    <span className="text-xs text-muted-foreground lowercase">
                      {collection.recipientAddress.slice(0, 6)}...{collection.recipientAddress.slice(-4)}
                    </span>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <div className="text-xs text-muted-foreground lowercase mb-1">delivered</div>
                    <div className="text-lg font-light font-mono">
                      {collection.totalDistributed.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground lowercase mb-1">rate</div>
                    <div className="text-lg font-light font-mono">
                      {(streamRate * 86400 * 30).toFixed(2)}
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
                      {collection.status === "ACTIVE" && (
                        <div
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                          style={{
                            animation: "flow 2s infinite",
                          }}
                        />
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2 lowercase">{progress.toFixed(0)}%</div>
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
