import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { accountService } from "@/services/identity/account-service";
import { streamService } from "@/services/streams/stream-service";

export const viewAccountState = createTool({
  id: "viewAccountState",
  description: "Get current account balances, streams, and yield earned",
  inputSchema: z.object({
    accountId: z.number(),
  }),
  execute: async (inputData) => {
    const account = await accountService.getAccount(inputData.accountId);
    const streams = await streamService.listStreamsForAccount(inputData.accountId);

    const totalYieldEarned = streams.reduce(
      (sum, stream) => sum + (stream.yield_earned || 0),
      0,
    );

    const totalBalance = Object.values(account.wallet_balances).reduce((sum, bal) => sum + parseFloat(bal || '0'), 0);

    return {
      accountId: account.id,
      walletAddress: account.wallet_address,
      balance: totalBalance,
      walletBalances: account.wallet_balances,
      totalYieldEarned,
      policy: account.policy_json,
      streamsCount: {
        active: streams.filter((s) => s.status === "ACTIVE").length,
        paused: streams.filter((s) => s.status === "PAUSED").length,
        completed: streams.filter((s) => s.status === "COMPLETED").length,
      },
      createdAt: account.created_at,
    };
  },
});
