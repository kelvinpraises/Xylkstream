import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { streamService } from "@/services/streams/stream-service";

export const queryStreams = createTool({
  id: "queryStreams",
  description: "Search and filter streams by criteria",
  inputSchema: z.object({
    accountId: z.number(),
    status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]).optional(),
    recipientAddress: z.string().optional(),
  }),
  execute: async (inputData) => {
    const streams = await streamService.listStreamsForAccount(inputData.accountId, {
      status: inputData.status,
    });

    // Filter by recipient if provided
    const filteredStreams = inputData.recipientAddress
      ? streams.filter(s => s.recipient_address === inputData.recipientAddress)
      : streams;

    return {
      count: filteredStreams.length,
      streams: filteredStreams.map((s) => ({
        id: s.id,
        recipientAddress: s.recipient_address,
        totalAmount: s.total_amount,
        amountPerPeriod: s.amount_per_period,
        periodDuration: s.period_duration,
        status: s.status,
        startDate: s.start_date,
        endDate: s.end_date,
        totalDistributed: s.total_distributed,
        yieldEarned: s.yield_earned,
      })),
    };
  },
});
