import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { streamService } from "@/services/streams/stream-service";

export const draftStreamProposal = createTool({
  id: "draftStreamProposal",
  description: "Create or update vesting stream draft (iterative)",
  inputSchema: z.object({
    streamId: z.number(),
    recipientAddress: z.string().optional(),
    amount: z.number().optional(),
    startTime: z.string().optional(), // ISO date
    duration: z.number().optional(), // seconds
    cliffDuration: z.number().optional(), // seconds
    periodDuration: z.number().optional(), // seconds (0 for continuous)
  }),
  execute: async (inputData, context) => {
    const { streamId, startTime, ...updates } = inputData;

    const updateData: any = { ...updates };

    if (startTime) {
      updateData.start_time = new Date(startTime);
    }

    await streamService.updateStream(streamId, updateData);

    return { success: true, streamId };
  },
});
