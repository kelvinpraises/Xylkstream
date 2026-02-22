import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { newHttpBatchRpcSession } from "capnweb";
import type { AuthTarget } from "@/lib/rpc-client";
import { API_URL } from "@/config";

export function usePlugins() {
  const { getAccessToken } = usePrivy();

  return useQuery({
    queryKey: ["plugins"],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const sessionPromise = batch.authenticate({ accessToken: token });
      return await sessionPromise.listAvailablePlugins({ limit: 100 });
    },
    staleTime: 300000, // 5 minutes - plugins don't change often
  });
}

export function usePluginDetails(pluginId: string | null) {
  const { getAccessToken } = usePrivy();

  return useQuery({
    queryKey: ["plugin", pluginId],
    queryFn: async () => {
      if (!pluginId) throw new Error("No plugin ID");
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const sessionPromise = batch.authenticate({ accessToken: token });
      return await sessionPromise.getPluginDetails({ pluginId });
    },
    enabled: !!pluginId,
    staleTime: 300000,
  });
}

export function useTogglePlugin() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pluginId, enabled }: { pluginId: string; enabled: boolean }) => {
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const sessionPromise = batch.authenticate({ accessToken: token });
      return await sessionPromise.togglePlugin({ pluginId, enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account"] });
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
    },
  });
}
