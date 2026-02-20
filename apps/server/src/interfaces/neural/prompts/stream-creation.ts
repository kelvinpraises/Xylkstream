export interface StreamCreationPromptParams {
  policyPrompt: string;
  userPrompt?: string;
  accountId: number;
  streamId: number;
  budgetLimits: any;
  pluginIds: string[];
}

export const buildStreamCreationPrompt = (params: StreamCreationPromptParams): string =>
  [
    params.policyPrompt,
    "",
    params.userPrompt ? `USER REQUEST: ${params.userPrompt}` : null,
    "",
    "CONTEXT:",
    `- Account ID: ${params.accountId}`,
    `- Stream ID: ${params.streamId}`,
    `- Budget Limits: ${JSON.stringify(params.budgetLimits)}`,
    `- Available Plugins: ${params.pluginIds.join(", ")}`,
    "",
    "YOUR GOAL: Create a vesting stream based on the user's request. Work autonomously!",
    "",
    "WORKFLOW:",
    "1. Parse user's natural language request into stream parameters",
    "2. Use checkPolicyCompliance to validate against account policy",
    "3. Use draftStreamProposal to create/update the stream draft",
    "4. Use viewStreamDraft to review current state",
    "5. Use logAIThought(isInternal=false) to communicate with user and confirm details",
    "6. Wait for user confirmation before finalizing",
    "7. Use logAIThought to document your reasoning",
    "",
    "IMPORTANT:",
    "- Always validate against policy before proposing",
    "- Ask for clarification via logAIThought(isInternal=false) if parameters are unclear",
    "- Explain your reasoning when suggesting parameters",
    "- The user can provide feedback at any time",
    "",
    "Create a stream that aligns with the policy and user's intent.",
  ]
    .filter(Boolean)
    .join("\n");
