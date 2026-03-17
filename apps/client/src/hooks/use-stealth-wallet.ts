// use-stealth-wallet.ts — derives and manages a deterministic ERC-4337 stealth Safe from the Privy embedded wallet

import { useState, useCallback, useRef } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { sha256, toBytes } from 'viem';
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
  const { chainConfig } = useChain();

  const [state, setState] = useState<StealthWalletState>({
    isReady: false,
    isDeriving: false,
    stealthAddress: null,
    error: null,
  });

  const accountRef = useRef<WalletAccountEvmErc4337 | null>(null);

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

        const { chain, contracts } = chainConfig;
        const chainKey = String(chain.id);
        const rpcUrl = chain.rpcUrls.default.http[0];

        const manager = new WalletManagerEvmErc4337(secret, {
          chainId: chain.id,
          provider: rpcUrl,
          bundlerUrl: `${config.API_URL}/bundler`,
          entryPointAddress: contracts.entryPoint,
          safeModulesVersion: '0.3.0',
          isSponsored: true,
          useNativeCoins: false,
          paymasterUrl: `${config.API_URL}/bundler`,
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
        });

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
    [wallets, chainConfig],
  );

  const sendTransaction = useCallback(
    async (tx: StealthSendTxParams): Promise<TransactionResult> => {
      if (!accountRef.current) {
        throw new Error('Stealth wallet not initialised. Call deriveWallet() first.');
      }
      const evmTx: EvmTransaction = {
        to: tx.to,
        data: tx.data,
        value: tx.value ?? 0n,
      };
      return accountRef.current.sendTransaction(evmTx);
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
    isReady: state.isReady,
    isDeriving: state.isDeriving,
    stealthAddress: state.stealthAddress,
    error: state.error,
    deriveWallet,
    sendTransaction,
    getTokenBalance,
    approve,
    dispose,
    account: accountRef.current,
  };
}
