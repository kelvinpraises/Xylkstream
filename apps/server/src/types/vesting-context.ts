import { z } from "zod";

export const VestingRuntimeContextSchema = z.object({
  streamId: z.number(),
  accountId: z.number(),
});

export type VestingRuntimeContext = z.infer<typeof VestingRuntimeContextSchema>;
