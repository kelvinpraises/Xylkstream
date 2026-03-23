import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { Plus, Boxes, Loader2, ExternalLink, FlaskConical, CheckCircle2, XCircle, Fuel } from "lucide-react";
import { Card } from "@/components/molecules/card";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { Badge } from "@/components/atoms/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/molecules/dialog";
import { toast } from "sonner";
import { useStrategies, useSubmitStrategy, useTestStrategy, type Strategy } from "@/hooks/use-yieldbox";
import { useChain } from "@/providers/chain-provider";

export const Route = createFileRoute("/yieldbox/")({
  component: YieldBoxPage,
});

const statusStyles: Record<Strategy["status"], string> = {
  pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  compiling: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  compiled: "bg-green-500/15 text-green-400 border-green-500/20",
  failed: "bg-red-500/15 text-red-400 border-red-500/20",
};

const testStatusStyles: Record<string, string> = {
  untested: "bg-stone-500/15 text-stone-400 border-stone-500/20",
  testing: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  passed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  failed: "bg-red-500/15 text-red-400 border-red-500/20",
};

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function bytecodeSize(bytecode: string) {
  const bytes = (bytecode.replace("0x", "").length / 2);
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
}

function TestResults({ results }: { results: Record<string, any> }) {
  return (
    <div className="mt-2 space-y-1.5 text-sm text-muted-foreground lowercase">
      {results.deploy && (
        <div className="flex items-center gap-1.5">
          {results.deploy.address ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
          ) : (
            <XCircle className="w-3 h-3 text-red-400 shrink-0" />
          )}
          <span>deploy: {results.deploy.address ? truncateAddress(results.deploy.address) : "failed"}</span>
        </div>
      )}
      {results.calls && results.calls.length > 0 && (
        <div className="space-y-0.5 pl-1">
          {results.calls.map((c: any, i: number) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              {c.success ? (
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="w-2.5 h-2.5 text-red-400 shrink-0" />
              )}
              <span className="font-mono">{c.fn}</span>
              {c.result != null && <span className="text-foreground/50">= {String(c.result)}</span>}
            </div>
          ))}
        </div>
      )}
      {results.totalGas != null && (
        <div className="flex items-center gap-1.5 text-xs text-foreground/50">
          <Fuel className="w-3 h-3 shrink-0" />
          <span>total gas: {Number(results.totalGas).toLocaleString()}</span>
        </div>
      )}
      {results.reason && (
        <div className="text-xs text-red-400">{results.reason}</div>
      )}
    </div>
  );
}

