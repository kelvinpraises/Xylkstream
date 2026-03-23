function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`missing required env var: ${name}`);
  return value;
}

export const config = {
  APP_NAME: "xylkstream",

  // server
  API_URL: required(import.meta.env.VITE_API_URL, "VITE_API_URL"),

  // auth
  PRIVY_APP_ID: required(import.meta.env.VITE_PRIVY_APP_ID, "VITE_PRIVY_APP_ID"),

  // default chain (used on first load before user switches)
  DEFAULT_CHAIN_ID: Number(required(import.meta.env.VITE_DEFAULT_CHAIN_ID, "VITE_DEFAULT_CHAIN_ID")),
} as const;
