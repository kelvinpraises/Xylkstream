import { describe, it, expect } from "vitest";
import nacl from "tweetnacl";
import {
  keypairFromSeed,
  encryptForCircle,
  decryptFromCircle,
  toHex,
  fromHex,
  encryptStealthAddress,
  decryptStealthAddress,
} from "../../../../client/src/utils/circle-crypto";

describe("toHex / fromHex", () => {
  it("round-trips arbitrary bytes", () => {
    const original = new Uint8Array([0, 1, 127, 128, 255]);
    expect(fromHex(toHex(original))).toEqual(original);
  });

  it("encodes a known value", () => {
    expect(toHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe("deadbeef");
  });

  it("handles empty input", () => {
    expect(toHex(new Uint8Array([]))).toBe("");
    expect(fromHex("")).toEqual(new Uint8Array([]));
  });
});

describe("keypairFromSeed", () => {
  it("returns 32-byte publicKey and secretKey", () => {
    const seed = nacl.randomBytes(32);
    const kp = keypairFromSeed(seed);
    expect(kp.publicKey.length).toBe(32);
    expect(kp.secretKey.length).toBe(32);
  });

  it("is deterministic — same seed yields same keypair", () => {
    const seed = nacl.randomBytes(32);
    const a = keypairFromSeed(seed);
    const b = keypairFromSeed(seed);
    expect(toHex(a.publicKey)).toBe(toHex(b.publicKey));
    expect(toHex(a.secretKey)).toBe(toHex(b.secretKey));
  });

  it("different seeds yield different keypairs", () => {
    const a = keypairFromSeed(nacl.randomBytes(32));
    const b = keypairFromSeed(nacl.randomBytes(32));
    expect(toHex(a.publicKey)).not.toBe(toHex(b.publicKey));
  });
});

describe("encryptForCircle / decryptFromCircle", () => {
  it("round-trips a message", () => {
    const owner = nacl.box.keyPair();
    const ephemeral = nacl.box.keyPair();
    const message = new Uint8Array([1, 2, 3, 4, 5]);

    const { ciphertext, nonce } = encryptForCircle(
      message,
      owner.publicKey,
      ephemeral.secretKey,
    );

    const decrypted = decryptFromCircle(
      ciphertext,
      nonce,
      ephemeral.publicKey,
      owner.secretKey,
    );

    expect(decrypted).toEqual(message);
  });

  it("throws with wrong key", () => {
    const owner = nacl.box.keyPair();
    const ephemeral = nacl.box.keyPair();
    const wrong = nacl.box.keyPair();

    const { ciphertext, nonce } = encryptForCircle(
      new Uint8Array([10, 20]),
      owner.publicKey,
      ephemeral.secretKey,
    );

    expect(() =>
      decryptFromCircle(ciphertext, nonce, ephemeral.publicKey, wrong.secretKey),
    ).toThrow("Decryption failed");
  });
});

describe("encryptStealthAddress / decryptStealthAddress", () => {
  const ownerSeed = new Uint8Array(32).fill(42);
  const owner = keypairFromSeed(ownerSeed);
  const ownerPubHex = toHex(owner.publicKey);
  const testAddress = "0xdead000000000000000000000000000000beef01";

  it("round-trips a stealth address", () => {
    const { encryptedStealthAddress, ephemeralPubKey } = encryptStealthAddress(
      testAddress,
      ownerPubHex,
    );

    const decrypted = decryptStealthAddress(
      encryptedStealthAddress,
      ephemeralPubKey,
      owner.secretKey,
    );

    expect(decrypted.toLowerCase()).toBe(testAddress.toLowerCase());
  });

  it("preserves 0x prefix", () => {
    const { encryptedStealthAddress, ephemeralPubKey } = encryptStealthAddress(
      testAddress,
      ownerPubHex,
    );

    const decrypted = decryptStealthAddress(
      encryptedStealthAddress,
      ephemeralPubKey,
      owner.secretKey,
    );

    expect(decrypted.startsWith("0x")).toBe(true);
  });

  it("fails with wrong secret key", () => {
    const wrong = keypairFromSeed(new Uint8Array(32).fill(99));

    const { encryptedStealthAddress, ephemeralPubKey } = encryptStealthAddress(
      testAddress,
      ownerPubHex,
    );

    expect(() =>
      decryptStealthAddress(encryptedStealthAddress, ephemeralPubKey, wrong.secretKey),
    ).toThrow("Decryption failed");
  });
});
