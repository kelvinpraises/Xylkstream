import { Router, Request, Response } from "express";
import { getAltoPort } from "../../services/bundler/alto.js";

export function createBundlerRouter(): Router {
  const router = Router();

  router.post("/:chain", async (req: Request, res: Response) => {
    const chain = req.params.chain as string;
    const port = getAltoPort(chain);

    if (!port) {
      res.status(503).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: `Bundler not available for chain: ${chain}` },
        id: req.body?.id ?? null,
      });
      return;
    }

    try {
      const response = await fetch(`http://localhost:${port}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      res.json(data);
    } catch {
      res.status(503).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bundler unavailable" },
        id: req.body?.id ?? null,
      });
    }
  });

  return router;
}
