import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { newHttpBatchRpcSession } from "capnweb";
import type { AuthTarget } from "@/lib/rpc-client";
import { API_URL } from "@/config";

export interface CreateStreamWizardParams {
  chainId: string;
  name: string;
  tokenAddress: string;
  totalAmount: string;
  recipients: Array<{ address: string; percentage: number }>;
  vestingSchedule: {
    type: "linear" | "cliff" | "milestone";
    startDate: string;
    endDate: string;
    cliffDuration?: number;
  };
}

export function useCreateStreamWizard() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateStreamWizardParams) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const session = await batch.authenticate({ accessToken: token });
      
      return await session.createStreamFromWizard(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["streams"] });
    },
  });
}
