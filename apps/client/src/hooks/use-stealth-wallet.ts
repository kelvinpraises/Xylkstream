import { useState, useCallback, useRef } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { sha256, toBytes, toHex } from 'viem';
import WalletManagerEvmErc4337 from '@xylkstream/wdk-4337';
import type {
  WalletAccountEvmErc4337,
  EvmTransaction,
  TransactionResult,
  ApproveOptions,
} from '@xylkstream/wdk-4337';
import { API_URL } from '@/config';

// Polkadot Hub testnet — chain where the privacy layer lives
const STEALTH_CHAIN_ID = 420420417;
const STEALTH_RPC_URL = 'https://services.polkadothub-rpc.com/testnet/';

// Derivation path for the stealth Safe account
const STEALTH_DERIVATION_PATH = "0'/0/0";

// Domain tag that binds every stealth seed to this app
const STEALTH_DOMAIN = 'xylkstream-stealth-v1';

export interface StealthWalletState {
  isReady: boolean;
  isDeriving: boolean;
  stealthAddress: string | null;
  error: string | null;
}

export interface StealthSendTxParams {
  to: string;
  data: string;
  value?: bigint;
}

export interface StealthApproveParams {
  token: string;
  spender: string;
  amount: bigint;
}

export function useStealthWallet() {
  const { wallets } = useWallets();

  const [state, setState] = useState<StealthWalletState>({
    isReady: false,
    isDeriving: false,
    stealthAddress: null,
    error: null,
  });

  const accountRef = useRef<WalletAccountEvmErc4337 | null>(null);

  /**
   * Derives a deterministic ERC-4337 stealth wallet from the user's Privy
   * embedded wallet + a password they supply each session.
   *
   * Derivation flow:
   *   1. signPayload  = sha256(STEALTH_DOMAIN + password)           — hex string
   *   2. signature    = privy.signMessage(signPayload)              — deterministic ECDSA
   *   3. secret       = sha256(signature + password)                — double-bound seed
   *   4. manager      = new WalletManagerEvmErc4337(secret, config)
   *   5. account      = manager.getAccountByPath("0'/0/0")
   */
  const deriveWallet = useCallback(
    async (password: string) => {
      setState(s => ({ ...s, isDeriving: true, error: null }));

      try {
        // Step 1: Build the sign payload — binds domain + password together
        const signPayload = sha256(toBytes(STEALTH_DOMAIN + password));

        // Step 2: Find the Privy embedded wallet and sign deterministically
        const embeddedWallet = wallets.find(
          w => w.walletClientType === 'privy',
        );
        if (!embeddedWallet) {
          throw new Error(
            'No Privy embedded wallet found. Make sure you are logged in.',
          );
        }

        // Get an EIP-1193 provider from the Privy embedded wallet and sign
        const provider = await embeddedWallet.getEthereumProvider();
        const signerAddress = embeddedWallet.address;

        // personal_sign expects the message as a hex string (no 0x prefix needed
        // but including it is standard). Privy's embedded wallet signs this
        // deterministically — same key + same payload = same signature.
        const signature: string = await provider.request({
          method: 'personal_sign',
          params: [signPayload, signerAddress],
        });

        // Step 3: Double-bind the secret to both the wallet signature AND the
        // user-supplied password. An attacker needs both to reproduce the seed.
        // WDK expects Uint8Array for raw seeds (string input is validated as BIP-39 mnemonic)
        const secret = toBytes(sha256(toBytes(signature + password)));

        // Step 4: Initialise WDK with sponsored gas (bundler proxied through API)
        const manager = new WalletManagerEvmErc4337(secret, {
          chainId: STEALTH_CHAIN_ID,
          provider: STEALTH_RPC_URL,
          bundlerUrl: `${API_URL}/bundler`,
          entryPointAddress: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
          safeModulesVersion: '0.3.0',
          isSponsored: true,
          useNativeCoins: false,
          paymasterUrl: `${API_URL}/bundler`,
        });

        // Step 5: Resolve the Safe account at the stealth derivation path
        const account = await manager.getAccountByPath(STEALTH_DERIVATION_PATH);
        const address = await account.getAddress();

        accountRef.current = account;
        setState({
          isReady: true,
          isDeriving: false,
          stealthAddress: address,
          error: null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState(s => ({ ...s, isDeriving: false, error: message }));
      }
    },
    // wallets reference is stable within a session; safe to include
    [wallets],
  );

  /**
   * Sends a UserOperation (ERC-4337 transaction) through the stealth Safe.
   */
  const sendTransaction = useCallback(
    async (tx: StealthSendTxParams): Promise<TransactionResult> => {
      if (!accountRef.current) {
        throw new Error('Stealth wallet not initialised. Call deriveWallet() first.');
      }
      const evmTx: EvmTransaction = {
        to: tx.to,
        data: tx.data,
        value: tx.value,
      };
      return accountRef.current.sendTransaction(evmTx);
    },
    [],
  );

  /**
   * Returns the ERC-20 token balance held by the stealth Safe address.
   */
  const getTokenBalance = useCallback(async (tokenAddress: string): Promise<bigint> => {
    if (!accountRef.current) {
      throw new Error('Stealth wallet not initialised. Call deriveWallet() first.');
    }
    return accountRef.current.getTokenBalance(tokenAddress);
  }, []);

  /**
   * Approves an ERC-20 allowance from the stealth Safe.
   */
  const approve = useCallback(
    async (options: StealthApproveParams): Promise<TransactionResult> => {
      if (!accountRef.current) {
        throw new Error('Stealth wallet not initialised. Call deriveWallet() first.');
      }
      const approveOptions: ApproveOptions = {
        token: options.token,
        spender: options.spender,
        amount: options.amount,
      };
      return accountRef.current.approve(approveOptions);
    },
    [],
  );

  /**
   * Wipes the stealth account from memory. Call on logout or when the user
   * explicitly locks their stealth wallet.
   */
  const dispose = useCallback(() => {
    accountRef.current?.dispose();
    accountRef.current = null;
    setState({
      isReady: false,
      isDeriving: false,
      stealthAddress: null,
      error: null,
    });
  }, []);

  return {
    // state
    isReady: state.isReady,
    isDeriving: state.isDeriving,
    stealthAddress: state.stealthAddress,
    error: state.error,
    // actions
    deriveWallet,
    sendTransaction,
    getTokenBalance,
    approve,
    dispose,
    // raw account ref for advanced callers (e.g. privacy engine)
    account: accountRef.current,
  };
}
