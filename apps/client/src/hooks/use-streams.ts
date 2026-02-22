import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { newHttpBatchRpcSession } from "capnweb";
import type { AuthTarget, VestingStreamStatus } from "@/lib/rpc-client";
import { API_URL } from "@/config";

export function useStreams(status?: VestingStreamStatus) {
  const { getAccessToken } = usePrivy();

  return useQuery({
    queryKey: ["streams", status],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const sessionPromise = batch.authenticate({ accessToken: token });
      return await sessionPromise.listStreams({ status, limit: 100 });
    },
    staleTime: 30000, // Consider data fresh for 30 seconds
  });
}

export function useStreamDetails(streamId: number | null) {
  const { getAccessToken } = usePrivy();

  return useQuery({
    queryKey: ["stream", streamId],
    queryFn: async () => {
      if (!streamId) throw new Error("No stream ID");
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const sessionPromise = batch.authenticate({ accessToken: token });
      const result = await sessionPromise.getStreamDetails({ streamId });

      return result;
    },
    enabled: !!streamId,
    retry: 3,
    staleTime: Infinity, // Don't refetch unless explicitly invalidated
  });
}

export function useAuditLogs(streamId: number | null, includeInternal = false) {
  const { getAccessToken } = usePrivy();

  return useQuery({
    queryKey: ["audit-logs", streamId, includeInternal],
    queryFn: async () => {
      if (!streamId) throw new Error("No stream ID");
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const sessionPromise = batch.authenticate({ accessToken: token });
      const result = await sessionPromise.getAuditLogs({ streamId, includeInternal });

      return result;
    },
    enabled: !!streamId,
    staleTime: Infinity,
    retry: 1,
  });
}

export function useCreateStream() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      recipientAddress: string;
      amount: number;
      asset: string;
      startDate: string;
      endDate: string;
      cliffDate?: string;
    }) => {
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const sessionPromise = batch.authenticate({ accessToken: token });
      return await sessionPromise.createStream(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["streams"] });
    },
  });
}

export function useClaimStream() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (streamId: number) => {
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const sessionPromise = batch.authenticate({ accessToken: token });
      return await sessionPromise.claimStream({ streamId });
    },
    onSuccess: (_, streamId) => {
      queryClient.invalidateQueries({ queryKey: ["streams"] });
      queryClient.invalidateQueries({ queryKey: ["stream", streamId] });
    },
  });
}

export function useCancelStream() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (streamId: number) => {
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const sessionPromise = batch.authenticate({ accessToken: token });
      return await sessionPromise.cancelStream({ streamId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["streams"] });
    },
  });
}
