import { useMutation } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { useNavigate } from "@tanstack/react-router";

export function useLogout() {
  const { logout: privyLogout } = usePrivy();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: () => privyLogout(),
    onSuccess: () => {
      navigate({ to: "/" });
    },
  });
}
