import { createContext, useContext, type ReactNode } from "react";
import { useStealthWallet } from "@/hooks/use-stealth-wallet";

// re-export the return type of useStealthWallet as the context value
type StealthWalletContextValue = ReturnType<typeof useStealthWallet>;

const StealthWalletContext = createContext<StealthWalletContextValue | null>(null);

export function StealthWalletProvider({ children }: { children: ReactNode }) {
  const wallet = useStealthWallet();
  return (
    <StealthWalletContext.Provider value={wallet}>
      {children}
    </StealthWalletContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStealthWalletContext() {
  const context = useContext(StealthWalletContext);
  if (!context) {
    throw new Error("useStealthWalletContext must be used within StealthWalletProvider");
  }
  return context;
}
