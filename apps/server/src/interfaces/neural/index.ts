import { Mastra } from "@mastra/core";
import { RequestContext } from "@mastra/core/request-context";
import { LibSQLStore } from "@mastra/libsql";
import { PinoLogger } from "@mastra/loggers";
import { MCPClient } from "@mastra/mcp";

import { vestingAgent } from "@/interfaces/neural/agents/vesting-agent";
import {
  buildScheduledTaskPrompt,
  buildStreamCreationPrompt,
  buildUserFeedbackPrompt,
} from "@/interfaces/neural/prompts";
import { pluginService } from "@/services/plugins/plugin-service";
import { accountService } from "@/services/identity/account-service";
import { auditLogService } from "@/services/infra/audit-log-service";
import { streamService } from "@/services/streams/stream-service";
import type { ScheduledEvent } from "@/types/scheduled-event";

const runningAgentTasks = new Map<string, AbortController>();

export const mastra = new Mastra({
  agents: { vestingAgent },
  storage: new LibSQLStore({
    id: "vesting-memory",
    url: process.env.TURSO_AI_MEMORY_DB_URL || "file:mastra.db",
    authToken: process.env.TURSO_AI_MEMORY_DB_TOKEN,
  }),
  logger: new PinoLogger({
    name: "xylkstream-agent",
    level: "info",
  }),
});

