import { createFileRoute } from "@tanstack/react-router";
// TODO: restore audit log fetching once new RPC layer is wired up
import { History } from "lucide-react";
import { Card } from "@/components/card";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});

function HistoryPage() {
  // TODO: re-implement using new drips-based event indexing
  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="mb-12">
        <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight text-foreground mb-3">
          Activity
        </h1>
        <p className="text-muted-foreground text-lg">
          Everything that's happened with your payments
        </p>
      </div>

      <Card className="p-12 text-center border border-border">
        <div className="max-w-md mx-auto">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <History className="w-6 h-6 text-amber-400" />
          </div>
          <h3 className="text-lg font-medium mb-2">Activity Coming Soon</h3>
          <p className="text-sm text-muted-foreground">
            On-chain event history will appear here once the indexer is wired up.
          </p>
        </div>
      </Card>
    </div>
  );
}
