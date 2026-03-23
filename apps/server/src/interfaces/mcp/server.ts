import { Router, Request, Response } from "express";
import { MCPServer } from "@mastra/mcp";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { authService } from "../../services/auth/auth-service.js";
import { circleService } from "../../services/circles/circle-service.js";
import { proposalService } from "../../services/proposals/proposal-service.js";
import { yieldboxService } from "../../services/yieldbox/yieldbox-service.js";

// ── Helper: extract userId from MCP context ────────────────────────────

function getUserId(context: any): number {
  // Direct tool call:  context.mcp.extra.authInfo
  // Agent tool call:   context.requestContext.get("mcp.extra")
  const mcpExtra =
    context?.mcp?.extra ?? context?.requestContext?.get("mcp.extra");
  const userId = mcpExtra?.authInfo?.userId;
  if (!userId) {
    throw new Error("Authentication required — no userId in MCP context");
  }
  return userId;
}

// ── Tools ──────────────────────────────────────────────────────────────

const getBalances = createTool({
  id: "get_balances",
  description: "Get token balances for the authenticated user",
  inputSchema: z.object({}),
  execute: async (_inputData, _context) => {
    return {
      note: "Balances are managed via the user's browser wallet. Use propose_* tools to suggest on-chain actions.",
      balances: [],
    };
  },
});

const listStreams = createTool({
  id: "list_streams",
  description: "List payment streams for the authenticated user",
  inputSchema: z.object({
    status: z
      .string()
      .optional()
      .describe("Filter by status (active, completed, cancelled)"),
  }),
  execute: async (_inputData, _context) => {
    return {
      note: "Streams are stored locally on the user's device. Use proposals to suggest stream actions.",
      streams: [],
    };
  },
});

const listCircles = createTool({
  id: "list_circles",
  description: "List circles (groups) owned by the authenticated user",
  inputSchema: z.object({}),
  execute: async (_inputData, context) => {
    const userId = getUserId(context);
    const circles = await circleService.listByOwner(userId);
    return circles.map((c) => ({
      id: c.id,
      name: c.name,
      memberCount: c.member_count,
      inviteCode: c.invite_code,
      createdAt: c.created_at,
    }));
  },
});

const getProposals = createTool({
  id: "get_proposals",
  description:
    "List proposals created by this agent for the authenticated user",
  inputSchema: z.object({
    status: z
      .string()
      .optional()
      .describe(
        "Filter by status (pending, approved, rejected, executed)"
      ),
  }),
  execute: async (inputData, context) => {
    const userId = getUserId(context);
    const proposals = await proposalService.list(userId, inputData.status);
    return proposals.map((p) => ({
      id: p.id,
      type: p.type,
      params: p.params_json,
      status: p.status,
      reason: p.agent_reason,
      createdAt: p.created_at,
      executedAt: p.executed_at,
    }));
  },
});

const proposeAdjustStream = createTool({
  id: "propose_adjust_stream",
  description: "Propose adjusting an existing payment stream's rate",
  inputSchema: z.object({
    streamId: z.string().describe("Stream ID to adjust"),
    newRate: z.string().describe("New rate (tokens per second, as string)"),
    reason: z.string().describe("Why this adjustment is recommended"),
  }),
  execute: async (inputData, context) => {
    const userId = getUserId(context);
    const proposal = await proposalService.create({
      userId,
      type: "adjust_stream",
      paramsJson: { streamId: inputData.streamId, newRate: inputData.newRate },
      agentReason: inputData.reason,
    });
    return { proposalId: proposal.id };
  },
});

const proposeCollect = createTool({
  id: "propose_collect",
  description: "Propose collecting earned funds from a stream",
  inputSchema: z.object({
    streamId: z.string().describe("Stream ID to collect from"),
    reason: z.string().describe("Why collection is recommended"),
  }),
  execute: async (inputData, context) => {
    const userId = getUserId(context);
    const proposal = await proposalService.create({
      userId,
      type: "collect",
      paramsJson: { streamId: inputData.streamId },
      agentReason: inputData.reason,
    });
    return { proposalId: proposal.id };
  },
});

const proposeDeployStrategy = createTool({
  id: "propose_deploy_strategy",
  description: "Propose deploying a compiled yield strategy on-chain",
  inputSchema: z.object({
    strategyId: z.number().describe("Strategy ID to deploy"),
    reason: z.string().describe("Why this strategy should be deployed"),
  }),
  execute: async (inputData, context) => {
    const userId = getUserId(context);
    const proposal = await proposalService.create({
      userId,
      type: "deploy_strategy",
      paramsJson: { strategyId: inputData.strategyId },
      agentReason: inputData.reason,
    });
    return { proposalId: proposal.id };
  },
});

const logThought = createTool({
  id: "log_thought",
  description:
    "Log a reasoning step or observation (informational only, no user approval needed)",
  inputSchema: z.object({
    thought: z.string().describe("The thought or reasoning to log"),
    streamId: z
      .string()
      .optional()
      .describe("Associated stream ID (optional)"),
  }),
  execute: async (inputData, context) => {
    const userId = getUserId(context);
    await proposalService.create({
      userId,
      type: "thought",
      paramsJson: {
        thought: inputData.thought,
        ...(inputData.streamId ? { streamId: inputData.streamId } : {}),
      },
      agentReason: inputData.thought,
      status: "executed",
    });
    return { logged: true };
  },
});

