import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "./privy-provider";
import { ChainProvider } from "./chain-provider";
import { StealthWalletProvider } from "./stealth-wallet-provider";
import { PendingProvider } from "./pending-provider";
import { ThemeProvider } from "./theme-provider";
import { SidebarProvider } from "@/components/organisms/sidebar";

interface RootProviderProps {
  children: ReactNode;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function RootProvider({ children }: RootProviderProps) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <PrivyProvider>
          <ChainProvider>
            <StealthWalletProvider>
              <PendingProvider>
                <SidebarProvider>{children}</SidebarProvider>
              </PendingProvider>
            </StealthWalletProvider>
          </ChainProvider>
        </PrivyProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

/** Minimal provider stack for pages that only need auth (e.g. OAuth). */
export function LightProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <PrivyProvider>
          {children}
        </PrivyProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
