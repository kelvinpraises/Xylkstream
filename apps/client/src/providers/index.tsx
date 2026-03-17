import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "./privy-provider";
import { ChainProvider } from "./chain-provider";
import { StealthWalletProvider } from "./stealth-wallet-provider";
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
              <SidebarProvider>{children}</SidebarProvider>
            </StealthWalletProvider>
          </ChainProvider>
        </PrivyProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