const submitStrategy = createTool({
  id: "submit_strategy",
  description: "Submit a Solidity yield strategy for compilation",
  inputSchema: z.object({
    name: z
      .string()
      .describe("Strategy name (e.g., PancakeV3Optimizer)"),
    sourceCode: z.string().describe("Complete Solidity source code"),
  }),
  execute: async (inputData, context) => {
    const userId = getUserId(context);
    const strategy = await yieldboxService.submitStrategy(
      userId,
      inputData.name,
      inputData.sourceCode
    );
    return { strategyId: strategy.id, status: strategy.status };
  },
});

const getStrategyResults = createTool({
  id: "get_strategy_results",
  description: "Get compilation results for a submitted strategy",
  inputSchema: z.object({
    strategyId: z
      .number()
      .describe("Strategy ID returned from submit_strategy"),
  }),
  execute: async (inputData, context) => {
    const userId = getUserId(context);
    const strategy = await yieldboxService.getStrategy(
      inputData.strategyId,
      userId
    );
    if (!strategy) {
      return { error: "Strategy not found" };
    }
    return {
      id: strategy.id,
      name: strategy.name,
      status: strategy.status,
      bytecode: strategy.bytecode,
      abi: strategy.abi_json,
      errors: strategy.errors ? JSON.parse(strategy.errors) : null,
      testStatus: strategy.test_status,
      testResults: strategy.test_results_json,
      deploymentAddress: strategy.deployment_address,
    };
  },
});

const testStrategy = createTool({
  id: "test_strategy",
  description:
    "Run EVM tests on a compiled strategy in a sandboxed workerd environment",
  inputSchema: z.object({
    strategyId: z
      .number()
      .describe("Strategy ID to test (must be compiled)"),
    testScript: z
      .string()
      .optional()
      .describe(
        "Custom JS test script. If omitted, auto-generates tests for all view/pure functions. Script has access to env.evm with deploy() and call(fn, args) methods."
      ),
  }),
  execute: async (inputData, context) => {
    const userId = getUserId(context);
    try {
      await yieldboxService.testStrategy(
        inputData.strategyId,
        userId,
        inputData.testScript
      );
      const strategy = await yieldboxService.getStrategy(
        inputData.strategyId,
        userId
      );
      return {
        strategyId: inputData.strategyId,
        testStatus: strategy?.test_status,
        testResults: strategy?.test_results_json,
      };
    } catch (err) {
      return { error: String(err) };
    }
  },
});

// ── Mastra MCPServer instance ──────────────────────────────────────────

const mcpServer = new MCPServer({
  id: "xylkstream",
  name: "xylkstream",
  version: "1.0.0",
  description:
    "Xylkstream MCP server — payment streaming, circle management, yield strategies, and proposals",
  tools: {
    getBalances,
    listStreams,
    listCircles,
    getProposals,
    proposeAdjustStream,
    proposeCollect,
    proposeDeployStrategy,
    logThought,
    submitStrategy,
    getStrategyResults,
    testStrategy,
  },
});

// ── Express router — thin wrapper around mcpServer.startHTTP() ─────────

const router = Router();

/**
 * Auth middleware for MCP routes.
 * Verifies the Bearer token and sets req.auth so that Mastra's startHTTP()
 * passes it through as context.mcp.extra.authInfo in tool execute().
 */
function mcpAuth(req: Request, res: Response): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.set("WWW-Authenticate", 'Bearer error="invalid_token"');
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return false;
  }

  try {
    const token = authHeader.slice(7);
    const { userId } = authService.verifyAgentToken(token);
    // Mastra reads req.auth and exposes it as context.mcp.extra.authInfo
    (req as any).auth = { userId };
    return true;
  } catch {
    res.set("WWW-Authenticate", 'Bearer error="invalid_token"');
    res.status(401).json({ error: "Invalid or expired agent token" });
    return false;
  }
}

/**
 * All MCP methods (POST, GET, DELETE) on /mcp
 * Mastra's startHTTP() handles session management, reconnection,
 * transport lifecycle, etc.
 */
router.all("/", async (req: Request, res: Response) => {
  if (!mcpAuth(req, res)) return;

  // Express strips the mount path ("/mcp") from req.url inside the router.
  // We must use req.originalUrl so that URL.pathname becomes "/mcp",
  // which matches the httpPath passed to startHTTP.
  const url = new URL(req.originalUrl || "/", `http://${req.headers.host}`);
  try {
    await mcpServer.startHTTP({
      url,
      httpPath: req.baseUrl, // Effectively "/mcp"
      req: req as any,
      res: res as any,
      options: {
        sessionIdGenerator: () =>
          `mcp-${(req as any).auth.userId}-${Date.now()}`,
      },
    });
  } catch (err) {
    console.error("[mcp] startHTTP error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal MCP error" });
    }
  }
});

export default router;
