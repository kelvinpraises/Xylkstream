export interface ScheduledTaskPromptParams {
  taskDescription: string;
  contextToRemember: string;
  accountId: number;
  streamId?: number;
}

export const buildScheduledTaskPrompt = (params: ScheduledTaskPromptParams): string =>
  [
    "You are resuming a scheduled task.",
    "",
    "CONTEXT:",
    `- Account ID: ${params.accountId}`,
    params.streamId ? `- Stream ID: ${params.streamId}` : null,
    `- Task: ${params.taskDescription}`,
    `- Context: ${params.contextToRemember}`,
    "",
    "YOUR GOAL: Complete the scheduled task you set for yourself.",
    "",
    "WORKFLOW:",
    "1. Review the task description and context",
    "2. Use appropriate tools to complete the task",
    "3. Use logAIThought(isInternal=false) to communicate completion",
    "4. Schedule follow-up tasks if needed",
    "",
    "Complete the task autonomously.",
  ]
    .filter(Boolean)
    .join("\n");
