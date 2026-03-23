import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("@/infrastructure/database/connection.js", () => ({
  getDatabase: vi.fn(),
  initDatabase: vi.fn(),
}));

import { getDatabase } from "@/infrastructure/database/connection.js";
import { yieldboxService, compileSolidity } from "@/services/yieldbox/yieldbox-service.js";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import type { DB } from "@/infrastructure/database/schema.js";
import { up as migration0001 } from "@/infrastructure/database/migrations/0001-initial.js";
import { up as migration0002 } from "@/infrastructure/database/migrations/0002-strategy-tests.js";

const SIMPLE_CONTRACT = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Adder {
  function add(uint256 a, uint256 b) public pure returns (uint256) {
    return a + b;
  }

  function multiply(uint256 a, uint256 b) public pure returns (uint256) {
    return a * b;
  }
}
`;

const BAD_CONTRACT = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Broken {
  function oops() public {
    undeclaredVariable = 1;
  }
}
`;

let db: Kysely<DB>;

beforeAll(async () => {
  const sqliteDb = new Database(":memory:");
  sqliteDb.pragma("foreign_keys = ON");

  db = new Kysely<DB>({
    dialect: new SqliteDialect({ database: sqliteDb }),
  });

  await migration0001(db);
  await migration0002(db);
  vi.mocked(getDatabase).mockReturnValue(db);

  await db.insertInto("users").values({ privy_did: "test-yieldbox-user" }).execute();
});

afterAll(async () => {
  await db.destroy();
});

