import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { config } from "@/config";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function proposalsApi(
  path: string,
  getToken: () => Promise<string | null>,
  options?: RequestInit,
) {
  const token = await getToken();
  const res = await fetch(`${config.API_URL}/proposals${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error || `Request failed: ${res.status}`, res.status);
  }
  return res.json();
}

const noRetryOn401 = (count: number, error: Error) =>
  error instanceof ApiError && error.status === 401 ? false : count < 3;

export interface Proposal {
  id: number;
  user_id: number;
  type: string;
  params_json: Record<string, any>;
  status: "pending" | "approved" | "rejected" | "executed";
  agent_reason: string | null;
  created_at: string;
  executed_at: string | null;
}

export function useProposals(status?: string) {
  const { getAccessToken, ready, authenticated } = usePrivy();
  const query = status ? `?status=${status}` : "";
  return useQuery({
    queryKey: ["proposals", status],
    queryFn: () => proposalsApi(`/${query}`, getAccessToken),
    select: (data) => data.proposals as Proposal[],
    enabled: ready && authenticated,
    retry: noRetryOn401,
  });
}

export function usePendingProposalCount() {
  const { getAccessToken, ready, authenticated } = usePrivy();
  return useQuery({
    queryKey: ["proposals", "count"],
    queryFn: () => proposalsApi("/count", getAccessToken),
    select: (data) => data.count as number,
    refetchInterval: 5 * 60_000, // every 5 minutes, not 30 seconds
    staleTime: 5 * 60_000,
    enabled: ready && authenticated,
    retry: noRetryOn401,
  });
}

export function useUpdateProposalStatus() {
  const queryClient = useQueryClient();
  const { getAccessToken } = usePrivy();
  return useMutation({
    mutationFn: ({
      proposalId,
      status,
    }: {
      proposalId: number;
      status: "approved" | "rejected" | "executed";
    }) =>
      proposalsApi(`/${proposalId}/status`, getAccessToken, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
    },
  });
}
