import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { newHttpBatchRpcSession } from "capnweb";
import type { AuthTarget, ClaimPageDetails } from "@/lib/rpc-client";
import { API_URL } from "@/config";
import { toast } from "sonner";

export function useClaimPage(pageId: string) {
  const { getAccessToken, authenticated } = usePrivy();

  return useQuery({
    queryKey: ["claimPage", pageId],
    queryFn: async () => {
      // Try to get token, but don't fail if not authenticated
      const token = await getAccessToken();
      
      if (!token) {
        // TODO: This should use a PUBLIC endpoint that doesn't require auth
        // For now, we require authentication to view claim pages
        // Backend needs to expose: GET /api/public/claim-pages/:id
        throw new Error("Please connect your wallet to view this claim page");
      }

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const session = await batch.authenticate({ accessToken: token });
      return await session.getClaimPage({ id: pageId });
    },
    enabled: !!pageId,
    staleTime: 30000,
    retry: false, // Don't retry if auth fails
  });
}

export function useClaimableAmount(claimPageId: string) {
  const { getAccessToken, authenticated } = usePrivy();

  return useQuery({
    queryKey: ["claimable", claimPageId],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const session = await batch.authenticate({ accessToken: token });
      return await session.getClaimableAmount({ claimPageId });
    },
    enabled: authenticated && !!claimPageId,
    refetchInterval: 60000, // Refresh every minute
  });
}

export function useProcessClaim() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (claimPageId: string) => {
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const session = await batch.authenticate({ accessToken: token });
      return await session.processClaim({ claimPageId });
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Claimed ${result.amountClaimed} tokens!`);
        queryClient.invalidateQueries({ queryKey: ["claimable"] });
      } else {
        toast.error(result.error || "Claim failed");
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Claim failed");
    },
  });
}

export function useClaimHistory(claimPageId: string) {
  const { getAccessToken, authenticated } = usePrivy();

  return useQuery({
    queryKey: ["claimHistory", claimPageId],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const session = await batch.authenticate({ accessToken: token });
      return await session.getClaimHistory({ claimPageId });
    },
    enabled: authenticated && !!claimPageId,
  });
}
