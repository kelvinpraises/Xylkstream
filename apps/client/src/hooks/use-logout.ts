import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { useNavigate } from "@tanstack/react-router";

export function useLogout() {
  const { logout: privyLogout } = usePrivy();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Clear all xylkstream/xylk localStorage entries
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("xylkstream_") || key.startsWith("xylk_"))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));

      // Clear sessionStorage (stealth wallet secret, etc.)
      sessionStorage.clear();

      // Privy logout (clears Privy session)
      await privyLogout();
    },
    onSuccess: () => {
      queryClient.clear();
      navigate({ to: "/" });
    },
  });
}
