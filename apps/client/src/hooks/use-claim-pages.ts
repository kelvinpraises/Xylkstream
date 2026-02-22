import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { newHttpBatchRpcSession } from "capnweb";
import type { AuthTarget, ClaimPageItem } from "@/lib/rpc-client";
import { API_URL } from "@/config";
import { toast } from "sonner";

export function useClaimPages() {
  const { getAccessToken, authenticated } = usePrivy();

  return useQuery({
    queryKey: ["claimPages"],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const session = await batch.authenticate({ accessToken: token });
      return await session.listClaimPages();
    },
    enabled: authenticated,
    staleTime: 30000,
  });
}

export function useCreateClaimPage() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      streamId: number;
      title: string;
      subtitle?: string;
      logoUrl?: string;
    }) => {
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const session = await batch.authenticate({ accessToken: token });
      return await session.createClaimPage(data);
    },
    onSuccess: () => {
      toast.success("Claim page created");
      queryClient.invalidateQueries({ queryKey: ["claimPages"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create claim page");
    },
  });
}

export function useUpdateClaimPage() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      id: string;
      title?: string;
      subtitle?: string;
      logoUrl?: string;
      isActive?: boolean;
    }) => {
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const session = await batch.authenticate({ accessToken: token });
      return await session.updateClaimPage(data);
    },
    onSuccess: () => {
      toast.success("Claim page updated");
      queryClient.invalidateQueries({ queryKey: ["claimPages"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update claim page");
    },
  });
}

export function useDeleteClaimPage() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const session = await batch.authenticate({ accessToken: token });
      return await session.deleteClaimPage({ id });
    },
    onSuccess: () => {
      toast.success("Claim page deleted");
      queryClient.invalidateQueries({ queryKey: ["claimPages"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete claim page");
    },
  });
}
