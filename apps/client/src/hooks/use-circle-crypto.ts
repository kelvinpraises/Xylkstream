// use-circle-crypto.ts — derives and manages a deterministic NaCl x25519 keypair
// from the Privy embedded wallet for circle member encryption.
// The keypair is cached in localStorage so the user only signs once per wallet.

import { useState, useCallback, useRef, useEffect } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { sha256, toBytes } from 'viem';
import { keypairFromSeed, toHex, fromHex, type CircleKeypair } from '@/utils/circle-crypto';

const CIRCLE_ENCRYPTION_DOMAIN = 'xylkstream-circle-encryption-v1';
const STORAGE_KEY_PREFIX = 'xylk_circle_keypair_';

function getCachedKeypair(address: string): CircleKeypair | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + address.toLowerCase());
    if (!raw) return null;
    const { pub, sec } = JSON.parse(raw);
    return { publicKey: fromHex(pub), secretKey: fromHex(sec) };
  } catch {
    return null;
  }
}

function cacheKeypair(address: string, keypair: CircleKeypair) {
  try {
    localStorage.setItem(
      STORAGE_KEY_PREFIX + address.toLowerCase(),
      JSON.stringify({ pub: toHex(keypair.publicKey), sec: toHex(keypair.secretKey) }),
    );
  } catch {
    // ignore quota errors
  }
}

export interface CircleCryptoState {
  isReady: boolean;
  isDeriving: boolean;
  publicKeyHex: string | null;
  error: string | null;
}

export function useCircleCrypto() {
  const { wallets } = useWallets();

  const [state, setState] = useState<CircleCryptoState>({
    isReady: false,
    isDeriving: false,
    publicKeyHex: null,
    error: null,
  });

  const keypairRef = useRef<CircleKeypair | null>(null);

  // Try to restore from cache on mount / wallet change
  useEffect(() => {
    const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
    if (!embeddedWallet || keypairRef.current) return;

    const cached = getCachedKeypair(embeddedWallet.address);
    if (cached) {
      keypairRef.current = cached;
      setState({
        isReady: true,
        isDeriving: false,
        publicKeyHex: toHex(cached.publicKey),
        error: null,
      });
    }
  }, [wallets]);

  const deriveKeypair = useCallback(async (): Promise<string> => {
    // Return cached if already ready
    if (keypairRef.current) {
      const pubHex = toHex(keypairRef.current.publicKey);
      setState({ isReady: true, isDeriving: false, publicKeyHex: pubHex, error: null });
      return pubHex;
    }

    setState(s => ({ ...s, isDeriving: true, error: null }));

    try {
      const signPayload = sha256(toBytes(CIRCLE_ENCRYPTION_DOMAIN));

      const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
      if (!embeddedWallet) {
        throw new Error(
          'No Privy embedded wallet found. Make sure you are logged in.',
        );
      }

      // Check cache one more time (race condition guard)
      const cached = getCachedKeypair(embeddedWallet.address);
      if (cached) {
        keypairRef.current = cached;
        const pubHex = toHex(cached.publicKey);
        setState({ isReady: true, isDeriving: false, publicKeyHex: pubHex, error: null });
        return pubHex;
      }

      const provider = await embeddedWallet.getEthereumProvider();
      const signerAddress = embeddedWallet.address;

      const signature: string = await provider.request({
        method: 'personal_sign',
        params: [signPayload, signerAddress],
      });

      // Deterministic seed from signature — take first 32 bytes for x25519.
      const seed = toBytes(sha256(toBytes(signature)));
      const seedBytes = seed.slice(0, 32);

      const keypair = keypairFromSeed(seedBytes);
      keypairRef.current = keypair;

      // Cache for future sessions
      cacheKeypair(signerAddress, keypair);

      const pubHex = toHex(keypair.publicKey);

      setState({
        isReady: true,
        isDeriving: false,
        publicKeyHex: pubHex,
        error: null,
      });

      return pubHex;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState(s => ({ ...s, isDeriving: false, error: message }));
      throw err;
    }
  }, [wallets]);

  const getSecretKey = useCallback((): Uint8Array => {
    if (!keypairRef.current) {
      throw new Error('Circle keypair not derived. Call deriveKeypair() first.');
    }
    return keypairRef.current.secretKey;
  }, []);

  return {
    ...state,
    deriveKeypair,
    getSecretKey,
  };
}
