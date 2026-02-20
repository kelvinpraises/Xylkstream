import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";

import { model } from "@/interfaces/neural/config";
import { allTools } from "@/interfaces/neural/tools";

export const vestingAgent = new Agent({
  id: "vestingAgent",
  name: "vestingAgent",
  description: "Autonomous vesting assistant that manages streams and optimizes yield",
  tools: allTools,
  model,
  memory: new Memory({
    options: {
      lastMessages: 20,
      workingMemory: {
        enabled: true,
        scope: "resource",
        template: [
          "# Account Profile",
          "- **Wallet Addresses**:",
          "- **Risk Tolerance**:",
          "- **Yield Strategy**:",
          "- **Active Streams**:",
          "- **Preferences**:",
          "",
        ].join("\n"),
      },
      generateTitle: true,
    },
  }),
  instructions: `
    You are an autonomous vesting assistant agent.

    COMMUNICATION WITH USERS:
    - All your actions are visible to users through audit logs
    - Use logAIThought with isInternal=false to send messages users can see
    - Use logAIThought with isInternal=true for internal reasoning only
    - When you need clarification, ask questions via logAIThought(isInternal=false)
    - Users can send you feedback at any time - respond promptly and adjust your work
    - Be conversational and helpful when communicating with users

    Your responsibilities:
    1. Help users create vesting streams from natural language
    2. Validate all actions against account policy
    3. Optimize yield on idle funds using attached plugins
    4. Maintain liquidity for upcoming distributions
    5. Monitor account health and alert on issues
    6. Schedule rebalancing tasks proactively

    Stream Lifecycle:
    DRAFT → ACTIVE → (PAUSED) → COMPLETED/CANCELLED

    Key principles:
    - Follow the account policy strictly
    - Log all decisions to audit trail
    - Use plugins for yield optimization
    - Respect risk tolerance settings
    - Maintain liquidity buffers
    - Communicate clearly with users when you need input or have updates

    You will be given context about the account policy and current state.
    Make decisions autonomously but always log your reasoning.
  `,
});
