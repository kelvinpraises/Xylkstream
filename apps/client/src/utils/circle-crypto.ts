// circle-crypto.ts — NaCl box encryption utilities for circle member privacy.
// The circle owner's encryption key hides member stealth addresses so the
// platform can't see who's receiving.

import nacl from 'tweetnacl';

// Types
export interface CircleKeypair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

// Derive a deterministic x25519 keypair from a 32-byte seed.
export function keypairFromSeed(seed: Uint8Array): CircleKeypair {
  // nacl.box.keyPair.fromSecretKey expects exactly 32 bytes.
  // The seed IS the secret key for x25519.
  return nacl.box.keyPair.fromSecretKey(seed);
}

// Encrypt a message (stealth address bytes) for a recipient using their public key.
// Returns: { ciphertext: Uint8Array, nonce: Uint8Array }
export function encryptForCircle(
  message: Uint8Array,
  senderPubKey: Uint8Array, // circle owner's encryption pubkey
  ephemeralSecretKey: Uint8Array,
): { ciphertext: Uint8Array; nonce: Uint8Array } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ciphertext = nacl.box(message, nonce, senderPubKey, ephemeralSecretKey);
  if (!ciphertext) throw new Error('Encryption failed');
  return { ciphertext, nonce };
}

// Decrypt a message using the circle owner's secret key.
export function decryptFromCircle(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  ephemeralPubKey: Uint8Array,
  ownerSecretKey: Uint8Array,
): Uint8Array {
  const message = nacl.box.open(ciphertext, nonce, ephemeralPubKey, ownerSecretKey);
  if (!message) throw new Error('Decryption failed — wrong key or corrupted data');
  return message;
}

// Hex encode/decode helpers for serialization.
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// Combined encrypt: generates ephemeral keypair, encrypts, returns hex-encoded result.
export function encryptStealthAddress(
  stealthAddress: string, // 0x... address
  senderPubKeyHex: string, // circle owner's pubkey as hex
): { encryptedStealthAddress: string; ephemeralPubKey: string } {
  // Strip 0x prefix and convert address to bytes.
  const addressBytes = fromHex(stealthAddress.replace('0x', ''));
  const senderPubKey = fromHex(senderPubKeyHex);

  // Generate ephemeral keypair for this join.
  const ephemeral = nacl.box.keyPair();

  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ciphertext = nacl.box(addressBytes, nonce, senderPubKey, ephemeral.secretKey);
  if (!ciphertext) throw new Error('Encryption failed');

  // Pack nonce + ciphertext together for storage.
  const packed = new Uint8Array(nonce.length + ciphertext.length);
  packed.set(nonce);
  packed.set(ciphertext, nonce.length);

  return {
    encryptedStealthAddress: toHex(packed),
    ephemeralPubKey: toHex(ephemeral.publicKey),
  };
}

// Combined decrypt: unpacks nonce+ciphertext, decrypts with owner key.
export function decryptStealthAddress(
  encryptedStealthAddressHex: string,
  ephemeralPubKeyHex: string,
  ownerSecretKey: Uint8Array,
): string {
  const packed = fromHex(encryptedStealthAddressHex);
  const ephemeralPubKey = fromHex(ephemeralPubKeyHex);

  const nonce = packed.slice(0, nacl.box.nonceLength);
  const ciphertext = packed.slice(nacl.box.nonceLength);

  const message = nacl.box.open(ciphertext, nonce, ephemeralPubKey, ownerSecretKey);
  if (!message) throw new Error('Decryption failed');

  return '0x' + toHex(message);
}
