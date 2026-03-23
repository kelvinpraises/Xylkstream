/**
 * Cached token manager for Privy.
 *
 * Privy's getAccessToken() hits their auth server on every call.
 * With multiple polling queries running in parallel (2–5s intervals),
 * this hammers the rate limit. Instead, we cache the JWT and only
 * call getAccessToken() when the token is missing or within 60s of expiry.
 */

let cachedToken: string | null = null;
let cachedExpiry: number = 0; // unix seconds

function getJwtExpiry(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp : 0;
  } catch {
    return 0;
  }
}

/**
 * Returns a cached Privy access token, refreshing only when expired or near-expiry.
 * Pass `getAccessToken` from `usePrivy()` as the refresher.
 */
export async function getCachedToken(
  getAccessToken: () => Promise<string | null>,
): Promise<string | null> {
  const nowSecs = Math.floor(Date.now() / 1000);
  // Refresh if no cached token or expiring within 60 seconds
  if (!cachedToken || nowSecs >= cachedExpiry - 60) {
    const fresh = await getAccessToken();
    cachedToken = fresh;
    cachedExpiry = fresh ? getJwtExpiry(fresh) : 0;
  }
  return cachedToken;
}

/** Call on logout to clear the cache. */
export function clearTokenCache() {
  cachedToken = null;
  cachedExpiry = 0;
}
