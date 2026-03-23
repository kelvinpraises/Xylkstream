import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { yieldboxService } from "../../../services/yieldbox/yieldbox-service.js";

export function createStrategiesRouter(): Router {
  const router = Router();

  router.get("/", requireAuth, async (req: Request, res: Response) => {
    try {
      const strategies = await yieldboxService.listStrategies(req.userId!);
      res.json({ strategies });
    } catch {
      res.status(500).json({ error: "Failed to list strategies" });
    }
  });

  router.get("/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const strategy = await yieldboxService.getStrategy(Number(req.params.id), req.userId!);
      if (!strategy) {
        res.status(404).json({ error: "Strategy not found" });
        return;
      }
      res.json({ strategy });
    } catch {
      res.status(500).json({ error: "Failed to get strategy" });
    }
  });

  router.post("/", requireAuth, async (req: Request, res: Response) => {
    try {
      const { name, sourceCode } = req.body as { name?: string; sourceCode?: string };
      if (!name || !sourceCode) {
        res.status(400).json({ error: "name and sourceCode are required" });
        return;
      }
      const strategy = await yieldboxService.submitStrategy(req.userId!, name, sourceCode);
      res.status(201).json({ strategy });
    } catch {
      res.status(500).json({ error: "Failed to submit strategy" });
    }
  });

  router.post("/:id/test", requireAuth, async (req: Request, res: Response) => {
    try {
      const { testScript } = req.body as { testScript?: string };
      await yieldboxService.testStrategy(Number(req.params.id), req.userId!, testScript);
      const strategy = await yieldboxService.getStrategy(Number(req.params.id), req.userId!);
      res.json({ testStatus: strategy?.test_status, testResults: strategy?.test_results_json });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to test strategy" });
    }
  });

  router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { deploymentAddress } = req.body as { deploymentAddress?: string };
      if (!deploymentAddress) {
        res.status(400).json({ error: "deploymentAddress is required" });
        return;
      }
      const updated = await yieldboxService.updateDeployAddress(
        Number(req.params.id),
        req.userId!,
        deploymentAddress,
      );
      if (!updated) {
        res.status(404).json({ error: "Strategy not found or not compiled" });
        return;
      }
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to update strategy" });
    }
  });

  return router;
}
