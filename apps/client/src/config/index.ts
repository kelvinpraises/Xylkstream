/**
 * Application configuration
 */

export const APP_NAME = "Xylkstream";
export const APP_DESCRIPTION =
  "Multi-tenant vesting platform with automated yield optimization";

export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || "";
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4848";
