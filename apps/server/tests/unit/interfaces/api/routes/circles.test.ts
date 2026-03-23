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
import { createCirclesRouter } from "../../../../../src/interfaces/api/routes/circles.js";
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
  a.use("/circles", createCirclesRouter());
  return a;
}

beforeAll(async () => {
  // Create an in-memory SQLite database and run the real migration.
  const sqliteDb = new Database(":memory:");
  sqliteDb.pragma("foreign_keys = ON");

  db = new Kysely<DB>({
    dialect: new SqliteDialect({ database: sqliteDb }),
  });

  await up(db);

  // Point getDatabase() at our in-memory instance.
  vi.mocked(getDatabase).mockReturnValue(db);

  // Seed a test user (id will be 1 since autoincrement starts at 1).
  await db
    .insertInto("users")
    .values({ privy_did: "test-user" })
    .execute();

  app = buildApp();
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(() => {
  // Default: authenticated as user 1 for every test; individual tests may override.
  vi.mocked(authService.verifyPrivyToken).mockResolvedValue({ userId: 1 });
});

// ---------------------------------------------------------------------------
// Helper: authenticated POST/GET shortcuts
// ---------------------------------------------------------------------------
function authedPost(path: string, body: object) {
  return request(app)
    .post(path)
    .set("Authorization", "Bearer test-token")
    .send(body);
}

function authedGet(path: string) {
  return request(app).get(path).set("Authorization", "Bearer test-token");
}

// ---------------------------------------------------------------------------
// POST /circles — create circle
// ---------------------------------------------------------------------------
describe("POST /circles — create circle", () => {
  it("returns 201 with circle data when given valid fields", async () => {
    const res = await authedPost("/circles", {
      name: "Family Treasury",
      inviteCode: "invite-abc",
      encryptionPubKey: "pubkey-abc",
    });

    expect(res.status).toBe(201);
    expect(res.body.circle).toMatchObject({
      name: "Family Treasury",
      invite_code: "invite-abc",
      encryption_pubkey: "pubkey-abc",
      owner_user_id: 1,
    });
    expect(res.body.circle.id).toBeTypeOf("number");
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await authedPost("/circles", {
      name: "Only Name",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it("returns 401 when no Authorization header is provided", async () => {
    const res = await request(app)
      .post("/circles")
      .send({ name: "X", inviteCode: "y", encryptionPubKey: "z" });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /circles — list circles
// ---------------------------------------------------------------------------
describe("GET /circles — list circles", () => {
  it("returns an empty array when the owner has no circles", async () => {
    // Insert a second user who owns nothing.
    await db.insertInto("users").values({ privy_did: "empty-user" }).execute();
    const emptyUser = await db
      .selectFrom("users")
      .select("id")
      .where("privy_did", "=", "empty-user")
      .executeTakeFirstOrThrow();

    vi.mocked(authService.verifyPrivyToken).mockResolvedValue({
      userId: emptyUser.id,
    });

    const res = await authedGet("/circles");

    expect(res.status).toBe(200);
    expect(res.body.circles).toEqual([]);
  });

  it("returns circles with member_count after creation", async () => {
    vi.mocked(authService.verifyPrivyToken).mockResolvedValue({ userId: 1 });

    // Ensure at least one circle for user 1 (created in the POST test above).
    const res = await authedGet("/circles");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.circles)).toBe(true);

    const circle = res.body.circles.find(
      (c: { invite_code: string }) => c.invite_code === "invite-abc",
    );
    expect(circle).toBeDefined();
    expect(circle).toHaveProperty("member_count");
    expect(typeof circle.member_count).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// GET /circles/validate/:inviteCode — public validation
// ---------------------------------------------------------------------------
describe("GET /circles/validate/:inviteCode — public endpoint", () => {
  it("returns circle info for a valid invite code (no auth required)", async () => {
    const res = await request(app).get("/circles/validate/invite-abc");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: "Family Treasury",
      encryptionPubkey: "pubkey-abc",
    });
    expect(res.body.circleId).toBeTypeOf("number");
  });

  it("returns 404 for an unknown invite code", async () => {
    const res = await request(app).get("/circles/validate/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// POST /circles/join — join a circle
// ---------------------------------------------------------------------------
describe("POST /circles/join — join circle", () => {
  it("successfully joins a circle with a valid invite code", async () => {
    // Add a second user who will be the joiner.
    await db.insertInto("users").values({ privy_did: "joiner-user" }).execute();
    const joiner = await db
      .selectFrom("users")
      .select("id")
      .where("privy_did", "=", "joiner-user")
      .executeTakeFirstOrThrow();

    vi.mocked(authService.verifyPrivyToken).mockResolvedValue({
      userId: joiner.id,
    });

    const res = await authedPost("/circles/join", {
      inviteCode: "invite-abc",
      encryptedStealthAddress: "0xstealth",
      ephemeralPubKey: "0xephemeral",
    });

    expect(res.status).toBe(201);
    expect(res.body.member).toMatchObject({
      user_id: joiner.id,
      encrypted_stealth_address: "0xstealth",
      ephemeral_pubkey: "0xephemeral",
    });
    expect(res.body.circle).toMatchObject({ name: "Family Treasury" });
  });

  it("is idempotent — duplicate join returns the existing member", async () => {
    const joiner = await db
      .selectFrom("users")
      .select("id")
      .where("privy_did", "=", "joiner-user")
      .executeTakeFirstOrThrow();

    vi.mocked(authService.verifyPrivyToken).mockResolvedValue({
      userId: joiner.id,
    });

    const res = await authedPost("/circles/join", {
      inviteCode: "invite-abc",
      encryptedStealthAddress: "0xstealth",
      ephemeralPubKey: "0xephemeral",
    });

    expect(res.status).toBe(201);
    // Same member id as the first join.
    expect(res.body.member.user_id).toBe(joiner.id);
  });

  it("returns 404 for an invalid invite code", async () => {
    const res = await authedPost("/circles/join", {
      inviteCode: "nonexistent-code",
      encryptedStealthAddress: "0xstealth",
      ephemeralPubKey: "0xephemeral",
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// GET /circles/:id — get circle detail
// ---------------------------------------------------------------------------
describe("GET /circles/:id — circle detail", () => {
  it("returns the circle with its members", async () => {
    vi.mocked(authService.verifyPrivyToken).mockResolvedValue({ userId: 1 });

    // Fetch the circle id for invite-abc.
    const circle = await db
      .selectFrom("circles")
      .select("id")
      .where("invite_code", "=", "invite-abc")
      .executeTakeFirstOrThrow();

    const res = await authedGet(`/circles/${circle.id}`);

    expect(res.status).toBe(200);
    expect(res.body.circle).toMatchObject({ invite_code: "invite-abc" });
    expect(Array.isArray(res.body.members)).toBe(true);
    // The joiner added in the join tests should appear.
    expect(res.body.members.length).toBeGreaterThan(0);
  });

  it("returns 404 for a circle that does not belong to the authenticated user", async () => {
    const circle = await db
      .selectFrom("circles")
      .select("id")
      .where("invite_code", "=", "invite-abc")
      .executeTakeFirstOrThrow();

    // Authenticate as a different user.
    const other = await db
      .selectFrom("users")
      .select("id")
      .where("privy_did", "=", "joiner-user")
      .executeTakeFirstOrThrow();

    vi.mocked(authService.verifyPrivyToken).mockResolvedValue({
      userId: other.id,
    });

    const res = await authedGet(`/circles/${circle.id}`);

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /circles/:id/members/:memberId — remove a member
// ---------------------------------------------------------------------------
describe("DELETE /circles/:id/members/:memberId — remove member", () => {
  it("successfully removes a member and returns { success: true }", async () => {
    vi.mocked(authService.verifyPrivyToken).mockResolvedValue({ userId: 1 });

    const circle = await db
      .selectFrom("circles")
      .select("id")
      .where("invite_code", "=", "invite-abc")
      .executeTakeFirstOrThrow();

    const joiner = await db
      .selectFrom("users")
      .select("id")
      .where("privy_did", "=", "joiner-user")
      .executeTakeFirstOrThrow();

    const member = await db
      .selectFrom("circle_members")
      .select("id")
      .where("circle_id", "=", circle.id)
      .where("user_id", "=", joiner.id)
      .executeTakeFirstOrThrow();

    const res = await request(app)
      .delete(`/circles/${circle.id}/members/${member.id}`)
      .set("Authorization", "Bearer test-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it("returns 404 when the circle does not belong to the authenticated user", async () => {
    const circle = await db
      .selectFrom("circles")
      .select("id")
      .where("invite_code", "=", "invite-abc")
      .executeTakeFirstOrThrow();

    const other = await db
      .selectFrom("users")
      .select("id")
      .where("privy_did", "=", "joiner-user")
      .executeTakeFirstOrThrow();

    vi.mocked(authService.verifyPrivyToken).mockResolvedValue({
      userId: other.id,
    });

    const res = await request(app)
      .delete(`/circles/${circle.id}/members/999`)
      .set("Authorization", "Bearer test-token");

    expect(res.status).toBe(404);
  });
});
