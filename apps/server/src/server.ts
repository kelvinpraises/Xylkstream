import cors from "cors";
import http from "http";
import dotenv from "dotenv";
import express from "express";
import type { Hex } from "viem";
import { chains, loadDeployOutput, getEntryPointAddress } from "./config/deploy-output.js";
import { startAlto } from "./services/bundler/alto.js";
import { createBundlerRouter } from "./interfaces/routes/bundler.js";
import { createPaymasterSigner } from "./services/paymaster/signer.js";
import { createPaymasterRouter } from "./interfaces/routes/paymaster.js";

dotenv.config();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const BACKEND_PORT = process.env.BACKEND_PORT || 4848;

async function boot() {
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

  const server = http.createServer(app);
  server.listen(BACKEND_PORT, () => {
    console.log(`[xylkstream-server]: running at http://localhost:${BACKEND_PORT}`);
  });
}

boot().catch((err) => {
  console.error("[xylkstream-server]: fatal boot error", err);
  process.exit(1);
});
