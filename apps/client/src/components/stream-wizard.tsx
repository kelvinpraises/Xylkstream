import { defineStepper } from "@stepperize/react";
import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card } from "@/components/card";
import { Button } from "@/components/button";
import { Separator } from "@/components/separator";
import { useContractDeployment } from "@/hooks/use-contract-deployment";
import { useClaimPages } from "@/hooks/use-claim-pages";
import { StepBlockchain } from "./stream-wizard/step-blockchain";
import { StepDeploy } from "./stream-wizard/step-deploy";
import { StepRecipient } from "./stream-wizard/step-recipient";
import { StepAmount } from "./stream-wizard/step-amount";
import { StepSchedule } from "./stream-wizard/step-schedule";
import { StepReview } from "./stream-wizard/step-review";

const { useStepper, steps } = defineStepper(
  { id: "blockchain", title: "Blockchain", description: "Select network" },
  { id: "deploy", title: "Deploy", description: "Deploy contracts" },
  { id: "recipient", title: "Recipient", description: "Who receives" },
  { id: "amount", title: "Amount", description: "How much" },
  { id: "schedule", title: "Schedule", description: "When" },
  { id: "review", title: "Review", description: "Confirm" }
);

interface StreamWizardProps {
  claimPageId: string;
  onComplete?: () => void;
}

export function StreamWizard({ claimPageId, onComplete }: StreamWizardProps) {
  const stepper = useStepper();
  const navigate = useNavigate();
  const { isDeployed, isDeploying, deployToSepolia, deployToSui } = useContractDeployment();
  const { createStream } = useClaimPages();

  // Form state
  const [selectedChain, setSelectedChain] = useState<"sepolia" | "sui" | null>(null);
  const [recipient, setRecipient] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState("USDC");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [cliffDate, setCliffDate] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Auto-skip deploy step if already deployed
  useEffect(() => {
    if (stepper.current.id === "deploy" && selectedChain && isDeployed(selectedChain)) {
      stepper.next();
    }
  }, [stepper.current.id, selectedChain, isDeployed]);

  const handleChainSelect = (chain: "sepolia" | "sui") => {
    setSelectedChain(chain);
    // Reset asset based on chain
    if (chain === "sepolia") {
      setAsset("USDC");
    } else {
      setAsset("SUI");
    }
  };

  const handleDeploy = async () => {
    if (!selectedChain) return;

    const result = selectedChain === "sepolia" 
      ? await deployToSepolia()
      : await deployToSui();

    if (result) {
      stepper.next();
    }
  };

  const handleCreateStream = async () => {
    if (!selectedChain) return;

    setIsCreating(true);
    try {
      // Simulate transaction
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const stream = createStream({
        claimPageId,
        chain: selectedChain,
        recipient,
        recipientName: recipientName || undefined,
        amount,
        asset,
        startDate,
        endDate,
        cliffDate: cliffDate || undefined,
        status: "ACTIVE",
        txHash: "0x" + Math.random().toString(16).substr(2, 64),
      });

      toast.success("Stream created successfully!");
      
      if (onComplete) {
        onComplete();
      } else {
        navigate({ to: "/studio" });
      }
    } catch (error) {
      console.error("Failed to create stream:", error);
      toast.error("Failed to create stream");
    } finally {
      setIsCreating(false);
    }
  };

  const canProceed = () => {
    switch (stepper.current.id) {
      case "blockchain":
        return selectedChain !== null;
      case "deploy":
        return selectedChain && isDeployed(selectedChain);
      case "recipient":
        return recipient.length > 0;
      case "amount":
        return amount && parseFloat(amount) > 0 && asset;
      case "schedule":
        return startDate && endDate && new Date(endDate) > new Date(startDate);
      case "review":
        return true;
      default:
        return false;
    }
  };

  return (
    <div className="flex items-start justify-center w-full min-h-[600px]">
      <Card className="w-full max-w-4xl p-6 flex flex-col md:flex-row gap-8">
        {/* Left: Stepper */}
        <div className="md:w-1/3">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-medium">Create Stream</h2>
            <span className="text-sm text-muted-foreground">
              {stepper.current.index + 1}/{steps.length}
            </span>
          </div>

          <nav aria-label="Stream Creation Steps">
            <ol className="flex flex-col gap-2">
              {stepper.all.map((step, index, array) => {
                // Skip deploy step if already deployed
                if (step.id === "deploy" && selectedChain && isDeployed(selectedChain)) {
                  return null;
                }

                return (
                  <li key={step.id}>
                    <div className="flex items-center gap-4">
                      <Button
                        type="button"
                        variant={index <= stepper.current.index ? "default" : "secondary"}
                        className="flex size-10 items-center justify-center rounded-full shrink-0"
                        disabled
                      >
                        {index + 1}
                      </Button>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{step.title}</span>
                        <span className="text-xs text-muted-foreground">{step.description}</span>
                      </div>
                    </div>
                    {index < array.length - 1 && (
                      <div className="ml-5 mt-2 mb-2">
                        <Separator
                          orientation="vertical"
                          className={`h-8 ${
                            index < stepper.current.index ? "bg-primary" : "bg-muted"
                          }`}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>

        {/* Right: Content */}
        <div className="md:w-2/3 flex flex-col">
          <div className="flex-1 mb-6">
            {stepper.switch({
              blockchain: () => (
                <StepBlockchain
                  selectedChain={selectedChain}
                  onSelectChain={handleChainSelect}
                  isDeployed={isDeployed}
                />
              ),
              deploy: () => (
                <StepDeploy
                  chain={selectedChain!}
                  isDeploying={isDeploying}
                  onDeploy={handleDeploy}
                />
              ),
              recipient: () => (
                <StepRecipient
                  recipient={recipient}
                  recipientName={recipientName}
                  onRecipientChange={setRecipient}
                  onRecipientNameChange={setRecipientName}
                  chain={selectedChain!}
                />
              ),
              amount: () => (
                <StepAmount
                  amount={amount}
                  asset={asset}
                  onAmountChange={setAmount}
                  onAssetChange={setAsset}
                  chain={selectedChain!}
                />
              ),
              schedule: () => (
                <StepSchedule
                  startDate={startDate}
                  endDate={endDate}
                  cliffDate={cliffDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                  onCliffDateChange={setCliffDate}
                  amount={amount}
                  asset={asset}
                />
              ),
              review: () => (
                <StepReview
                  chain={selectedChain!}
                  recipient={recipient}
                  recipientName={recipientName}
                  amount={amount}
                  asset={asset}
                  startDate={startDate}
                  endDate={endDate}
                  cliffDate={cliffDate}
                  isCreating={isCreating}
                  onCreate={handleCreateStream}
                />
              ),
            })}
          </div>

          {/* Navigation Buttons */}
          {stepper.current.id !== "review" && stepper.current.id !== "deploy" && (
            <div className="flex gap-3">
              {!stepper.isFirst && (
                <Button variant="outline" onClick={stepper.prev} className="flex-1">
                  Back
                </Button>
              )}
              <Button
                onClick={stepper.next}
                disabled={!canProceed()}
                className="flex-1"
              >
                {stepper.isLast ? "Review" : "Continue"}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
