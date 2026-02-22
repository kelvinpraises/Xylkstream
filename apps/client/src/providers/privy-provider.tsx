import type { ReactNode } from "react";
import { PrivyProvider as PrivyProviderSDK } from "@privy-io/react-auth";
import { PRIVY_APP_ID } from "@/config";

interface PrivyProviderProps {
  children: ReactNode;
}

export function PrivyProvider({ children }: PrivyProviderProps) {
  return (
    <PrivyProviderSDK
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#06b6d4",
          logo: undefined,
        },
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
        },
      }}
    >
      {children}
    </PrivyProviderSDK>
  );
}