export const neuralAgent = {
  /**
   * Create vesting stream from natural language
   */
  async createStreamFromNaturalLanguage(
    accountId: number,
    userPrompt: string,
  ): Promise<number> {
    const startTime = Date.now();
    console.log(`[neural] Starting stream creation for account ${accountId}`);

    const account = await accountService.getAccount(accountId);
    const policy = account.policy_json;
    const streamId = await streamService.createDraft(accountId);
    const pluginIds = policy.plugins || [];
    console.log(
      `[neural] Created draft stream ${streamId}, plugins: ${pluginIds.join(", ")} (${Date.now() - startTime}ms)`,
    );

    // Load plugins
    const pluginPorts = await Promise.all(
      pluginIds.map((pluginId) =>
        pluginService.getOrServePlugin(accountId, pluginId, {}, streamId),
      ),
    );
    console.log(
      `[neural] Plugins ready on ports: ${pluginPorts.map((p) => p.port).join(", ")} (${Date.now() - startTime}ms)`,
    );

    const mcpServers = Object.fromEntries(
      pluginIds.map((pluginId, index) => [
        pluginId,
        { url: new URL(`http://localhost:${pluginPorts[index].port}/mcp`) },
      ]),
    );
    const pluginsMCP = new MCPClient({
      id: `stream-create-${streamId}-${Date.now()}`,
      servers: mcpServers,
    });

    const requestContext = new RequestContext();
    requestContext.set("streamId", streamId);
    requestContext.set("accountId", accountId);

    const abortController = new AbortController();
    const taskKey = `stream-${streamId}`;
    runningAgentTasks.set(taskKey, abortController);

    const systemPrompt = buildStreamCreationPrompt({
      policyPrompt: policy.prompt || "Follow account policy for stream creation.",
      userPrompt,
      accountId,
      streamId,
      budgetLimits: policy.budget_limits,
      pluginIds,
    });

    await auditLogService.createAuditLog({
      accountId,
      streamId,
      type: "USER_FEEDBACK",
      content: { feedback: userPrompt },
      isInternal: false,
    });

    try {
      const agent = mastra.getAgent("vestingAgent");
      const toolsets = await pluginsMCP.listToolsets();

      await agent.generate(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        {
          toolsets,
          requestContext,
          abortSignal: abortController.signal,
          memory: {
            resource: `account-${accountId}`,
            thread: streamId.toString(),
          },
        },
      );

      console.log(`[neural] Stream creation complete (${Date.now() - startTime}ms)`);
      return streamId;
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        console.error(`[neural] Error creating stream ${streamId}:`, error);
      }
      return -1;
    } finally {
      runningAgentTasks.delete(taskKey);
    }
  },

  /**
   * Handle user feedback on agent work
   */
  async handleUserFeedback(
    accountId: number,
    streamId: number | null,
    feedback: string,
  ): Promise<void> {
    // Interrupt current task if running
    const taskKey = streamId ? `stream-${streamId}` : `account-${accountId}`;
    this.interruptAgentTask(taskKey);

    const account = await accountService.getAccount(accountId);
    const policy = account.policy_json;
    const pluginIds = policy.plugins || [];

    await auditLogService.createAuditLog({
      accountId,
      streamId: streamId ?? null,
      type: "USER_FEEDBACK",
      content: { feedback },
      isInternal: false,
    });

    const pluginPorts = await Promise.all(
      pluginIds.map((pluginId) =>
        pluginService.getOrServePlugin(accountId, pluginId, {}, streamId ?? undefined),
      ),
    );

    const mcpServers = Object.fromEntries(
      pluginIds.map((pluginId, index) => [
        pluginId,
        { url: new URL(`http://localhost:${pluginPorts[index].port}/mcp`) },
      ]),
    );
    const pluginsMCP = new MCPClient({
      id: `feedback-${accountId}-${Date.now()}`,
      servers: mcpServers,
    });

    const requestContext = new RequestContext();
    requestContext.set("accountId", accountId);
    if (streamId) requestContext.set("streamId", streamId);

    const abortController = new AbortController();
    runningAgentTasks.set(taskKey, abortController);

    let currentState: any = { account };
    if (streamId) {
      currentState.stream = await streamService.getStream(streamId);
    }

    const systemPrompt = buildUserFeedbackPrompt({
      goal: streamId ? "Create vesting stream" : "Complete your current task",
      accountId,
      streamId: streamId ?? null,
      currentState,
      userMessage: feedback,
    });

    try {
      const agent = mastra.getAgent("vestingAgent");
      await agent.generate(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: feedback },
        ],
        {
          toolsets: await pluginsMCP.listToolsets(),
          requestContext,
          abortSignal: abortController.signal,
          memory: {
            resource: `account-${accountId}`,
            thread: streamId?.toString() || "general",
          },
        },
      );
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        console.error(`[neural] Error handling feedback for account ${accountId}:`, error);

        await auditLogService.createAuditLog({
          accountId,
          streamId: streamId ?? null,
          type: "AI_THOUGHT",
          content: {
            thought: `I encountered an error while processing your feedback: ${error instanceof Error ? error.message : "Unknown error"}. Please try again or contact support if this persists.`,
          },
          isInternal: false,
        });
      }
    } finally {
      runningAgentTasks.delete(taskKey);
    }
  },

  /**
   * Resume scheduled agent task
   */
  async resumeAgentTask(event: ScheduledEvent): Promise<void> {
    const { entityId, metadata } = event;
    const { accountId, streamId, taskDescription, contextToRemember } = metadata;

    const account = await accountService.getAccount(accountId);
    const policy = account.policy_json;
    const pluginIds = policy.plugins || [];

    const pluginPorts = await Promise.all(
      pluginIds.map((pluginId) =>
        pluginService.getOrServePlugin(accountId, pluginId, {}, streamId),
      ),
    );

    const mcpServers = Object.fromEntries(
      pluginIds.map((pluginId, index) => [
        pluginId,
        { url: new URL(`http://localhost:${pluginPorts[index].port}/mcp`) },
      ]),
    );
    const pluginsMCP = new MCPClient({
      id: `resume-${entityId}-${Date.now()}`,
      servers: mcpServers,
    });

    const requestContext = new RequestContext();
    requestContext.set("accountId", accountId);
    if (streamId) requestContext.set("streamId", streamId);
    requestContext.set("scheduledTaskContext", contextToRemember);

    const systemPrompt = buildScheduledTaskPrompt({
      taskDescription,
      contextToRemember,
      accountId,
      streamId,
    });

    const agent = mastra.getAgent("vestingAgent");
    await agent.generate(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Resume the scheduled task." },
      ],
      {
        toolsets: await pluginsMCP.listToolsets(),
        requestContext,
        memory: {
          resource: `account-${accountId}`,
          thread: streamId?.toString() || "scheduled-task",
        },
      },
    );
  },

  /**
   * Interrupt running agent task
   */
  interruptAgentTask(taskKey: string): boolean {
    const abortController = runningAgentTasks.get(taskKey);
    if (abortController) {
      abortController.abort();
      return true;
    }
    return false;
  },

  /**
   * Process stream distribution (scheduled event)
   */
  async processDistribution(streamId: number): Promise<void> {
    const stream = await streamService.getStream(streamId);
    const account = await accountService.getAccount(stream.account_id);

    // Calculate amount to distribute
    const now = new Date();
    const lastDistribution = stream.last_distribution_at || stream.start_date;
    const timeSinceLastDistribution = now.getTime() - new Date(lastDistribution).getTime();
    const periodsElapsed = Math.floor(timeSinceLastDistribution / (stream.period_duration * 1000));
    const amountToDistribute = stream.amount_per_period * periodsElapsed;

    if (amountToDistribute > 0) {
      await streamService.markDistributed(streamId, amountToDistribute);
      
      await auditLogService.createAuditLog({
        accountId: stream.account_id,
        streamId,
        type: "DISTRIBUTION_MADE",
        content: {
          amount: amountToDistribute,
          recipient: stream.recipient_address,
          periodsElapsed,
        },
        isInternal: false,
      });
    }
  },

  /**
   * Complete stream (scheduled event)
   */
  async completeStream(streamId: number): Promise<void> {
    const stream = await streamService.getStream(streamId);
    
    await streamService.transitionStatus(streamId, "COMPLETED");
    
    await auditLogService.createAuditLog({
      accountId: stream.account_id,
      streamId,
      type: "STREAM_COMPLETED",
      content: {
        totalDistributed: stream.total_distributed,
        yieldEarned: stream.yield_earned,
      },
      isInternal: false,
    });
  },

  /**
   * Optimize yield for account (scheduled event)
   */
  async optimizeYield(accountId: number): Promise<void> {
    const account = await accountService.getAccount(accountId);
    const policy = account.policy_json;
    
    await auditLogService.createAuditLog({
      accountId,
      streamId: null,
      type: "AI_OPTIMIZATION",
      content: {
        reasoning: "Scheduled yield optimization check",
        action: "analyze_liquidity",
      },
      isInternal: true,
    });

    // This would trigger the AI agent to analyze and optimize
    // For now, just log the event
  },

  /**
   * Cancel stale draft (scheduled event)
   */
  async cancelDraft(streamId: number): Promise<void> {
    const stream = await streamService.getStream(streamId);
    
    if (stream.status === "DRAFTING") {
      await streamService.transitionStatus(streamId, "CANCELLED");
      
      await auditLogService.createAuditLog({
        accountId: stream.account_id,
        streamId,
        type: "STREAM_CANCELLED",
        content: {
          reason: "Draft timeout (24 hours)",
        },
        isInternal: false,
      });
    }
  },
};
