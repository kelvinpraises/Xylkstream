import { privateKeyToAccount } from "viem/accounts";
import { keccak256, encodeAbiParameters, encodePacked, parseAbiParameters, type Hex, toBytes, concat } from "viem";

export interface PackedUserOp {
  sender: Hex;
  nonce: Hex;
  callData: Hex;
  callGasLimit: Hex;
  verificationGasLimit: Hex;
  preVerificationGas: Hex;
  maxFeePerGas: Hex;
  maxPriorityFeePerGas: Hex;
  factory?: Hex | null;
  factoryData?: Hex | null;
  paymaster?: Hex | null;
  paymasterData?: Hex | null;
  paymasterVerificationGasLimit?: Hex | null;
  paymasterPostOpGasLimit?: Hex | null;
  signature: Hex;
}

export interface PaymasterSignResult {
  paymaster: Hex;
  paymasterData: Hex;
  paymasterVerificationGasLimit: Hex;
  paymasterPostOpGasLimit: Hex;
}

const PM_VERIFICATION_GAS = "0x30000" as Hex; // 196608
const PM_POSTOP_GAS = "0x10000" as Hex; // 65536

export function createPaymasterSigner(executorKey: Hex, paymasterAddress: Hex) {
  const account = privateKeyToAccount(executorKey);

  function getHash(
    userOp: PackedUserOp,
    validUntil: number,
    validAfter: number,
    chainId: bigint,
  ): Hex {
    // Replicate VerifyingPaymaster.getHash() exactly
    const initCode = userOp.factory && userOp.factoryData
      ? concat([userOp.factory, userOp.factoryData])
      : "0x" as Hex;

    // accountGasLimits = verificationGasLimit (uint128) | callGasLimit (uint128)
    const accountGasLimits = encodePacked(
      ["uint128", "uint128"],
      [BigInt(userOp.verificationGasLimit), BigInt(userOp.callGasLimit)]
    );

    // gasFees = maxPriorityFeePerGas (uint128) | maxFeePerGas (uint128)
    const gasFees = encodePacked(
      ["uint128", "uint128"],
      [BigInt(userOp.maxPriorityFeePerGas), BigInt(userOp.maxFeePerGas)]
    );

    // paymasterAndData[PAYMASTER_VALIDATION_GAS_OFFSET : PAYMASTER_DATA_OFFSET]
    // = bytes [20:52] = paymasterVerificationGasLimit (uint128) ++ paymasterPostOpGasLimit (uint128)
    const paymasterGasLimits = encodePacked(
      ["uint128", "uint128"],
      [BigInt(PM_VERIFICATION_GAS), BigInt(PM_POSTOP_GAS)]
    );

    return keccak256(
      encodeAbiParameters(
        parseAbiParameters("address, uint256, bytes32, bytes32, bytes32, uint256, uint256, bytes32, uint256, address, uint48, uint48"),
        [
          userOp.sender,
          BigInt(userOp.nonce),
          keccak256(initCode),
          keccak256(userOp.callData),
          accountGasLimits as Hex,
          BigInt(paymasterGasLimits),
          BigInt(userOp.preVerificationGas),
          gasFees as Hex,
          chainId,
          paymasterAddress,
          validUntil,
          validAfter,
        ]
      )
    );
  }

  return {
    address: paymasterAddress,

    async signStub(): Promise<PaymasterSignResult> {
      // Sign with dummy values so gas estimation simulation passes
      const dummyOp: PackedUserOp = {
        sender: "0x0000000000000000000000000000000000000000" as Hex,
        nonce: "0x0" as Hex,
        callData: "0x" as Hex,
        callGasLimit: "0x0" as Hex,
        verificationGasLimit: "0x0" as Hex,
        preVerificationGas: "0x0" as Hex,
        maxFeePerGas: "0x0" as Hex,
        maxPriorityFeePerGas: "0x0" as Hex,
        signature: "0x" as Hex,
      };
      const validUntil = Math.floor(Date.now() / 1000) + 3600;
      const hash = getHash(dummyOp, validUntil, 0, 31337n);
      const ethHash = keccak256(
        concat([
          toBytes("\x19Ethereum Signed Message:\n32"),
          toBytes(hash),
        ])
      );
      const signature = await account.signMessage({ message: { raw: toBytes(hash) } });
      const timeData = encodeAbiParameters(
        parseAbiParameters("uint48, uint48"),
        [validUntil, 0]
      );
      return {
        paymaster: paymasterAddress,
        paymasterData: concat([timeData, signature]),
        paymasterVerificationGasLimit: PM_VERIFICATION_GAS,
        paymasterPostOpGasLimit: PM_POSTOP_GAS,
      };
    },

    async signFromUserOp(userOp: PackedUserOp, _entryPoint: Hex, chainId: Hex): Promise<PaymasterSignResult> {
      const validAfter = 0;
      const validUntil = Math.floor(Date.now() / 1000) + 3600;

      const hash = getHash(userOp, validUntil, validAfter, BigInt(chainId));

      // Contract uses MessageHashUtils.toEthSignedMessageHash(hash)
      // viem's signMessage with raw bytes does the same EIP-191 prefix
      const signature = await account.signMessage({ message: { raw: toBytes(hash) } });

      const timeData = encodeAbiParameters(
        parseAbiParameters("uint48, uint48"),
        [validUntil, validAfter]
      );

      return {
        paymaster: paymasterAddress,
        paymasterData: concat([timeData, signature]),
        paymasterVerificationGasLimit: PM_VERIFICATION_GAS,
        paymasterPostOpGasLimit: PM_POSTOP_GAS,
      };
    },
  };
}
