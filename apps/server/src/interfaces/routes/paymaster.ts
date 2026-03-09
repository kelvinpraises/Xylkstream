import { Router, Request, Response } from "express";
import type { Hex } from "viem";
import type { PackedUserOp } from "../../services/paymaster/signer.js";

type PaymasterSigner = {
  address: Hex;
  signStub(): Promise<{
    paymaster: Hex;
    paymasterData: Hex;
    paymasterVerificationGasLimit: Hex;
    paymasterPostOpGasLimit: Hex;
  }>;
  signFromUserOp(userOp: PackedUserOp, entryPoint: Hex, chainId: Hex): Promise<{
    paymaster: Hex;
    paymasterData: Hex;
    paymasterVerificationGasLimit: Hex;
    paymasterPostOpGasLimit: Hex;
  }>;
};

export function createPaymasterRouter(signers: Map<string, PaymasterSigner>): Router {
  const router = Router();

  router.post("/:chain", async (req: Request, res: Response) => {
    const chain = req.params.chain as string;
    const signer = signers.get(chain);

    if (!signer) {
      res.status(503).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: `Paymaster not available for chain: ${chain}` },
        id: req.body?.id ?? null,
      });
      return;
    }

    const { method, params, id } = req.body;

    try {
      if (method === "pm_getPaymasterStubData") {
        const result = await signer.signStub();
        res.json({ jsonrpc: "2.0", id, result });
        return;
      }

      if (method === "pm_getPaymasterData") {
        // ERC-7677: params = [userOp, entryPoint, chainId, context]
        const userOp = params[0] as PackedUserOp;
        const entryPoint = params[1] as Hex;
        const chainId = params[2] as Hex;

        const result = await signer.signFromUserOp(userOp, entryPoint, chainId);
        res.json({ jsonrpc: "2.0", id, result });
        return;
      }

      res.json({
        jsonrpc: "2.0",
        error: { code: -32601, message: `Method not found: ${method}` },
        id,
      });
    } catch (err) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: `Paymaster error: ${err}` },
        id,
      });
    }
  });

  return router;
}
