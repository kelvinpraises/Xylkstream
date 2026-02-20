/**
 * Low Funds Monitor Cron Job
 * 
 * Checks vesting accounts with insufficient funds and creates notification records.
 * 
 * Runs: Every 30 minutes
 * 
 * Logic:
 * - Query all vesting_accounts
 * - Check wallet_balances against policy_json.budget_limits
 * - If total balance < max_stream_budget, create LOW_FUNDS notification
 * - Check for existing unread LOW_FUNDS notifications to avoid spam
 * - Set severity based on urgency (warning if < 2x budget, critical if < 1x)
 * - Include metadata with current balance and required amount
 */
