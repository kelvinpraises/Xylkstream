import { walletData } from "@/services/wallet/shared/wallet-data";
import { PrivyClient } from "@privy-io/server-auth";
import {
  createPublicClient,
  defineChain,
  encodeDeployData,
  encodeFunctionData,
  http,
  type Chain,
} from "viem";

// Contract artifacts
import AddressDriverArtifact from "@/contracts/AddressDriver.json";
import DripsArtifact from "@/contracts/Drips.json";
import YieldManagerArtifact from "@/contracts/YieldManager.json";

const tempo = defineChain({
  id: 42431,
  name: "Tempo",
  nativeCurrency: { name: "Tempo", symbol: "TEMPO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.moderato.tempo.xyz"] },
  },
});

export interface DeploymentResult {
  chainId: string;
  contracts: {
    drips?: string;
    addressDriver?: string;
    yieldManager?: string;
  };
  txHashes: string[];
  deployedAt: Date;
}

export const evmDeployer = {
  async deploy(
    accountId: number,
    privyClient: PrivyClient,
  ): Promise<DeploymentResult> {
    const chain = tempo;

    // Get wallet ID for this account
    const privyWalletId = await walletData.getPrivyWalletIdOrThrow(accountId);

    // Create public client for reading
    const publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    const txHashes: string[] = [];
    const contracts: DeploymentResult["contracts"] = {};

    // Step 1: Deploy Drips
    console.log("Deploying Drips contract...");
    const cycleSecs = 86400; // 1 day

    const dripsDeployData = encodeDeployData({
      abi: DripsArtifact.abi,
      bytecode: DripsArtifact.bytecode.object as `0x${string}`,
      args: [cycleSecs],
    });

    const dripsHash = await this.signAndSendTransaction(
      privyClient,
      privyWalletId,
      chain.id,
      {
        to: undefined,
        data: dripsDeployData,
      },
      chain,
    );
    txHashes.push(dripsHash);

    const dripsReceipt = await publicClient.waitForTransactionReceipt({
      hash: dripsHash as `0x${string}`,
    });
    contracts.drips = dripsReceipt.contractAddress!;
    console.log(`Drips deployed: ${contracts.drips}`);

    // Step 2: Deploy AddressDriver
    console.log("Deploying AddressDriver contract...");
    const forwarder = "0x0000000000000000000000000000000000000000";
    const addressDriverId = 0;

    const addressDriverDeployData = encodeDeployData({
      abi: AddressDriverArtifact.abi,
      bytecode: AddressDriverArtifact.bytecode.object as `0x${string}`,
      args: [contracts.drips, forwarder, addressDriverId],
    });

    const addressDriverHash = await this.signAndSendTransaction(
      privyClient,
      privyWalletId,
      chain.id,
      {
        to: undefined,
        data: addressDriverDeployData,
      },
      chain,
    );
    txHashes.push(addressDriverHash);

    const addressDriverReceipt = await publicClient.waitForTransactionReceipt({
      hash: addressDriverHash as `0x${string}`,
    });
    contracts.addressDriver = addressDriverReceipt.contractAddress!;
    console.log(`AddressDriver deployed: ${contracts.addressDriver}`);

    // Step 3: Register AddressDriver with Drips
    console.log("Registering AddressDriver with Drips...");

    const registerDriverData = encodeFunctionData({
      abi: DripsArtifact.abi,
      functionName: "registerDriver",
      args: [contracts.addressDriver],
    });

    const registerHash = await this.signAndSendTransaction(
      privyClient,
      privyWalletId,
      chain.id,
      {
        to: contracts.drips,
        data: registerDriverData,
      },
      chain,
    );
    txHashes.push(registerHash);

    await publicClient.waitForTransactionReceipt({
      hash: registerHash as `0x${string}`,
    });
    console.log("AddressDriver registered with Drips");

    // Step 4: Deploy YieldManager
    console.log("Deploying YieldManager contract...");

    const yieldManagerDeployData = encodeDeployData({
      abi: YieldManagerArtifact.abi,
      bytecode: YieldManagerArtifact.bytecode.object as `0x${string}`,
      args: [contracts.drips],
    });

    const yieldManagerHash = await this.signAndSendTransaction(
      privyClient,
      privyWalletId,
      chain.id,
      {
        to: undefined,
        data: yieldManagerDeployData,
      },
      chain,
    );
    txHashes.push(yieldManagerHash);

    const yieldManagerReceipt = await publicClient.waitForTransactionReceipt({
      hash: yieldManagerHash as `0x${string}`,
    });
    contracts.yieldManager = yieldManagerReceipt.contractAddress!;
    console.log(`YieldManager deployed: ${contracts.yieldManager}`);

    return {
      chainId: "tempo",
      contracts,
      txHashes,
      deployedAt: new Date(),
    };
  },

  async signAndSendTransaction(
    privyClient: PrivyClient,
    privyWalletId: string,
    chainId: number,
    transaction: {
      to?: string;
      value?: string;
      data?: string;
      gasLimit?: string;
    },
    chain: Chain,
  ): Promise<string> {
    // Sign with Privy
    const signResult = await privyClient.walletApi.ethereum.signTransaction({
      walletId: privyWalletId,
      transaction: {
        to: transaction.to as `0x${string}` | undefined,
        value: transaction.value as `0x${string}` | undefined,
        data: transaction.data as `0x${string}` | undefined,
        chainId,
        gasLimit: transaction.gasLimit as `0x${string}` | undefined,
      },
    });

    // Broadcast signed transaction
    const publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    const hash = await publicClient.sendRawTransaction({
      serializedTransaction: signResult.signedTransaction as `0x${string}`,
    });

    return hash;
  },
};
