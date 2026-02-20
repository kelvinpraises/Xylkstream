import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { streamService } from "@/services/streams/stream-service";

export const viewStreamDraft = createTool({
  id: "viewStreamDraft",
  description: "View current state of stream draft",
  inputSchema: z.object({
    streamId: z.number(),
  }),
  execute: async (inputData) => {
    const stream = await streamService.getStream(inputData.streamId);

    return {
      streamId: stream.id,
      recipientAddress: stream.recipient_address,
      totalAmount: stream.total_amount,
      amountPerPeriod: stream.amount_per_period,
      periodDuration: stream.period_duration,
      startDate: stream.start_date,
      endDate: stream.end_date,
      status: stream.status,
      assetId: stream.asset_id,
    };
  },
});
