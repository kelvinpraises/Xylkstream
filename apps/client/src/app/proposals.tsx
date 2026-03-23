import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useProposals, useUpdateProposalStatus } from "@/hooks/use-proposals";
import { ProposalCard } from "@/components/organisms/proposal-card";
import { Tabs, TabsList, TabsTrigger } from "@/components/atoms/tabs";
import { Skeleton } from "@/components/atoms/skeleton";
import { Inbox } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/proposals")({
  component: ProposalsPage,
});

function ProposalsPage() {
  const { user } = usePrivy();
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const { data: proposals, isLoading } = useProposals(filter);
  const updateStatus = useUpdateProposalStatus();

  const handleApprove = (id: number) => {
    updateStatus.mutate(
      { proposalId: id, status: "approved" },
      {
        onSuccess: () => toast.success("Proposal approved"),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleReject = (id: number) => {
    updateStatus.mutate(
      { proposalId: id, status: "rejected" },
      {
        onSuccess: () => toast.success("Proposal rejected"),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="mb-12">
        <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight text-foreground mb-3">
          Proposals
        </h1>
        <p className="text-muted-foreground text-lg">
          Review and approve actions suggested by your agent
        </p>
      </div>

      <Tabs
        value={filter ?? "all"}
        onValueChange={(v) => setFilter(v === "all" ? undefined : v)}
        className="mb-6"
      >
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="executed">Executed</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>
      </Tabs>

      {!user ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Sign in to view agent proposals.
        </p>
      ) : isLoading ? (
        <div className="space-y-4 max-w-2xl">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : !proposals?.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <Inbox className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">
            No proposals yet. Connect an agent in Settings to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-4 max-w-2xl">
          {proposals.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              onApprove={handleApprove}
              onReject={handleReject}
              isUpdating={updateStatus.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
