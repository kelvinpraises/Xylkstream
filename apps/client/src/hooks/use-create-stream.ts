import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { useNavigate } from "@tanstack/react-router";
import { newHttpBatchRpcSession } from "capnweb";
import type { AuthTarget, CreateStreamFromWizardInput } from "@/lib/rpc-client";
import { API_URL } from "@/config";
import { toast } from "sonner";

export function useCreateStream() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (input: CreateStreamFromWizardInput) => {
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");

      const batch = newHttpBatchRpcSession<AuthTarget>(`${API_URL}/rpc/external/auth`);
      const session = await batch.authenticate({ accessToken: token });
      return await session.createStreamFromWizard(input);
    },
    onSuccess: (result) => {
      toast.success("Stream created successfully!");
      queryClient.invalidateQueries({ queryKey: ["streams"] });

      // Navigate to stream detail or claim page
      if (result.claimPageUrl) {
        toast.info(`Claim page created: ${result.claimPageUrl}`);
      }
      
      // Navigate to streams page
      navigate({ to: "/streams" });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create stream");
    },
  });
}
