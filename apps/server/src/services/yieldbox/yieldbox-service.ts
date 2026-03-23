import { spawn, type ChildProcess } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { getRandomPort } from "get-port-please";

import { getDatabase } from "../../infrastructure/database/connection.js";
import type { Strategy } from "../../infrastructure/database/schema.js";
import { generateCapnp } from "./capnp-generator.js";

const require = createRequire(import.meta.url);
const solc = require("solc");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CompilationResult {
  success: boolean;
  bytecode: string | null;
  abi: any[] | null;
  errors: any[];
}

/**
 * Compile Solidity source using in-process solc-js.
 * No sandbox needed — solc is a deterministic compiler, doesn't execute code.
 */
export function compileSolidity(sourceCode: string): CompilationResult {
  const input = {
    language: "Solidity",
    sources: { "Strategy.sol": { content: sourceCode } },
    settings: {
      outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = output.errors || [];
  const hasErrors = errors.some((e: any) => e.severity === "error");

  if (hasErrors) {
    return { success: false, bytecode: null, abi: null, errors };
  }

  const sourceFile = Object.keys(output.contracts || {})[0];
  const contractName = sourceFile ? Object.keys(output.contracts[sourceFile])[0] : null;
  const contract = contractName ? output.contracts[sourceFile][contractName] : null;

  if (!contract) {
    return {
      success: false,
      bytecode: null,
      abi: null,
      errors: [{ severity: "error", message: "No contract found in output" }],
    };
  }

  return {
    success: true,
    bytecode: contract.evm.bytecode.object,
    abi: contract.abi,
    errors,
  };
}

export const yieldboxService = {
  async submitStrategy(userId: number, name: string, sourceCode: string): Promise<Strategy> {
    const db = getDatabase();
    const strategy = await db
      .insertInto("strategies")
      .values({
        user_id: userId,
        name,
        source_code: sourceCode,
        status: "pending",
        abi_json: null as any,
        bytecode: null,
        errors: null,
        test_status: null,
        test_results_json: null as any,
        deployment_address: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    this.compileStrategy(strategy.id).catch((err) => {
      console.error(`[yieldbox]: compilation failed for strategy ${strategy.id}`, err);
    });

    return strategy;
  },

  async compileStrategy(strategyId: number): Promise<void> {
    const db = getDatabase();

    await db
      .updateTable("strategies")
      .set({ status: "compiling" })
      .where("id", "=", strategyId)
      .execute();

    const strategy = await db
      .selectFrom("strategies")
      .selectAll()
      .where("id", "=", strategyId)
      .executeTakeFirstOrThrow();

    let result: CompilationResult;
    try {
      result = compileSolidity(strategy.source_code);
    } catch (err) {
      result = {
        success: false,
        bytecode: null,
        abi: null,
        errors: [{ severity: "error", message: String(err) }],
      };
    }

    if (result.success) {
      await db
        .updateTable("strategies")
        .set({
          status: "compiled",
          bytecode: result.bytecode,
          abi_json: JSON.stringify(result.abi) as any,
          errors: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
        })
        .where("id", "=", strategyId)
        .execute();
    } else {
      await db
        .updateTable("strategies")
        .set({
          status: "failed",
          errors: JSON.stringify(result.errors),
        })
        .where("id", "=", strategyId)
        .execute();
    }
  },

  /**
   * Test a compiled strategy in a workerd sandbox.
   * The agent's test script is a standard worker entry that accesses env.evm.
   * If no script provided, generates a default one that deploys + calls all view functions.
   */
  async testStrategy(strategyId: number, userId: number, customTestScript?: string): Promise<void> {
    const db = getDatabase();

    const strategy = await db
      .selectFrom("strategies")
      .selectAll()
      .where("id", "=", strategyId)
      .where("user_id", "=", userId)
      .executeTakeFirstOrThrow();

    if (strategy.status !== "compiled" || !strategy.bytecode || !strategy.abi_json) {
      throw new Error("Strategy must be compiled before testing");
    }

    await db
      .updateTable("strategies")
      .set({ test_status: "testing" })
      .where("id", "=", strategyId)
      .execute();

    const abi = typeof strategy.abi_json === "string"
      ? JSON.parse(strategy.abi_json)
      : strategy.abi_json;

    const workerScript = customTestScript || generateDefaultTestScript(abi);

    try {
      const results = await this.runInWorkerd(workerScript, strategy.bytecode, abi);

      await db
        .updateTable("strategies")
        .set({
          test_status: results.pass ? "passed" : "failed",
          test_results_json: JSON.stringify(results) as any,
        })
        .where("id", "=", strategyId)
        .execute();

      console.log(`[yieldbox]: strategy ${strategyId} test ${results.pass ? "passed" : "failed"}`);
    } catch (err) {
      await db
        .updateTable("strategies")
        .set({
          test_status: "failed",
          test_results_json: JSON.stringify({ pass: false, error: String(err) }) as any,
        })
        .where("id", "=", strategyId)
        .execute();
    }
  },

  /**
   * Spawn a workerd process with the EVM extension and run the worker script.
   * The worker script is the agent's test code — a standard ES module worker entry.
   * env.evm is injected via wrapped binding with bytecode + abi as innerBindings.
   */
  async runInWorkerd(workerScript: string, bytecode: string, abi: any[]): Promise<any> {
    const port = await getRandomPort();
    const tempDir = path.join(__dirname, "tmp", `test-${Date.now()}`);
    const configPath = path.join(tempDir, "config.capnp");

    const capnp = generateCapnp({ port, workerScript, bytecode, abi });
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(configPath, capnp);

    let proc: ChildProcess | null = null;

    try {
      proc = spawn("npx", ["workerd", "serve", configPath], { stdio: "pipe" });

      proc.stderr?.on("data", (data) => {
        const msg = data.toString().trim();
        if (msg) console.error(`[yieldbox-workerd]: ${msg}`);
      });

      proc.on("error", (err) => {
        console.error(`[yieldbox]: workerd process error:`, err);
      });

      await this.waitForWorkerdReady(port);

      const response = await fetch(`http://localhost:${port}/`, {
        method: "POST",
        signal: AbortSignal.timeout(60_000),
      });

      return await response.json();
    } finally {
      if (proc && !proc.killed) proc.kill("SIGTERM");
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  },

  async waitForWorkerdReady(port: number, maxAttempts = 30): Promise<void> {
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await fetch(`http://localhost:${port}/`, {
          method: "HEAD",
          signal: AbortSignal.timeout(1000),
        });
        return;
      } catch {
        if (attempt === maxAttempts) {
          throw new Error(`workerd failed to start on port ${port} after ${maxAttempts} attempts`);
        }
        await delay(100);
      }
    }
  },

  async getStrategy(strategyId: number, userId: number): Promise<Strategy | undefined> {
    const db = getDatabase();
    return await db
      .selectFrom("strategies")
      .selectAll()
      .where("id", "=", strategyId)
      .where("user_id", "=", userId)
      .executeTakeFirst();
  },

  async listStrategies(userId: number): Promise<Strategy[]> {
    const db = getDatabase();
    return await db
      .selectFrom("strategies")
      .selectAll()
      .where("user_id", "=", userId)
      .orderBy("created_at", "desc")
      .execute();
  },

  async updateDeployAddress(strategyId: number, userId: number, address: string): Promise<boolean> {
    const db = getDatabase();
    const result = await db
      .updateTable("strategies")
      .set({ deployment_address: address })
      .where("id", "=", strategyId)
      .where("user_id", "=", userId)
      .where("status", "=", "compiled")
      .execute();
    return result.length > 0 && Number(result[0].numUpdatedRows) > 0;
  },
};

/**
 * Generate a default test worker script.
 * This is a standard worker entry that uses env.evm to deploy + call all view/pure functions.
 */
function generateDefaultTestScript(abi: any[]): string {
  const functions = abi.filter((e: any) => e.type === "function");
  const viewFns = functions.filter(
    (f: any) => f.stateMutability === "view" || f.stateMutability === "pure",
  );

  const callLines = viewFns.map((f: any) => {
    const defaultArgs = f.inputs.map((inp: any) => {
      if (inp.type.startsWith("uint") || inp.type.startsWith("int")) return "0n";
      if (inp.type === "address") return '"0x0000000000000000000000000000000000000001"';
      if (inp.type === "bool") return "false";
      if (inp.type === "string") return '""';
      if (inp.type.startsWith("bytes")) return '"0x"';
      return "null";
    });
    return `  calls.push({ fn: "${f.name}", ...(await env.evm.call("${f.name}", [${defaultArgs.join(", ")}])) });`;
  });

  return `export default {
  async fetch(request, env) {
    const deploy = await env.evm.deploy();
    if (!deploy.success) {
      return Response.json({ pass: false, deploy, calls: [], reason: "deploy failed: " + deploy.revert });
    }

    const calls = [];
${callLines.join("\n")}

    const failed = calls.filter(c => !c.success);
    return Response.json({
      pass: failed.length === 0,
      deploy: { address: deploy.address, gasUsed: deploy.gasUsed },
      calls,
      totalGas: deploy.gasUsed + calls.reduce((s, c) => s + c.gasUsed, 0),
      reason: failed.length > 0 ? failed.map(f => f.fn + ": " + f.revert).join(", ") : null,
    });
  }
};
`;
}
