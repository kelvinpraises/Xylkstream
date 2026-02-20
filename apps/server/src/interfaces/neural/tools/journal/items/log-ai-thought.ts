import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { auditLogService } from "@/services/infra/audit-log-service";

export const logAIThought = createTool({
  id: "logAIThought",
  description: `Log your reasoning and communicate with users.
  
  Use isInternal=false to send messages that users can see (questions, updates, explanations).
  Use isInternal=true for internal reasoning that users don't need to see.
  
  Examples:
  - isInternal=false: "I need more information about the recipient. What's their wallet address?"
  - isInternal=false: "I've analyzed your account and found 50K idle funds. Depositing to Aave at 8.5% APY."
  - isInternal=true: "Calculating optimal distribution schedule based on policy..."
  - isInternal=true: "Validating stream parameters against budget limits..."`,
  inputSchema: z.object({
    streamId: z.number().optional(),
    thought: z.string().describe("Your message or reasoning"),
    confidenceScore: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("How confident you are (0-1)"),
    isInternal: z
      .boolean()
      .optional()
      .describe(
        "false = user can see this message, true = internal reasoning only (default: true)",
      ),
  }),
  execute: async (inputData, context) => {
    const accountId = context?.requestContext?.get("accountId") as number;

    await auditLogService.createAuditLog({
      accountId,
      streamId: inputData.streamId ?? null,
      type: "AI_THOUGHT",
      content: { thought: inputData.thought },
      confidenceScore: inputData.confidenceScore,
      isInternal: inputData.isInternal ?? true,
    });

    return { success: true, message: "Thought logged to audit trail" };
  },
});
