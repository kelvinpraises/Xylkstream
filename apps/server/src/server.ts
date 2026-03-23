import cors from "cors";
import http from "http";
import dotenv from "dotenv";
import express from "express";
import type { Hex } from "viem";
import { chains, loadDeployOutput, getEntryPointAddress } from "./config/deploy-output.js";
import { startAlto } from "./services/bundler/alto.js";
import { createBundlerRouter } from "./interfaces/api/routes/bundler.js";
import { createPaymasterSigner } from "./services/paymaster/signer.js";
import { createPaymasterRouter } from "./interfaces/api/routes/paymaster.js";
import { initDatabase } from "./infrastructure/database/connection.js";
import deviceAuthRouter from "./interfaces/api/routes/device-auth.js";
import oauthRouter from "./interfaces/api/routes/oauth.js";
import { createCirclesRouter } from "./interfaces/api/routes/circles.js";
import mcpRouter from "./interfaces/mcp/server.js";
import { createProposalsRouter } from "./interfaces/api/routes/proposals.js";
import { createStrategiesRouter } from "./interfaces/api/routes/strategies.js";

dotenv.config();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const BACKEND_PORT = process.env.BACKEND_PORT || 4848;

async function boot() {
  // Initialize database
  await initDatabase();
  console.log(`[xylkstream-server]: database initialized`);

  const executorKey = process.env.BUNDLER_EXECUTOR_KEY;
  const paymasterSigners = new Map();

  for (const chain of chains) {
    console.log(`[xylkstream-server]: loading chain=${chain.name} (${chain.rpc})`);

    const deployOutput = loadDeployOutput(chain.name);
    const entryPoint = deployOutput ? getEntryPointAddress(deployOutput) : null;

    if (entryPoint && executorKey) {
      await startAlto(chain.name, {
        entryPointAddress: entryPoint,
        rpcUrl: chain.rpc,
        executorPrivateKey: executorKey,
        port: 0,
      });
    } else {
      console.warn(`[xylkstream-server]: bundler disabled for ${chain.name} —`, !deployOutput ? "no deploy output" : !entryPoint ? "no EntryPoint" : "BUNDLER_EXECUTOR_KEY not set");
    }

    if (deployOutput && executorKey) {
      const paymasterAddr = deployOutput.scopes.paymaster?.contracts?.verifyingPaymaster;
      if (paymasterAddr) {
        const signer = createPaymasterSigner(executorKey as Hex, paymasterAddr as Hex);
        paymasterSigners.set(chain.name, signer);
        console.log(`[xylkstream-server]: paymaster active for ${chain.name} (${paymasterAddr})`);
      }
    }
  }

  app.use("/bundler", createBundlerRouter());
  app.use("/paymaster", createPaymasterRouter(paymasterSigners));
  app.use("/device-auth", deviceAuthRouter);
  app.use("/oauth", oauthRouter);
  app.use("/circles", createCirclesRouter());

  // OAuth 2.0 Authorization Server Metadata (RFC 8414)
  const serverUrl = process.env.SERVER_URL || `http://localhost:${BACKEND_PORT}`;
  app.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.json({
      issuer: serverUrl,
      authorization_endpoint: `${serverUrl}/oauth/authorize`,
      token_endpoint: `${serverUrl}/oauth/token`,
      registration_endpoint: `${serverUrl}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });

  // MCP Auth Specification: Protected Resource Metadata
  app.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json({
      resource: `${serverUrl}/mcp`,
      authorization_servers: [serverUrl],
      scopes_supported: ["mcp"],
      bearer_methods_supported: ["header"],
    });
  });
  app.use("/mcp", mcpRouter);
  app.use("/proposals", createProposalsRouter());
  app.use("/strategies", createStrategiesRouter());

  const server = http.createServer(app);
  server.listen(BACKEND_PORT, () => {
    console.log(`[xylkstream-server]: running at http://localhost:${BACKEND_PORT}`);
  });
}

boot().catch((err) => {
  console.error("[xylkstream-server]: fatal boot error", err);
  process.exit(1);
});
