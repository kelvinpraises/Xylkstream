import { PrivyClient } from "@privy-io/server-auth";

export function createPrivyClient(): PrivyClient {
  if (!process.env.PRIVY_APP_ID || !process.env.PRIVY_SECRET) {
    throw new Error("Privy credentials not found in environment variables");
  }

  return new PrivyClient(process.env.PRIVY_APP_ID, process.env.PRIVY_SECRET);
}

export function getAuthConfig() {
  if (!process.env.XYLKSTREAM_WALLET_AUTH || !process.env.XYLKSTREAM_WALLET_AUTH_ID) {
    throw new Error("Privy auth config not found in environment variables");
  }

  return {
    authKeyId: process.env.XYLKSTREAM_WALLET_AUTH,
    keyQuorumId: process.env.XYLKSTREAM_WALLET_AUTH_ID,
  };
}
