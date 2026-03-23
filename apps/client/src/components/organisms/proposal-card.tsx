import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/molecules/card";
import { Button } from "@/components/atoms/button";
import { Badge } from "@/components/atoms/badge";
import type { Proposal } from "@/hooks/use-proposals";
import {
  Clock,
  Check,
  X,
} from "lucide-react";
import { formatRelativeTime } from "@/utils";

const typeConfig: Record<string, { label: string }> = {
  adjust_stream: { label: "Adjust Stream" },
  collect: { label: "Collect" },
  deploy_strategy: { label: "Deploy Strategy" },
  thought: { label: "Thought" },
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pending", variant: "outline" },
  approved: { label: "Approved", variant: "secondary" },
  rejected: { label: "Rejected", variant: "destructive" },
  executed: { label: "Executed", variant: "default" },
};

interface ProposalCardProps {
  proposal: Proposal;
  onApprove?: (id: number) => void;
  onReject?: (id: number) => void;
  isUpdating?: boolean;
}

export function ProposalCard({ proposal, onApprove, onReject, isUpdating }: ProposalCardProps) {
  const type = typeConfig[proposal.type] ?? typeConfig.thought;
  const status = statusConfig[proposal.status] ?? statusConfig.pending;

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">{type.label}</CardTitle>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {formatRelativeTime(proposal.created_at)}
              </span>
            </div>
          </div>
          <Badge variant={status.variant} className="text-xs">
            {status.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {proposal.agent_reason && (
          <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
            {proposal.agent_reason}
          </p>
        )}

        {proposal.type !== "thought" && Object.keys(proposal.params_json).length > 0 && (
          <div className="bg-muted/30 rounded-lg p-3 mb-3">
            {Object.entries(proposal.params_json).map(([key, value]) => (
              <div key={key} className="flex justify-between text-xs py-0.5">
                <span className="text-muted-foreground">{key}</span>
                <span className="font-mono text-foreground">{String(value)}</span>
              </div>
            ))}
          </div>
        )}

        {proposal.status === "pending" && onApprove && onReject && (
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              onClick={() => onApprove(proposal.id)}
              disabled={isUpdating}
              className="flex-1"
            >
              <Check className="w-3.5 h-3.5 mr-1.5" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onReject(proposal.id)}
              disabled={isUpdating}
              className="flex-1"
            >
              <X className="w-3.5 h-3.5 mr-1.5" />
              Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
