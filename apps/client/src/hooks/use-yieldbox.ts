import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { config } from "@/config";

async function strategiesApi(
  path: string,
  getToken: () => Promise<string | null>,
  options?: RequestInit,
) {
  const token = await getToken();
  console.log("token: ",token)
  const res = await fetch(`${config.API_URL}/strategies${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export interface Strategy {
  id: number;
  user_id: number;
  name: string;
  source_code: string;
  bytecode: string | null;
  abi_json: any[] | null;
  status: "pending" | "compiling" | "compiled" | "failed";
  errors: string | null;
  test_status: "untested" | "testing" | "passed" | "failed" | null;
  test_results_json: Record<string, any> | null;
  deployment_address: string | null;
  created_at: string;
}

export function useStrategies() {
  const { getAccessToken } = usePrivy();
  return useQuery({
    queryKey: ["strategies"],
    queryFn: () => strategiesApi("/", getAccessToken),
    select: (data) => data.strategies as Strategy[],
    refetchInterval: 5000,
  });
}

export function useStrategy(id: number) {
  const { getAccessToken } = usePrivy();
  return useQuery({
    queryKey: ["strategies", id],
    queryFn: () => strategiesApi(`/${id}`, getAccessToken),
    select: (data) => data.strategy as Strategy,
    refetchInterval: (query) => {
      const s = query.state.data?.strategy;
      if (s?.status === "pending" || s?.status === "compiling") return 2000;
      if (s?.test_status === "testing") return 2000;
      return false;
    },
  });
}

export function useSubmitStrategy() {
  const queryClient = useQueryClient();
  const { getAccessToken } = usePrivy();
  return useMutation({
    mutationFn: ({ name, sourceCode }: { name: string; sourceCode: string }) =>
      strategiesApi("/", getAccessToken, {
        method: "POST",
        body: JSON.stringify({ name, sourceCode }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strategies"] });
    },
  });
}

export function useTestStrategy() {
  const queryClient = useQueryClient();
  const { getAccessToken } = usePrivy();
  return useMutation({
    mutationFn: ({ strategyId }: { strategyId: number }) =>
      strategiesApi(`/${strategyId}/test`, getAccessToken, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strategies"] });
    },
  });
}

export function useUpdateDeployAddress() {
  const queryClient = useQueryClient();
  const { getAccessToken } = usePrivy();
  return useMutation({
    mutationFn: ({
      strategyId,
      deploymentAddress,
    }: {
      strategyId: number;
      deploymentAddress: string;
    }) =>
      strategiesApi(`/${strategyId}`, getAccessToken, {
        method: "PATCH",
        body: JSON.stringify({ deploymentAddress }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strategies"] });
    },
  });
}
