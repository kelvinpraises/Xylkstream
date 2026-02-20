import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { accountService } from "@/services/identity/account-service";

export const checkPolicyCompliance = createTool({
  id: "checkPolicyCompliance",
  description: "Validate if a proposed action complies with account policy",
  inputSchema: z.object({
    accountId: z.number(),
    action: z.enum(["create_stream", "modify_stream", "yield_optimization"]),
    parameters: z.record(z.string(), z.any()).describe("Action parameters to validate"),
  }),
  execute: async (inputData) => {
    const account = await accountService.getAccount(inputData.accountId);
    const policy = account.policy_json;

    const violations: string[] = [];
    const warnings: string[] = [];

    // Validate based on action type
    if (inputData.action === "create_stream") {
      const { amount, recipientAddress } = inputData.parameters;

      // Check budget limits
      if (policy.budget_limits?.max_stream_budget && typeof amount === 'number' && amount > policy.budget_limits.max_stream_budget) {
        violations.push(
          `Amount ${amount} exceeds max stream budget ${policy.budget_limits.max_stream_budget}`,
        );
      }

      // Check balance (wallet_balances is a Record<string, string>)
      const totalBalance = Object.values(account.wallet_balances).reduce((sum, bal) => sum + parseFloat(bal || '0'), 0);
      if (typeof amount === 'number' && amount > totalBalance) {
        violations.push(`Insufficient balance: ${totalBalance} < ${amount}`);
      }
    }

    return {
      compliant: violations.length === 0,
      violations,
      warnings,
      policy: {
        budgetLimits: policy.budget_limits,
        plugins: policy.plugins,
      },
    };
  },
});
