import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Plus, Check, Loader2, StopCircle, Play, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Card } from "@/components/card";
import { useContractDeployment, type ChainId } from "@/hooks/use-contract-deployment";
import { useStreams } from "@/hooks/use-streams";
import { useCreateStreamWizard } from "@/hooks/use-create-stream-wizard";
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

export const Route = createFileRoute("/streams/")({
  component: StreamsPage,
});

// Chain ID mapping
const CHAIN_MAP: Record<ChainId, string> = {
  tempo: "tempo",
};

// Wizard steps
const WIZARD_STEPS = [
  { id: "chain", title: "select chain", description: "choose deployment chain" },
  { id: "deploy", title: "deploy contract", description: "deploy or use existing" },
  { id: "details", title: "stream details", description: "name and configuration" },
  { id: "claim", title: "claim page", description: "setup recipient page" },
];

const CHAINS: { id: ChainId; name: string; type: string }[] = [
  { id: "tempo", name: "tempo", type: "evm-compatible" },
];

function StreamWizard({ onClose }: { onClose: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    chain: "" as ChainId | "",
    contractAddress: "",
    streamName: "",
    claimPageTitle: "",
    claimPageSubtitle: "",
  });
  
  const { isDeployed, isDeploying, deployToTempo, deployedContracts } = useContractDeployment();
  const createStreamMutation = useCreateStreamWizard();
  const [hasDeployment, setHasDeployment] = useState(false);

  // Check deployment status when chain changes
  useEffect(() => {
    if (formData.chain) {
      setHasDeployment(isDeployed(formData.chain));
    }
  }, [formData.chain, isDeployed]);

  const handleNext = async () => {
    // Validation
    if (currentStep === 0 && !formData.chain) {
      toast.error("please select a chain");
      return;
    }
    
    if (currentStep === 1 && !hasDeployment && !formData.contractAddress) {
      toast.error("please deploy a contract or enter an existing address");
      return;
    }

    if (currentStep === 2 && !formData.streamName) {
      toast.error("please enter a stream name");
      return;
    }

    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Submit - create stream via backend
      try {
        await createStreamMutation.mutateAsync({
          chainId: CHAIN_MAP[formData.chain as ChainId],
          name: formData.streamName,
          tokenAddress: "0x0000000000000000000000000000000000000000", // TODO: Add token selection to wizard
          totalAmount: "1000", // TODO: Add amount field to wizard
          recipients: [
            {
              address: "0x0000000000000000000000000000000000000000", // TODO: Add recipient field to wizard
              percentage: 100,
            },
          ],
          vestingSchedule: {
            type: "linear",
            startDate: new Date().toISOString(),
            endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days from now
          },
        });
        
        toast.success("stream created successfully!");
        onClose();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "failed to create stream");
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleDeploy = async () => {
    if (!formData.chain) return;

    await deployToTempo();
    
    // Refresh deployment status
    setHasDeployment(isDeployed(formData.chain));
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="max-w-3xl w-full p-8">
        <div className="mb-8">
          <h2 className="text-2xl font-serif font-light mb-2 lowercase">create new stream</h2>
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
            <div className="space-y-4">
              <h3 className="text-lg font-medium lowercase">select blockchain</h3>
              <div className="grid grid-cols-2 gap-4">
                {CHAINS.map((chain) => (
                  <button
                    key={chain.id}
                    onClick={() => setFormData({ ...formData, chain: chain.id })}
                    className={`p-6 rounded-xl border-2 transition-all text-left ${
                      formData.chain === chain.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="text-lg font-medium lowercase">{chain.name}</div>
                    <div className="text-sm text-muted-foreground mt-1 lowercase">
                      {chain.type}
                    </div>
                    {formData.chain === chain.id && isDeployed(chain.id) && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-primary">
                        <Check className="w-3 h-3" />
                        deployed
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium lowercase">deploy or connect</h3>
              
              {hasDeployment ? (
                <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
                  <div className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <div className="font-medium lowercase mb-1">contract already deployed</div>
                      <div className="text-sm text-muted-foreground lowercase">
                        you have an existing deployment on {formData.chain}
                      </div>
                      {formData.chain && deployedContracts[formData.chain] && (
                        <div className="mt-2 text-xs font-mono text-muted-foreground">
                          {(deployedContracts[formData.chain] as any).addressDriver}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground lowercase">
                    {formData.chain
                      ? `deploy a new contract on ${formData.chain} or connect to existing`
                      : "select a chain first"}
                  </p>
                  <div className="space-y-3">
                    <Button 
                      variant="outline" 
                      className="w-full justify-start h-auto p-4"
                      onClick={handleDeploy}
                      disabled={!formData.chain || isDeploying}
                    >
                      {isDeploying ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      <div className="text-left">
                        <div className="font-medium lowercase">
                          {isDeploying ? "deploying..." : "deploy new contract"}
                        </div>
                        <div className="text-xs text-muted-foreground lowercase">
                          create a fresh deployment on {formData.chain || "selected chain"}
                        </div>
                      </div>
                    </Button>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">or</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium lowercase mb-2 block">
                        existing contract address
                      </label>
                      <Input
                        placeholder="0x..."
                        value={formData.contractAddress}
                        onChange={(e) =>
                          setFormData({ ...formData, contractAddress: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium lowercase">stream details</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium lowercase mb-2 block">
                    stream name
                  </label>
                  <Input
                    placeholder="e.g., q1 2026 team payments"
                    value={formData.streamName}
                    onChange={(e) => setFormData({ ...formData, streamName: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground mt-1 lowercase">
                    a descriptive name for this payment stream collection
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium lowercase">claim page setup</h3>
              <p className="text-sm text-muted-foreground lowercase">
                create a page where recipients can view and claim their streams
              </p>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium lowercase mb-2 block">
                    page title
                  </label>
                  <Input
                    placeholder="e.g., team payments"
                    value={formData.claimPageTitle}
                    onChange={(e) =>
                      setFormData({ ...formData, claimPageTitle: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium lowercase mb-2 block">
                    subtitle (optional)
                  </label>
                  <Input
                    placeholder="e.g., claim your vested tokens"
                    value={formData.claimPageSubtitle}
                    onChange={(e) =>
                      setFormData({ ...formData, claimPageSubtitle: e.target.value })
                    }
                  />
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
              disabled={createStreamMutation.isPending}
            >
              {createStreamMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  creating...
                </>
              ) : currentStep === WIZARD_STEPS.length - 1 ? (
                "create stream"
              ) : (
                "next"
              )}
            </Button>
          </div>
        </div>
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
      toast.success("stream paused");
    } else {
      toast.success("stream resumed");
    }
  };

  const handleStop = () => {
    toast.success("stream stopped");
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="lowercase">{stream.title}</DrawerTitle>
          <DrawerDescription className="lowercase">
            stream configuration and details
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
                  <div className="text-xs text-muted-foreground lowercase mb-1">rate</div>
                  <div className="text-base font-light font-mono">
                    {(stream.amountPerPeriod / stream.periodDuration).toFixed(4)}
                    <span className="text-xs text-muted-foreground ml-1">/s</span>
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
                  pause stream
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  resume stream
                </>
              )}
            </Button>
            <Button
              variant="outline"
              className="flex-1 lowercase text-destructive hover:text-destructive"
              onClick={handleStop}
            >
              <StopCircle className="w-4 h-4 mr-2" />
              stop stream
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
  const { data: streams = [], isLoading } = useStreams();

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
              Streams
            </h1>
            <p className="text-muted-foreground text-lg lowercase">
              manage your payment stream collections
            </p>
          </div>
          <button
            onClick={() => setWizardOpen(true)}
            className="px-8 py-4 text-lg rounded-full bg-gradient-to-r from-[#0B1221] to-[#0f172a] border border-cyan-500/30 text-white font-medium hover:border-cyan-400/60 transition-all shadow-[0_0_25px_-8px_rgba(6,182,212,0.4)] hover:shadow-[0_0_35px_-5px_rgba(6,182,212,0.6)] flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span className="lowercase">new stream</span>
          </button>
        </div>
      </div>

      {/* Stream Collections */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full text-center py-12 text-muted-foreground lowercase">
            loading streams...
          </div>
        ) : streams.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground lowercase">
            no streams yet. create your first stream to get started.
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
                    <div className="text-xs text-muted-foreground lowercase mb-1">distributed</div>
                    <div className="text-lg font-light font-mono">
                      {collection.totalDistributed.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground lowercase mb-1">rate</div>
                    <div className="text-lg font-light font-mono">
                      {streamRate.toFixed(4)}
                      <span className="text-xs text-muted-foreground ml-1">/s</span>
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
