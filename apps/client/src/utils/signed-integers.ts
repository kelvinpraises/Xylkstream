/**
 * Signed Integer Utilities for Movement Chain
 * 
 * Movement chain doesn't support native i128/i256, so the contracts use a shimmed
 * representation where the high bit indicates the sign:
 * - Positive: value stored as-is (high bit = 0)
 * - Negative: high bit set to 1, absolute value stored in remaining bits
 * 
 * This matches the movemate::i128 and movemate::i256 implementations.
 */

// ═══════════════════════════════════════════════════════════════════════════════
//                              I128 UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/** Sign bit for i128 (bit 127) */
const I128_SIGN_BIT = 1n << 127n;

/** Maximum positive value for i128 */
export const MAX_I128 = I128_SIGN_BIT - 1n;

/**
 * Convert a regular bigint to I128 bits representation (for sending to Move)
 * @param value - The signed value to encode (-MAX_I128 to MAX_I128)
 * @returns The encoded u128 bits representation
 */
export function toI128Bits(value: bigint): bigint {
  if (value >= 0n) {
    if (value > MAX_I128) {
      throw new Error(`Value ${value} exceeds MAX_I128 (${MAX_I128})`);
    }
    return value;
  }
  // Negative: set the sign bit and store absolute value
  const absValue = -value;
  if (absValue > MAX_I128) {
    throw new Error(`Value ${value} exceeds MIN_I128 (-${MAX_I128})`);
  }
  return I128_SIGN_BIT | absValue;
}

/**
 * Convert I128 bits back to a regular bigint (for reading from Move)
 * @param bits - The u128 bits representation from Move
 * @returns The decoded signed value
 */
export function fromI128Bits(bits: bigint): bigint {
  if (bits < I128_SIGN_BIT) {
    // High bit not set = positive
    return bits;
  }
  // High bit set = negative, strip it and negate
  return -(bits - I128_SIGN_BIT);
}

/**
 * Check if I128 bits represent a negative number
 * @param bits - The u128 bits representation
 * @returns true if negative
 */
export function isI128Negative(bits: bigint): boolean {
  return bits >= I128_SIGN_BIT;
}

/**
 * Create I128 zero value
 */
export function i128Zero(): bigint {
  return 0n;
}

/**
 * Create a negative I128 from a positive value
 * @param absValue - The absolute value (must be positive)
 * @returns The encoded negative I128 bits
 */
export function negI128(absValue: bigint): bigint {
  if (absValue <= 0n) {
    throw new Error('negI128 requires a positive absolute value');
  }
  if (absValue > MAX_I128) {
    throw new Error(`Value ${absValue} exceeds MAX_I128`);
  }
  return I128_SIGN_BIT | absValue;
}

// ═══════════════════════════════════════════════════════════════════════════════
//                              I256 UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/** Sign bit for i256 (bit 255) */
const I256_SIGN_BIT = 1n << 255n;

/** Maximum positive value for i256 */
export const MAX_I256 = I256_SIGN_BIT - 1n;

/**
 * Convert a regular bigint to I256 bits representation (for sending to Move)
 * @param value - The signed value to encode (-MAX_I256 to MAX_I256)
 * @returns The encoded u256 bits representation
 */
export function toI256Bits(value: bigint): bigint {
  if (value >= 0n) {
    if (value > MAX_I256) {
      throw new Error(`Value ${value} exceeds MAX_I256`);
    }
    return value;
  }
  // Negative: set the sign bit and store absolute value
  const absValue = -value;
  if (absValue > MAX_I256) {
    throw new Error(`Value ${value} exceeds MIN_I256`);
  }
  return I256_SIGN_BIT | absValue;
}

/**
 * Convert I256 bits back to a regular bigint (for reading from Move)
 * @param bits - The u256 bits representation from Move
 * @returns The decoded signed value
 */
export function fromI256Bits(bits: bigint): bigint {
  if (bits < I256_SIGN_BIT) {
    // High bit not set = positive
    return bits;
  }
  // High bit set = negative, strip it and negate
  return -(bits - I256_SIGN_BIT);
}

/**
 * Check if I256 bits represent a negative number
 * @param bits - The u256 bits representation
 * @returns true if negative
 */
export function isI256Negative(bits: bigint): boolean {
  return bits >= I256_SIGN_BIT;
}

/**
 * Create I256 zero value
 */
export function i256Zero(): bigint {
  return 0n;
}

/**
 * Create a negative I256 from a positive value
 * @param absValue - The absolute value (must be positive)
 * @returns The encoded negative I256 bits
 */
export function negI256(absValue: bigint): bigint {
  if (absValue <= 0n) {
    throw new Error('negI256 requires a positive absolute value');
  }
  if (absValue > MAX_I256) {
    throw new Error(`Value ${absValue} exceeds MAX_I256`);
  }
  return I256_SIGN_BIT | absValue;
}

// ═══════════════════════════════════════════════════════════════════════════════
//                              HELPER TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Wrapper type for I128 to make intent clear in function signatures
 */
export interface I128 {
  bits: bigint;
}

/**
 * Wrapper type for I256 to make intent clear in function signatures
 */
export interface I256 {
  bits: bigint;
}

/**
 * Create an I128 wrapper from a signed value
 */
export function createI128(value: bigint): I128 {
  return { bits: toI128Bits(value) };
}

/**
 * Create an I256 wrapper from a signed value
 */
export function createI256(value: bigint): I256 {
  return { bits: toI256Bits(value) };
}

/**
 * Read an I128 wrapper to get the signed value
 */
export function readI128(i128: I128): bigint {
  return fromI128Bits(i128.bits);
}

/**
 * Read an I256 wrapper to get the signed value
 */
export function readI256(i256: I256): bigint {
  return fromI256Bits(i256.bits);
}
