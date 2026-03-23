import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { Express } from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Mock the alto service so we control what getAltoPort returns without
// actually starting a bundler process.
// ---------------------------------------------------------------------------
vi.mock("../../../../../src/services/bundler/alto.js", () => ({
  getAltoPort: vi.fn(),
}));

import { getAltoPort } from "../../../../../src/services/bundler/alto.js";
import { createBundlerRouter } from "../../../../../src/interfaces/api/routes/bundler.js";

const mockedGetAltoPort = vi.mocked(getAltoPort);

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/bundler", createBundlerRouter());
  return app;
}

describe("POST /bundler/:chain — unknown chain", () => {
  let app: Express;

  beforeEach(() => {
    vi.resetAllMocks();
    app = buildApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 503 when the chain has no registered bundler port", async () => {
    mockedGetAltoPort.mockReturnValue(null);

    const res = await request(app)
      .post("/bundler/unknown-chain")
      .send({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 });

    expect(res.status).toBe(503);
  });

  it("returns a JSON-RPC error envelope with the chain name in the message", async () => {
    mockedGetAltoPort.mockReturnValue(null);

    const res = await request(app)
      .post("/bundler/my-chain")
      .send({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 42 });

    expect(res.body).toMatchObject({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: expect.stringContaining("my-chain"),
      },
    });
  });

  it("echoes the request id in the error envelope", async () => {
    mockedGetAltoPort.mockReturnValue(null);

    const res = await request(app)
      .post("/bundler/some-chain")
      .send({ jsonrpc: "2.0", id: 99 });

    expect(res.body.id).toBe(99);
  });

  it("sets id to null when the request body carries no id", async () => {
    mockedGetAltoPort.mockReturnValue(null);

    const res = await request(app)
      .post("/bundler/some-chain")
      .send({ jsonrpc: "2.0", method: "eth_chainId" });

    expect(res.body.id).toBeNull();
  });
});

describe("POST /bundler/:chain — known chain, upstream bundler available", () => {
  let app: Express;

  beforeEach(() => {
    vi.resetAllMocks();
    app = buildApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("proxies the upstream bundler response and returns 200", async () => {
    const BUNDLER_PORT = 14337;
    mockedGetAltoPort.mockReturnValue(BUNDLER_PORT);

    const upstreamResponse = { jsonrpc: "2.0", result: "0x38", id: 1 };

    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(upstreamResponse), { status: 200 })
      );

    const res = await request(app)
      .post("/bundler/localhost")
      .send({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ result: "0x38" });

    expect(fetchSpy).toHaveBeenCalledWith(
      `http://localhost:${BUNDLER_PORT}`,
      expect.objectContaining({ method: "POST" })
    );

    fetchSpy.mockRestore();
  });

  it("returns 503 when the upstream bundler fetch throws", async () => {
    mockedGetAltoPort.mockReturnValue(14338);

    vi.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await request(app)
      .post("/bundler/localhost")
      .send({ jsonrpc: "2.0", id: 5 });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe(-32000);
  });
});
