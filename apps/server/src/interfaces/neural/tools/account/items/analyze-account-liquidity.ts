import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { accountService } from "@/services/identity/account-service";
import { streamService } from "@/services/streams/stream-service";

export const analyzeAccountLiquidity = createTool({
  id: "analyzeAccountLiquidity",
  description: "Calculate idle vs locked funds in vesting account",
  inputSchema: z.object({
    accountId: z.number(),
  }),
  execute: async (inputData) => {
    const account = await accountService.getAccount(inputData.accountId);
    const streams = await streamService.listStreamsForAccount(inputData.accountId, {
      status: "ACTIVE",
    });

    // Calculate locked funds (sum of remaining amounts in active streams)
    const lockedFunds = streams.reduce((sum: number, stream) => {
      const distributed = stream.total_distributed || 0;
      const remaining = stream.total_amount - distributed;
      return sum + remaining;
    }, 0);

    const totalBalance = Object.values(account.wallet_balances).reduce((sum, bal) => sum + parseFloat(bal || '0'), 0);
    const idleFunds = totalBalance - lockedFunds;

    return {
      totalBalance,
      lockedFunds,
      idleFunds,
      utilizationRate: totalBalance > 0 ? (lockedFunds / totalBalance) * 100 : 0,
      activeStreamsCount: streams.length,
    };
  },
});
