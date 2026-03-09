import type { PublicClient, WalletClient, Address } from "viem";
import { type ScopeResult, deployFromArtifact } from "../utils.js";

export async function deployPrivacy(
  client: PublicClient,
  walletClient: WalletClient,
  previousScopes: Record<string, ScopeResult>,
  config: { chain: string; rpc: string; deployer: Address }
): Promise<ScopeResult> {
  console.log("Deploying privacy contracts...");

  // 1. PoseidonT3 library (linked into ZWERC20 bytecode)
  const poseidonT3 = await deployFromArtifact(
    walletClient,
    client,
    "out/PoseidonT3.sol/PoseidonT3.json"
  );

  // 2. Groth16Verifier
  const groth16Verifier = await deployFromArtifact(
    walletClient,
    client,
    "out/Groth16Verifier.sol/Groth16Verifier.json"
  );

  // 3. Mock tokens (testnet only)
  const mockUSDC = await deployFromArtifact(
    walletClient,
    client,
    "out/MockERC20.sol/MockERC20.json",
    ["Test USDC", "tUSDC", 18]
  );

  const mockUSDT = await deployFromArtifact(
    walletClient,
    client,
    "out/MockERC20.sol/MockERC20.json",
    ["Test USDT", "tUSDT", 18]
  );

  // 4. ZwConfig struct (matches BaseZWToken.ZwConfig in Deploy.s.sol)
  const zwConfig = {
    verifier: groth16Verifier,
    feeCollector: config.deployer,
    feeDenominator: 10_000n,
    depositFee: 0n,
    remintFee: 0n,
    withdrawFee: 0n,
    minDepositFee: 0n,
    minWithdrawFee: 0n,
    minRemintFee: 0n,
  };

  // PoseidonT3 must be linked into ZWERC20 bytecode before deployment.
  // The placeholder __$a2daaad8940c9006af3f1557205ebe532d$__ is replaced
  // by deployFromArtifact's library linking logic.
  const libraries = { PoseidonT3: poseidonT3 };

  // 5. ZWERC20 wrapping USDC
  const zwUSDC = await deployFromArtifact(
    walletClient,
    client,
    "out/ZWERC20.sol/ZWERC20.json",
    ["ZW Test USDC", "zwUSDC", 18, mockUSDC, zwConfig],
    libraries
  );

  // 6. ZWERC20 wrapping USDT
  const zwUSDT = await deployFromArtifact(
    walletClient,
    client,
    "out/ZWERC20.sol/ZWERC20.json",
    ["ZW Test USDT", "zwUSDT", 18, mockUSDT, zwConfig],
    libraries
  );

  return {
    status: "completed",
    deployedAt: new Date().toISOString(),
    contracts: {
      poseidonT3,
      groth16Verifier,
      mockUSDC,
      mockUSDT,
      zwUSDC,
      zwUSDT,
    },
  };
}
