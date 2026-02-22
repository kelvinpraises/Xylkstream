import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { newHttpBatchRpcSession } from "capnweb";
import type { AuthTarget } from "@/lib/rpc-client";
import { API_URL } from "@/config";
import { toast } from "sonner";

export function useStreamActions(streamId: number) {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["streams"] });
    queryClient.invalidateQueries({ queryKey: ["stream", streamId] });
  };

  const pauseStream = useMutation({
    mutationFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const session = await batch.authenticate({ accessToken: token });
      return await session.pauseStream({ streamId });
    },
    onSuccess: () => {
      toast.success("Stream paused");
      invalidateAll();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to pause stream");
    },
  });

  const resumeStream = useMutation({
    mutationFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const session = await batch.authenticate({ accessToken: token });
      return await session.resumeStream({ streamId });
    },
    onSuccess: () => {
      toast.success("Stream resumed");
      invalidateAll();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to resume stream");
    },
  });

  const cancelStream = useMutation({
    mutationFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const session = await batch.authenticate({ accessToken: token });
      return await session.cancelStream({ streamId });
    },
    onSuccess: () => {
      toast.success("Stream cancelled");
      invalidateAll();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to cancel stream");
    },
  });

  return {
    pauseStream,
    resumeStream,
    cancelStream,
  };
}
