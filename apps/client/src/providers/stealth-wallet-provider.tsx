// stealth-wallet-provider.tsx — derives and manages a deterministic ERC-4337 stealth Safe from the Privy embedded wallet

import { useState, useCallback, useRef, useEffect, createContext, useContext, type ReactNode } from "react";
import { useWallets } from '@privy-io/react-auth';
import { sha256, toBytes, hexToBytes, bytesToHex, encodeFunctionData } from 'viem';
import WalletManagerEvmErc4337 from '@xylkstream/wdk-4337';
import type {
  WalletAccountEvmErc4337,
  EvmTransaction,
  TransactionResult,
  ApproveOptions,
} from '@xylkstream/wdk-4337';
import { config } from '@/config';
import { useChain } from '@/providers/chain-provider';

const STEALTH_DERIVATION_PATH = "0'/0/0";
const STEALTH_DOMAIN = 'xylkstream-stealth-v1';
const SESSION_SECRET_KEY = 'xylkstream_stealth_secret';

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

function useStealthWalletInternal() {
  const { wallets } = useWallets();
  const { chainConfig } = useChain();

  const [state, setState] = useState<StealthWalletState>({
    isReady: false,
    isDeriving: false,
    stealthAddress: null,
    error: null,
  });

  const accountRef = useRef<WalletAccountEvmErc4337 | null>(null);
  const managerRef = useRef<WalletManagerEvmErc4337 | null>(null);
  const derivedAccountsRef = useRef<Map<number, WalletAccountEvmErc4337>>(new Map());

  // Build wallet manager from raw secret bytes (shared by derive + restore)
  const initFromSecret = useCallback(async (secret: Uint8Array) => {
    const { chain, contracts } = chainConfig;
    const chainKey = String(chain.id);
    const rpcUrl = chain.rpcUrls.default.http[0];

    const wdkConfig = {
      chainId: chain.id,
      provider: rpcUrl,
      bundlerUrl: `${config.API_URL}/bundler/${chain.name.toLowerCase()}`,
      entryPointAddress: contracts.entryPoint,
      safeModulesVersion: '0.3.0',
      isSponsored: true as const,
      useNativeCoins: false as const,
      paymasterUrl: `${config.API_URL}/paymaster/${chain.name.toLowerCase()}`,
      safe4337ModuleAddress: contracts.safe4337Module,
      safeModulesSetupAddress: contracts.safeModuleSetup,
      contractNetworks: {
        [chainKey]: {
          safeSingletonAddress: contracts.safeSingleton,
          safeProxyFactoryAddress: contracts.safeProxyFactory,
          multiSendAddress: contracts.multiSend,
          multiSendCallOnlyAddress: contracts.multiSendCallOnly,
          fallbackHandlerAddress: contracts.fallbackHandler,
          signMessageLibAddress: contracts.signMessageLib,
          createCallAddress: contracts.createCall,
          simulateTxAccessorAddress: contracts.simulateTxAccessor,
        },
      },
    };

    const manager = new WalletManagerEvmErc4337(secret, wdkConfig);
    managerRef.current = manager;
    derivedAccountsRef.current.clear();
    const account = await manager.getAccountByPath(STEALTH_DERIVATION_PATH);
    const address = await account.getAddress();

    accountRef.current = account;
    setState({ isReady: true, isDeriving: false, stealthAddress: address, error: null });
  }, [chainConfig]);

  // Auto-restore from sessionStorage on mount (skips password prompt within same tab)
  useEffect(() => {
    const cached = sessionStorage.getItem(SESSION_SECRET_KEY);
    if (!cached) {
      return;
    }
    try {
      const secret = hexToBytes(cached as `0x${string}`);
      initFromSecret(secret).catch(() => {
        sessionStorage.removeItem(SESSION_SECRET_KEY);
      });
    } catch (err) {
      sessionStorage.removeItem(SESSION_SECRET_KEY);
    }
  }, [initFromSecret]);

  const deriveWallet = useCallback(
    async (password: string) => {
      setState(s => ({ ...s, isDeriving: true, error: null }));

      try {
        const signPayload = sha256(toBytes(STEALTH_DOMAIN + password));

        const embeddedWallet = wallets.find(
          w => w.walletClientType === 'privy',
        );
        if (!embeddedWallet) {
          throw new Error(
            'No Privy embedded wallet found. Make sure you are logged in.',
          );
        }

        const provider = await embeddedWallet.getEthereumProvider();
        const signerAddress = embeddedWallet.address;

        const signature: string = await provider.request({
          method: 'personal_sign',
          params: [signPayload, signerAddress],
        });

        const secret = toBytes(sha256(toBytes(signature + password)));
        sessionStorage.setItem(SESSION_SECRET_KEY, bytesToHex(secret));
        await initFromSecret(secret);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState(s => ({ ...s, isDeriving: false, error: message }));
      }
    },
    [wallets, chainConfig, initFromSecret],
  );

  const sendTransaction = useCallback(
    async (tx: StealthSendTxParams | StealthSendTxParams[]): Promise<TransactionResult> => {
      if (!accountRef.current) {
        throw new Error('Stealth wallet not initialised. Call deriveWallet() first.');
      }
      const txs = Array.isArray(tx) ? tx : [tx];
      const evmTxs: EvmTransaction[] = txs.map(t => ({
        to: t.to,
        data: t.data,
        value: t.value ?? 0n,
      }));
      return accountRef.current.sendTransaction(evmTxs.length === 1 ? evmTxs[0] : evmTxs);
    },
    [],
  );

  const getTokenBalance = useCallback(async (tokenAddress: string): Promise<bigint> => {
    if (!accountRef.current) {
      throw new Error('Stealth wallet not initialised. Call deriveWallet() first.');
    }
    return accountRef.current.getTokenBalance(tokenAddress);
  }, []);

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

  const getAccountAtIndex = useCallback(async (index: number): Promise<{ account: WalletAccountEvmErc4337; address: string }> => {
    if (!managerRef.current) {
      throw new Error('Stealth wallet not initialised. Call deriveWallet() first.');
    }
    const cached = derivedAccountsRef.current.get(index);
    if (cached) {
      const address = await cached.getAddress();
      return { account: cached, address };
    }
    const account = await managerRef.current.getAccountByPath(`0'/0/${index}`);
    const address = await account.getAddress();
    derivedAccountsRef.current.set(index, account);
    return { account, address };
  }, []);

  const sendTransactionFrom = useCallback(async (index: number, tx: StealthSendTxParams | StealthSendTxParams[]): Promise<TransactionResult> => {
    const { account } = await getAccountAtIndex(index);
    const txs = Array.isArray(tx) ? tx : [tx];
    const evmTxs: EvmTransaction[] = txs.map(t => ({
      to: t.to,
      data: t.data,
      value: t.value ?? 0n,
    }));
    return account.sendTransaction(evmTxs.length === 1 ? evmTxs[0] : evmTxs);
  }, [getAccountAtIndex]);

  const getTokenBalanceAt = useCallback(async (index: number, tokenAddress: string): Promise<bigint> => {
    const { account } = await getAccountAtIndex(index);
    return account.getTokenBalance(tokenAddress);
  }, [getAccountAtIndex]);

  const fundDerivedWallet = useCallback(async (index: number, tokenAddress: string, amount: bigint): Promise<TransactionResult> => {
    if (!accountRef.current) {
      throw new Error('Main stealth wallet not initialised.');
    }
    const { address: derivedAddress } = await getAccountAtIndex(index);
    const transferData = encodeFunctionData({
      abi: [{ name: 'transfer', type: 'function', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }] as const,
      functionName: 'transfer',
      args: [derivedAddress as `0x${string}`, amount],
    });
    return accountRef.current.sendTransaction({ to: tokenAddress, data: transferData, value: 0n });
  }, [getAccountAtIndex]);

  const dispose = useCallback(() => {
    sessionStorage.removeItem(SESSION_SECRET_KEY);
    accountRef.current?.dispose();
    accountRef.current = null;
    managerRef.current = null;
    derivedAccountsRef.current.clear();
    setState({
      isReady: false,
      isDeriving: false,
      stealthAddress: null,
      error: null,
    });
  }, []);

  return {
    isReady: state.isReady,
    isDeriving: state.isDeriving,
    stealthAddress: state.stealthAddress,
    error: state.error,
    deriveWallet,
    sendTransaction,
    getTokenBalance,
    approve,
    getAccountAtIndex,
    sendTransactionFrom,
    getTokenBalanceAt,
    fundDerivedWallet,
    dispose,
    account: accountRef.current,
  };
}

type StealthWalletContextValue = ReturnType<typeof useStealthWalletInternal>;

const StealthWalletContext = createContext<StealthWalletContextValue | null>(null);

export function StealthWalletProvider({ children }: { children: ReactNode }) {
  const wallet = useStealthWalletInternal();
  return (
    <StealthWalletContext.Provider value={wallet}>
      {children}
    </StealthWalletContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStealthWallet() {
  const context = useContext(StealthWalletContext);
  if (!context) {
    throw new Error("useStealthWallet must be used within StealthWalletProvider");
  }
  return context;
}
