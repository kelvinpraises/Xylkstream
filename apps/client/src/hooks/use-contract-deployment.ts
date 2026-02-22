import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { newHttpBatchRpcSession } from "capnweb";
import type { AuthTarget, DeploymentResult } from "@/lib/rpc-client";
import { API_URL } from "@/config";
import { toast } from "sonner";

export type ChainKey = "tempo";

const CHAIN_MAP: Record<ChainKey, string> = {
  tempo: "tempo",
};

export function useContractDeployment() {
  const { getAccessToken, authenticated } = usePrivy();
  const queryClient = useQueryClient();

  // Query existing deployments
  const { data: deployments, isLoading: isLoadingDeployments } = useQuery({
    queryKey: ["deployments"],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const session = await batch.authenticate({ accessToken: token });
      return await session.listDeployments();
    },
    enabled: authenticated,
    staleTime: 60000, // Cache for 1 minute
  });

  // Deploy mutation
  const deployMutation = useMutation({
    mutationFn: async (chainKey: ChainKey) => {
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const chainId = CHAIN_MAP[chainKey];
      if (!chainId) throw new Error(`Unknown chain: ${chainKey}`);

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const session = await batch.authenticate({ accessToken: token });
      return await session.deployContracts({ chainId });
    },
    onSuccess: (data, chainKey) => {
      toast.success(`Contracts deployed to ${chainKey}!`);
      queryClient.invalidateQueries({ queryKey: ["deployments"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Deployment failed");
    },
  });

  const isDeployed = (chain: ChainKey): boolean => {
    const chainId = CHAIN_MAP[chain];
    return deployments?.some((d: DeploymentResult) => d.chainId === chainId) || false;
  };

  const getDeployment = (chain: ChainKey): DeploymentResult | undefined => {
    const chainId = CHAIN_MAP[chain];
    return deployments?.find((d: DeploymentResult) => d.chainId === chainId);
  };

  // Build deployedContracts map
  const deployedContracts = (deployments || []).reduce(
    (acc, d) => {
      const entry = Object.entries(CHAIN_MAP).find(([_, v]) => v === d.chainId);
      if (entry) acc[entry[0] as ChainKey] = d.contracts;
      return acc;
    },
    {} as Record<ChainKey, DeploymentResult["contracts"]>,
  );

  return {
    deployments,
    isLoadingDeployments,
    isDeploying: deployMutation.isPending,
    deployToChain: deployMutation.mutate,
    deployToTempo: () => deployMutation.mutateAsync("tempo"),
    deployedContracts,
    isDeployed,
    getDeployment,
  };
}
