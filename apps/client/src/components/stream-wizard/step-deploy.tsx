import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/alert";

interface StepDeployProps {
  chain: "tempo";
  isDeploying: boolean;
  onDeploy: () => void;
}

export function StepDeploy({ chain, isDeploying, onDeploy }: StepDeployProps) {
  const contracts = ["Drips Protocol", "AddressDriver", "YieldManager"];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-2">Deploy Contracts</h3>
        <p className="text-sm text-muted-foreground">
          Deploy the required contracts to Tempo
        </p>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          This is a one-time deployment. Once deployed, you can create unlimited streams on this chain.
        </AlertDescription>
      </Alert>

      <Card className="p-4">
        <h4 className="font-medium mb-4">Contracts to Deploy</h4>
        <div className="space-y-3">
          {contracts.map((contract, index) => (
            <div key={index} className="flex items-center gap-3">
              {isDeploying ? (
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-muted" />
              )}
              <span className="text-sm">{contract}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-3">
        <Button
          onClick={onDeploy}
          disabled={isDeploying}
          className="w-full"
          size="lg"
        >
          {isDeploying ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Deploying Contracts...
            </>
          ) : (
            "Deploy Contracts"
          )}
        </Button>

        {isDeploying && (
          <p className="text-xs text-center text-muted-foreground">
            This may take a few moments. Please don't close this window.
          </p>
        )}
      </div>
    </div>
  );
}
