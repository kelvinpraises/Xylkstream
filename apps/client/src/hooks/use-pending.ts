import { usePendingContext } from "@/providers/pending-provider";

export function usePending() {
  return usePendingContext();
}
