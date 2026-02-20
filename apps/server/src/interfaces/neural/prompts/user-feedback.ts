export interface UserFeedbackPromptParams {
  goal: string;
  accountId: number;
  streamId?: number | null;
  currentState: any;
  userMessage: string;
}

export const buildUserFeedbackPrompt = (params: UserFeedbackPromptParams): string =>
  [
    "The user has provided feedback on your work.",
    "",
    "CONTEXT:",
    `- Account ID: ${params.accountId}`,
    params.streamId ? `- Stream ID: ${params.streamId}` : null,
    `- Current Goal: ${params.goal}`,
    `- Current State: ${JSON.stringify(params.currentState)}`,
    "",
    `USER FEEDBACK: ${params.userMessage}`,
    "",
    "YOUR GOAL: Adjust your work based on the user's feedback.",
    "",
    "WORKFLOW:",
    "1. Understand what the user wants changed",
    "2. Use appropriate tools to make adjustments",
    "3. Use logAIThought(isInternal=false) to confirm changes",
    "4. Continue working toward the goal",
    "",
    "IMPORTANT:",
    "- Respect the user's preferences",
    "- Ask clarifying questions if feedback is unclear",
    "- Explain what you're changing and why",
    "",
    "Adjust your work based on the feedback.",
  ]
    .filter(Boolean)
    .join("\n");
