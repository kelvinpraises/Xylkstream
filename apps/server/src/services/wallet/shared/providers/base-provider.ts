export function validateAccountId(accountId: number): void {
  if (!accountId || accountId <= 0 || !Number.isInteger(accountId)) {
    throw new Error(`Invalid account ID: ${accountId}`);
  }
}
