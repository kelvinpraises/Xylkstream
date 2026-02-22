import { usePrivy } from "@privy-io/react-auth";
import { useNavigate } from "@tanstack/react-router";

export function useLogout() {
  const { logout: privyLogout } = usePrivy();
  const navigate = useNavigate();

  return async () => {
    await privyLogout();
    navigate({ to: "/" });
  };
}