// ---------------------------------------------------------------------------
// compileSolidity (pure function, no DB)
// ---------------------------------------------------------------------------
describe("compileSolidity", () => {
  it("compiles valid Solidity and returns bytecode + abi", () => {
    const result = compileSolidity(SIMPLE_CONTRACT);

    expect(result.success).toBe(true);
    expect(result.bytecode).toBeTruthy();
    expect(result.bytecode!.length).toBeGreaterThan(0);
    expect(result.abi).toBeTruthy();
    expect(result.abi!.length).toBeGreaterThan(0);

    const fns = result.abi!.filter((e) => e.type === "function");
    expect(fns.map((f: any) => f.name).sort()).toEqual(["add", "multiply"]);
  });

  it("returns errors for invalid Solidity", () => {
    const result = compileSolidity(BAD_CONTRACT);

    expect(result.success).toBe(false);
    expect(result.bytecode).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// submitStrategy + compileStrategy (DB round-trip)
// ---------------------------------------------------------------------------
describe("submitStrategy", () => {
  it("inserts a strategy and compiles it", async () => {
    const strategy = await yieldboxService.submitStrategy(1, "Adder", SIMPLE_CONTRACT);

    expect(strategy.id).toBeTypeOf("number");
    expect(strategy.name).toBe("Adder");
    expect(strategy.status).toBe("pending");

    // compileStrategy fires async — wait for it
    await new Promise((r) => setTimeout(r, 500));

    const compiled = await yieldboxService.getStrategy(strategy.id, 1);
    expect(compiled).toBeDefined();
    expect(compiled!.status).toBe("compiled");
    expect(compiled!.bytecode).toBeTruthy();
    expect(compiled!.abi_json).toBeTruthy();
  });

  it("marks strategy as failed for bad source code", async () => {
    const strategy = await yieldboxService.submitStrategy(1, "Broken", BAD_CONTRACT);

    await new Promise((r) => setTimeout(r, 500));

    const failed = await yieldboxService.getStrategy(strategy.id, 1);
    expect(failed).toBeDefined();
    expect(failed!.status).toBe("failed");
    expect(failed!.errors).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// testStrategy (full e2e: compile → workerd sandbox → EVM deploy + call)
// ---------------------------------------------------------------------------
describe("testStrategy (workerd e2e)", () => {
  it("deploys and calls view functions in workerd sandbox", async () => {
    // Submit and wait for compilation
    const strategy = await yieldboxService.submitStrategy(1, "AdderE2E", SIMPLE_CONTRACT);
    await new Promise((r) => setTimeout(r, 500));

    const compiled = await yieldboxService.getStrategy(strategy.id, 1);
    expect(compiled!.status).toBe("compiled");

    // Run tests in workerd
    await yieldboxService.testStrategy(strategy.id, 1);

    const tested = await yieldboxService.getStrategy(strategy.id, 1);
    expect(tested!.test_status).toBe("passed");
    expect(tested!.test_results_json).toBeTruthy();

    const results = typeof tested!.test_results_json === "string"
      ? JSON.parse(tested!.test_results_json)
      : tested!.test_results_json;

    expect(results.pass).toBe(true);
    expect(results.deploy.address).toBeTruthy();
    expect(results.deploy.gasUsed).toBeGreaterThan(0);
    expect(results.calls.length).toBe(2); // add + multiply
    expect(results.calls.every((c: any) => c.success)).toBe(true);
  }, 30_000);

  it("runs a custom test script in workerd", async () => {
    const strategy = await yieldboxService.submitStrategy(1, "AdderCustom", SIMPLE_CONTRACT);
    await new Promise((r) => setTimeout(r, 500));

    const customScript = `export default {
  async fetch(request, env) {
    const deploy = await env.evm.deploy();
    if (!deploy.success) return Response.json({ pass: false, reason: deploy.revert });

    const result = await env.evm.call("add", [3n, 7n]);
    const pass = result.success && result.result === "10";

    return Response.json({
      pass,
      deploy: { address: deploy.address, gasUsed: deploy.gasUsed },
      addResult: result.result,
    });
  }
};`;

    await yieldboxService.testStrategy(strategy.id, 1, customScript);

    const tested = await yieldboxService.getStrategy(strategy.id, 1);
    expect(tested!.test_status).toBe("passed");

    const results = typeof tested!.test_results_json === "string"
      ? JSON.parse(tested!.test_results_json)
      : tested!.test_results_json;

    expect(results.pass).toBe(true);
    expect(results.addResult).toBe("10");
  }, 30_000);

  it("marks test as failed when worker script returns pass:false", async () => {
    const strategy = await yieldboxService.submitStrategy(1, "AdderFailTest", SIMPLE_CONTRACT);
    await new Promise((r) => setTimeout(r, 500));

    const failScript = `export default {
  async fetch(request, env) {
    const deploy = await env.evm.deploy();
    return Response.json({ pass: false, reason: "intentional failure" });
  }
};`;

    await yieldboxService.testStrategy(strategy.id, 1, failScript);

    const tested = await yieldboxService.getStrategy(strategy.id, 1);
    expect(tested!.test_status).toBe("failed");

    const results = typeof tested!.test_results_json === "string"
      ? JSON.parse(tested!.test_results_json)
      : tested!.test_results_json;

    expect(results.pass).toBe(false);
    expect(results.reason).toBe("intentional failure");
  }, 30_000);

  it("rejects testing an uncompiled strategy", async () => {
    const strategy = await yieldboxService.submitStrategy(1, "NotCompiled", BAD_CONTRACT);
    await new Promise((r) => setTimeout(r, 500));

    await expect(
      yieldboxService.testStrategy(strategy.id, 1),
    ).rejects.toThrow("Strategy must be compiled before testing");
  });
});

// ---------------------------------------------------------------------------
// listStrategies / updateDeployAddress
// ---------------------------------------------------------------------------
describe("listStrategies", () => {
  it("returns all strategies for a user", async () => {
    const strategies = await yieldboxService.listStrategies(1);
    expect(strategies.length).toBeGreaterThanOrEqual(3);
    expect(strategies[0].created_at).toBeDefined();
  });

  it("returns empty for unknown user", async () => {
    const strategies = await yieldboxService.listStrategies(999);
    expect(strategies).toEqual([]);
  });
});

describe("updateDeployAddress", () => {
  it("updates deploy address for a compiled strategy", async () => {
    const strategies = await yieldboxService.listStrategies(1);
    const compiled = strategies.find((s) => s.status === "compiled");
    expect(compiled).toBeDefined();

    const updated = await yieldboxService.updateDeployAddress(
      compiled!.id,
      1,
      "0x1234567890abcdef1234567890abcdef12345678",
    );
    expect(updated).toBe(true);

    const found = await yieldboxService.getStrategy(compiled!.id, 1);
    expect(found!.deployment_address).toBe("0x1234567890abcdef1234567890abcdef12345678");
  });

  it("returns false for a failed strategy", async () => {
    const strategies = await yieldboxService.listStrategies(1);
    const failed = strategies.find((s) => s.status === "failed");
    expect(failed).toBeDefined();

    const updated = await yieldboxService.updateDeployAddress(failed!.id, 1, "0xabc");
    expect(updated).toBe(false);
  });
});