function StrategyCard({ strategy, onTest, isTesting }: { strategy: Strategy; onTest: (id: number) => void; isTesting: boolean }) {
  const { chainConfig } = useChain();
  const [errorExpanded, setErrorExpanded] = useState(false);
  const [resultsExpanded, setResultsExpanded] = useState(false);

  const testStatus = strategy.test_status;
  const testResults = strategy.test_results_json;

  return (
    <Card className="p-5 border border-border hover:border-primary/30 transition-all h-full flex flex-col">
      <div className="flex items-start justify-between mb-3 gap-2">
        <h3 className="text-base font-medium text-foreground lowercase truncate flex-1">
          {strategy.name}
        </h3>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge
            variant="outline"
            className={`lowercase text-xs border ${statusStyles[strategy.status]}`}
          >
            {strategy.status}
          </Badge>
          {testStatus && testStatus !== "untested" && (
            <Badge
              variant="outline"
              className={`lowercase text-xs border ${testStatusStyles[testStatus] || ""}`}
            >
              {testStatus === "testing" ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  testing
                </span>
              ) : (
                testStatus
              )}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-2">
        {strategy.status === "compiled" && strategy.bytecode && (
          <div className="text-sm text-muted-foreground lowercase space-y-1">
            <div>
              <span className="text-foreground/70">bytecode:</span>{" "}
              {bytecodeSize(strategy.bytecode)}
            </div>
            {strategy.abi_json && (
              <div>
                <span className="text-foreground/70">abi functions:</span>{" "}
                {strategy.abi_json.filter((e: any) => e.type === "function").length}
              </div>
            )}
          </div>
        )}

        {strategy.deployment_address && (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground lowercase">deployed:</span>
            <a
              href={`${chainConfig.chain.blockExplorers?.default?.url ?? ''}/address/${strategy.deployment_address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {truncateAddress(strategy.deployment_address)}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {testResults && (
          <div>
            <button
              className="text-xs text-muted-foreground hover:text-foreground lowercase transition-colors"
              onClick={() => setResultsExpanded((v) => !v)}
            >
              {resultsExpanded ? "hide test results" : "show test results"}
            </button>
            {resultsExpanded && <TestResults results={testResults} />}
          </div>
        )}

        {strategy.status === "failed" && strategy.errors && (
          <div className="text-sm">
            <button
              className="text-red-400 hover:text-red-300 lowercase text-left transition-colors"
              onClick={() => setErrorExpanded((v) => !v)}
            >
              {errorExpanded
                ? strategy.errors
                : strategy.errors.slice(0, 80) + (strategy.errors.length > 80 ? "…" : "")}
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-muted-foreground/60 lowercase">
          created {new Date(strategy.created_at).toLocaleDateString()}
        </div>
        {strategy.status === "compiled" && testStatus !== "testing" && (
          <Button
            variant="outline"
            size="sm"
            className="lowercase text-xs h-7 gap-1.5"
            onClick={() => onTest(strategy.id)}
            disabled={isTesting}
          >
            {isTesting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <FlaskConical className="w-3 h-3" />
            )}
            {testStatus === "passed" || testStatus === "failed" ? "retest" : "run tests"}
          </Button>
        )}
      </div>
    </Card>
  );
}

function YieldBoxPage() {
  const { data: strategies, isLoading, error } = useStrategies();
  const submitStrategy = useSubmitStrategy();
  const testStrategy = useTestStrategy();

  const [submitOpen, setSubmitOpen] = useState(false);
  const [name, setName] = useState("");
  const [sourceCode, setSourceCode] = useState("");
  const [testingId, setTestingId] = useState<number | null>(null);

  const handleTest = useCallback(async (strategyId: number) => {
    setTestingId(strategyId);
    try {
      await testStrategy.mutateAsync({ strategyId });
      toast.success("test completed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "test failed");
    } finally {
      setTestingId(null);
    }
  }, [testStrategy]);

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      toast.error("please enter a strategy name");
      return;
    }
    if (!sourceCode.trim()) {
      toast.error("please enter source code");
      return;
    }

    try {
      await submitStrategy.mutateAsync({ name: name.trim(), sourceCode: sourceCode.trim() });
      toast.success("strategy submitted for compilation");
      setName("");
      setSourceCode("");
      setSubmitOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed to submit strategy");
    }
  }, [name, sourceCode, submitStrategy]);

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight text-foreground mb-3">
              YieldBox
            </h1>
            <p className="text-muted-foreground text-lg lowercase">
              agent-compiled yield strategies
            </p>
          </div>

          <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
            <DialogTrigger asChild>
              <button className="px-8 py-4 text-lg rounded-full bg-gradient-to-r from-[#0B1221] to-[#0f172a] border border-amber-500/30 text-white font-medium hover:border-amber-400/60 transition-all shadow-[0_0_25px_-8px_rgba(251,191,36,0.3)] hover:shadow-[0_0_35px_-5px_rgba(251,191,36,0.5)] flex items-center gap-2">
                <Plus className="w-4 h-4" />
                <span className="lowercase">submit strategy</span>
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Submit a Yield Strategy</DialogTitle>
                <DialogDescription>
                  Paste your Solidity source code and the agent will compile it and make it available for deployment.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5">
                <div>
                  <Label className="mb-2">Strategy Name</Label>
                  <Input
                    placeholder="e.g., PancakeSwap V3 USDC/USDT"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-2">Source Code</Label>
                  <textarea
                    placeholder="// SPDX-License-Identifier: MIT&#10;pragma solidity ^0.8.0;&#10;&#10;contract MyStrategy { ... }"
                    value={sourceCode}
                    onChange={(e) => setSourceCode(e.target.value)}
                    className="flex min-h-[200px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setSubmitOpen(false)}
                  disabled={submitStrategy.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitStrategy.isPending}
                >
                  {submitStrategy.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Submit
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground lowercase">
          <Loader2 className="w-4 h-4 animate-spin" />
          loading strategies...
        </div>
      ) : error ? (
        <Card className="p-8 text-center border border-border">
          <p className="text-sm text-destructive lowercase">
            {error instanceof Error ? error.message : "failed to load strategies"}
          </p>
        </Card>
      ) : !strategies || strategies.length === 0 ? (
        <Card className="p-12 text-center border border-border">
          <div className="max-w-md mx-auto">
            <Boxes className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2 lowercase">no strategies yet</h3>
            <p className="text-sm text-muted-foreground lowercase">
              submit a solidity strategy and the agent will compile it for deployment
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {strategies.map((strategy) => (
            <StrategyCard
              key={strategy.id}
              strategy={strategy}
              onTest={handleTest}
              isTesting={testingId === strategy.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
