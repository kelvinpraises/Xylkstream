import { describe, it, expect, beforeEach } from "vitest";

// Import the module under test. Because `instances` is module-level state we
// re-import a fresh copy for each test file run; within a single file we use
// beforeEach to reset state via the exported helpers where possible, and rely
// on test ordering for the incremental-port assertions.
import {
  assignPort,
  getAltoPort,
} from "../../../../src/services/bundler/alto.js";

// The module keeps a private `instances` Map. There is no exported reset, so
// we work with the module's natural behaviour: each unique chain name is
// independent, and ports increment from BASE_PORT (4337).

describe("assignPort", () => {
  // Note: the module-level Map persists across tests within the same file.
  // We use distinct chain names per test so tests don't interfere with each other.

  it("assigns BASE_PORT (4337) to the first chain registered", () => {
    const port = assignPort("test-chain-alpha");
    expect(port).toBe(4337);
  });

  it("assigns an incrementing port to each new chain", () => {
    // "test-chain-alpha" was already registered above, so size >= 1
    const portA = assignPort("test-chain-beta");
    const portB = assignPort("test-chain-gamma");

    // Ports must be distinct and both >= BASE_PORT
    expect(portA).toBeGreaterThanOrEqual(4337);
    expect(portB).toBeGreaterThanOrEqual(4337);
    expect(portB).not.toBe(portA);
  });

  it("returns the same port for the same chain on repeated calls", () => {
    const first = assignPort("test-chain-idempotent");
    const second = assignPort("test-chain-idempotent");
    expect(second).toBe(first);
  });
});

describe("getAltoPort", () => {
  it("returns null for a chain that has never been registered", () => {
    const port = getAltoPort("completely-unknown-chain-xyz");
    expect(port).toBeNull();
  });

  it("returns the assigned port after assignPort is called", () => {
    const assigned = assignPort("test-chain-delta");
    const retrieved = getAltoPort("test-chain-delta");
    expect(retrieved).toBe(assigned);
  });

  it("returns null for a chain name that is similar but not identical", () => {
    assignPort("test-chain-epsilon");
    expect(getAltoPort("test-chain-EPSILON")).toBeNull();
    expect(getAltoPort("test-chain-epsilon ")).toBeNull(); // trailing space
  });
});
