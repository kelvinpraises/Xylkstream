function required(key: string): string {
  const value = import.meta.env[key];
  if (!value) throw new Error(`missing required env var: ${key}`);
  return value;
}

export const config = {
  APP_NAME: "xylkstream",

  // server
  API_URL: required("VITE_API_URL"),

  // auth
  PRIVY_APP_ID: required("VITE_PRIVY_APP_ID"),

  // default chain (used on first load before user switches)
  DEFAULT_CHAIN_ID: Number(required("VITE_DEFAULT_CHAIN_ID")),
} as const;
