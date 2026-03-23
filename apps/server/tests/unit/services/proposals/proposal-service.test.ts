import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("../../../../src/infrastructure/database/connection.js", () => ({
  getDatabase: vi.fn(),
  initDatabase: vi.fn(),
}));

import { getDatabase } from "../../../../src/infrastructure/database/connection.js";
import { proposalService } from "../../../../src/services/proposals/proposal-service.js";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import type { DB } from "../../../../src/infrastructure/database/schema.js";
import { up } from "../../../../src/infrastructure/database/migrations/0001-initial.js";

let db: Kysely<DB>;

beforeAll(async () => {
  const sqliteDb = new Database(":memory:");
  sqliteDb.pragma("foreign_keys = ON");

  db = new Kysely<DB>({
    dialect: new SqliteDialect({ database: sqliteDb }),
  });

  await up(db);
  vi.mocked(getDatabase).mockReturnValue(db);

  // Seed a test user.
  await db.insertInto("users").values({ privy_did: "test-user" }).execute();
});

afterAll(async () => {
  await db.destroy();
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------
describe("proposalService.create", () => {
  it("creates a proposal with status 'pending' by default", async () => {
    const proposal = await proposalService.create({
      userId: 1,
      type: "adjust_stream",
      paramsJson: { streamId: "s1", newRate: "100" },
      agentReason: "Rate is too low",
    });

    expect(proposal.id).toBeTypeOf("number");
    expect(proposal.user_id).toBe(1);
    expect(proposal.type).toBe("adjust_stream");
    expect(proposal.status).toBe("pending");
    expect(proposal.agent_reason).toBe("Rate is too low");
  });

  it("creates a proposal with explicit 'executed' status for thoughts", async () => {
    const proposal = await proposalService.create({
      userId: 1,
      type: "thought",
      paramsJson: { thought: "Analyzing portfolio" },
      agentReason: "Analyzing portfolio",
      status: "executed",
    });

    expect(proposal.status).toBe("executed");
    expect(proposal.type).toBe("thought");
  });
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------
describe("proposalService.list", () => {
  it("returns all proposals for a user", async () => {
    const proposals = await proposalService.list(1);

    expect(Array.isArray(proposals)).toBe(true);
    expect(proposals.length).toBeGreaterThanOrEqual(2);
  });

  it("filters by status", async () => {
    const pending = await proposalService.list(1, "pending");

    expect(pending.every((p) => p.status === "pending")).toBe(true);
    expect(pending.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty array for a user with no proposals", async () => {
    await db.insertInto("users").values({ privy_did: "no-proposals" }).execute();
    const noProposalsUser = await db
      .selectFrom("users")
      .select("id")
      .where("privy_did", "=", "no-proposals")
      .executeTakeFirstOrThrow();

    const proposals = await proposalService.list(noProposalsUser.id);
    expect(proposals).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getById
// ---------------------------------------------------------------------------
describe("proposalService.getById", () => {
  it("returns a proposal owned by the user", async () => {
    const created = await proposalService.create({
      userId: 1,
      type: "collect",
      paramsJson: { streamId: "s2" },
      agentReason: "Time to collect",
    });

    const found = await proposalService.getById(created.id, 1);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
  });

  it("returns undefined for a proposal owned by another user", async () => {
    const created = await proposalService.create({
      userId: 1,
      type: "collect",
      paramsJson: { streamId: "s3" },
      agentReason: "Collect",
    });

    const found = await proposalService.getById(created.id, 999);
    expect(found).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// updateStatus
// ---------------------------------------------------------------------------
describe("proposalService.updateStatus", () => {
  it("updates status from pending to approved", async () => {
    const created = await proposalService.create({
      userId: 1,
      type: "adjust_stream",
      paramsJson: { streamId: "s4", newRate: "200" },
      agentReason: "Increase rate",
    });

    const updated = await proposalService.updateStatus(created.id, 1, "approved");
    expect(updated).toBe(true);

    const found = await proposalService.getById(created.id, 1);
    expect(found!.status).toBe("approved");
  });

  it("sets executed_at when status is 'executed'", async () => {
    const created = await proposalService.create({
      userId: 1,
      type: "collect",
      paramsJson: { streamId: "s5" },
      agentReason: "Collect now",
    });

    await proposalService.updateStatus(created.id, 1, "executed");

    const found = await proposalService.getById(created.id, 1);
    expect(found!.status).toBe("executed");
    expect(found!.executed_at).not.toBeNull();
  });

  it("returns false when proposal does not belong to user", async () => {
    const created = await proposalService.create({
      userId: 1,
      type: "collect",
      paramsJson: { streamId: "s6" },
      agentReason: "Collect",
    });

    const updated = await proposalService.updateStatus(created.id, 999, "rejected");
    expect(updated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// countPending
// ---------------------------------------------------------------------------
describe("proposalService.countPending", () => {
  it("returns the correct count of pending proposals", async () => {
    const count = await proposalService.countPending(1);

    // There should be at least 1 pending proposal from earlier tests.
    expect(count).toBeGreaterThanOrEqual(1);
    expect(typeof count).toBe("number");
  });

  it("returns 0 for a user with no pending proposals", async () => {
    const user = await db
      .selectFrom("users")
      .select("id")
      .where("privy_did", "=", "no-proposals")
      .executeTakeFirstOrThrow();

    const count = await proposalService.countPending(user.id);
    expect(count).toBe(0);
  });
});
