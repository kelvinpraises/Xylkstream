import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import express, { Express } from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Mock auth service and database connection before any imports that use them.
// ---------------------------------------------------------------------------
vi.mock("../../../../../src/services/auth/auth-service.js", () => ({
  authService: {
    verifyPrivyToken: vi.fn(),
  },
}));

vi.mock("../../../../../src/infrastructure/database/connection.js", () => ({
  getDatabase: vi.fn(),
  initDatabase: vi.fn(),
}));

import { authService } from "../../../../../src/services/auth/auth-service.js";
import { getDatabase } from "../../../../../src/infrastructure/database/connection.js";
import { createProposalsRouter } from "../../../../../src/interfaces/api/routes/proposals.js";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import type { DB } from "../../../../../src/infrastructure/database/schema.js";
import { up } from "../../../../../src/infrastructure/database/migrations/0001-initial.js";

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------
let app: Express;
let db: Kysely<DB>;

function buildApp(): Express {
  const a = express();
  a.use(express.json());
  a.use("/proposals", createProposalsRouter());
  return a;
}

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

  // Seed some proposals.
  await db
    .insertInto("proposals")
    .values([
      {
        user_id: 1,
        type: "adjust_stream",
        params_json: JSON.stringify({ streamId: "s1", newRate: "100" }) as any,
        status: "pending",
        agent_reason: "Rate is too low",
      },
      {
        user_id: 1,
        type: "collect",
        params_json: JSON.stringify({ streamId: "s2" }) as any,
        status: "pending",
        agent_reason: "Time to collect",
      },
      {
        user_id: 1,
        type: "thought",
        params_json: JSON.stringify({ thought: "Analyzing" }) as any,
        status: "executed",
        agent_reason: "Analyzing portfolio",
      },
    ])
    .execute();

  app = buildApp();
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(() => {
  vi.mocked(authService.verifyPrivyToken).mockResolvedValue({ userId: 1 });
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function authedGet(path: string) {
  return request(app).get(path).set("Authorization", "Bearer test-token");
}

function authedPatch(path: string, body: object) {
  return request(app)
    .patch(path)
    .set("Authorization", "Bearer test-token")
    .send(body);
}

// ---------------------------------------------------------------------------
// GET /proposals — list proposals
// ---------------------------------------------------------------------------
describe("GET /proposals — list proposals", () => {
  it("returns all proposals for the authenticated user", async () => {
    const res = await authedGet("/proposals");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.proposals)).toBe(true);
    expect(res.body.proposals.length).toBe(3);
  });

  it("filters by status query param", async () => {
    const res = await authedGet("/proposals?status=pending");

    expect(res.status).toBe(200);
    expect(res.body.proposals.length).toBe(2);
    expect(res.body.proposals.every((p: any) => p.status === "pending")).toBe(true);
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/proposals");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /proposals/count — pending count
// ---------------------------------------------------------------------------
describe("GET /proposals/count — pending count", () => {
  it("returns the count of pending proposals", async () => {
    const res = await authedGet("/proposals/count");

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// PATCH /proposals/:id/status — update status
// ---------------------------------------------------------------------------
describe("PATCH /proposals/:id/status — update proposal status", () => {
  it("approves a pending proposal", async () => {
    // Get a pending proposal id.
    const listRes = await authedGet("/proposals?status=pending");
    const proposalId = listRes.body.proposals[0].id;

    const res = await authedPatch(`/proposals/${proposalId}/status`, {
      status: "approved",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("rejects a pending proposal", async () => {
    const listRes = await authedGet("/proposals?status=pending");
    const proposalId = listRes.body.proposals[0].id;

    const res = await authedPatch(`/proposals/${proposalId}/status`, {
      status: "rejected",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 400 for invalid status", async () => {
    const res = await authedPatch("/proposals/1/status", {
      status: "invalid",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid status/i);
  });

  it("returns 404 for non-existent proposal", async () => {
    const res = await authedPatch("/proposals/99999/status", {
      status: "approved",
    });

    expect(res.status).toBe(404);
  });

  it("returns 401 without auth", async () => {
    const res = await request(app)
      .patch("/proposals/1/status")
      .send({ status: "approved" });
    expect(res.status).toBe(401);
  });
});
