import fs from "fs";
import path from "path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We need to mock `fs` before importing the module under test because
// `loadDeployOutput` calls `fs.readFileSync` at call-time (not module-load time).
vi.mock("fs");

const mockedFs = vi.mocked(fs);

// Dynamic import is deferred so that the vi.mock() call above is hoisted first.
const { loadDeployOutput, getEntryPointAddress } = await import(
  "../../../src/config/deploy-output.js"
);

const VALID_OUTPUT = {
  chain: "localhost",
  chainId: 31337,
  rpc: "http://127.0.0.1:8545",
  scopes: {
    aa: {
      status: "deployed",
      contracts: {
        entryPoint: "0xEntryPoint1234",
        safeModuleSetup: "0xSafeModuleSetup",
      },
    },
    streaming: {
      status: "deployed",
      contracts: {
        dripsRouter: "0xDripsRouter",
      },
    },
  },
};

describe("loadDeployOutput", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when the deploy output file does not exist", () => {
    mockedFs.readFileSync = vi.fn().mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });

    const result = loadDeployOutput("nonexistent-chain");
    expect(result).toBeNull();
  });

  it("returns null when the file contains invalid JSON", () => {
    mockedFs.readFileSync = vi.fn().mockReturnValue("not-valid-json{{{");

    const result = loadDeployOutput("bad-json-chain");
    expect(result).toBeNull();
  });

  it("parses and returns a valid deploy output", () => {
    mockedFs.readFileSync = vi
      .fn()
      .mockReturnValue(JSON.stringify(VALID_OUTPUT));

    const result = loadDeployOutput("localhost");

    expect(result).not.toBeNull();
    expect(result!.chain).toBe("localhost");
    expect(result!.chainId).toBe(31337);
    expect(result!.rpc).toBe("http://127.0.0.1:8545");
    expect(result!.scopes.aa?.contracts.entryPoint).toBe("0xEntryPoint1234");
  });

  it("reads from the expected file path based on chain name", () => {
    mockedFs.readFileSync = vi
      .fn()
      .mockReturnValue(JSON.stringify(VALID_OUTPUT));

    loadDeployOutput("localhost");

    const calledPath = (mockedFs.readFileSync as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(path.basename(calledPath)).toBe("localhost.json");
    expect(calledPath).toContain(path.join("deploy", "output"));
  });
});

describe("getEntryPointAddress", () => {
  it("returns the entryPoint address when aa scope is present", () => {
    const address = getEntryPointAddress(VALID_OUTPUT);
    expect(address).toBe("0xEntryPoint1234");
  });

  it("returns null when aa scope is absent", () => {
    const output = { ...VALID_OUTPUT, scopes: {} };
    const address = getEntryPointAddress(output);
    expect(address).toBeNull();
  });

  it("returns null when aa scope has no entryPoint contract", () => {
    const output = {
      ...VALID_OUTPUT,
      scopes: { aa: { status: "deployed", contracts: {} } },
    };
    const address = getEntryPointAddress(output);
    expect(address).toBeNull();
  });
});
