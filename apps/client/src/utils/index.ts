import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes with proper precedence
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format date to relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  
  return then.toLocaleDateString();
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string, chars = 4): string {
  if (!address) return "";
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Convert raw ERC-4337 / RPC errors into user-friendly messages.
 */
export function friendlyTxError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("AA25")) return "A previous transaction is still processing. Please wait a moment and try again.";
  if (raw.includes("AA21")) return "Wallet not deployed yet. This will resolve after your first transaction confirms.";
  if (raw.includes("AA34")) return "Paymaster sponsorship failed. Please try again.";
  if (raw.includes("AA41")) return "Paymaster deposit too low. Contact support.";
  if (raw.includes("AA50") || raw.includes("AA51")) return "Insufficient funds to cover transaction fees.";
  if (raw.includes("insufficient funds")) return "Insufficient funds.";
  if (raw.includes("fetch failed") || raw.includes("Failed to fetch")) return "Network error — check your connection and try again.";
  if (raw.includes("0xacfdb444") || raw.includes("ExecutionFailed")) return "Transaction failed during simulation. Please try again.";
  if (raw.includes("User rejected") || raw.includes("user rejected")) return "Transaction was cancelled.";
  return "Something went wrong. Please try again.";
}
