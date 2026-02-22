import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { newHttpBatchRpcSession } from "capnweb";
import type { AuthTarget, AccountPolicy } from "@/lib/rpc-client";
import { API_URL } from "@/config";

export function useAccount() {
  const { getAccessToken } = usePrivy();

  return useQuery({
    queryKey: ["account"],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const sessionPromise = batch.authenticate({ accessToken: token });
      return await sessionPromise.getAccount();
    },
    staleTime: 30000, // 30 seconds
  });
}

export function useWalletBalances() {
  const { getAccessToken } = usePrivy();

  return useQuery({
    queryKey: ["wallet-balances"],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const sessionPromise = batch.authenticate({ accessToken: token });
      return await sessionPromise.getWalletBalances();
    },
    refetchInterval: 60000, // Refresh every minute
  });
}

export function useUpdatePolicy() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (policy: AccountPolicy) => {
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const sessionPromise = batch.authenticate({ accessToken: token });
      return await sessionPromise.updatePolicy({ policy });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account"] });
    },
  });
}
