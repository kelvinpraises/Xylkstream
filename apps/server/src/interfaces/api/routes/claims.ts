import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { claimService } from "../../../services/claims/claim-service.js";

export function createClaimsRouter(): Router {
  const router = Router();

  // Public: get claim page by ID (recipient needs this without auth)
  router.get("/:id", async (req: Request, res: Response) => {
    const id = req.params.id as string;

    try {
      const claim = await claimService.getById(id);
      if (!claim) {
        res.status(404).json({ error: "Claim page not found" });
        return;
      }
      res.json({ claim });
    } catch {
      res.status(500).json({ error: "Failed to fetch claim page" });
    }
  });

  // All routes below require authentication
  router.use(requireAuth);

  // POST / — create a new claim page
  router.post("/", async (req: Request, res: Response) => {
    const {
      streamId,
      recipientAddress,
      tokenAddress,
      tokenSymbol,
      totalAmount,
      amtPerSec,
      startTimestamp,
      endTimestamp,
      title,
      subtitle,
      chainId,
    } = req.body as {
      streamId?: string;
      recipientAddress?: string;
      tokenAddress?: string;
      tokenSymbol?: string;
      totalAmount?: string;
      amtPerSec?: string;
      startTimestamp?: number;
      endTimestamp?: number;
      title?: string;
      subtitle?: string;
      chainId?: number;
    };

    if (
      !streamId ||
      !recipientAddress ||
      !tokenAddress ||
      !tokenSymbol ||
      !totalAmount ||
      !amtPerSec ||
      startTimestamp == null ||
      endTimestamp == null ||
      chainId == null
    ) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    try {
      const claim = await claimService.create({
        streamId,
        senderUserId: req.userId!,
        recipientAddress,
        tokenAddress,
        tokenSymbol,
        totalAmount,
        amtPerSec,
        startTimestamp,
        endTimestamp,
        title: title || "You've Got Money!",
        subtitle: subtitle || "",
        chainId,
      });
      res.status(201).json({ claim });
    } catch {
      res.status(500).json({ error: "Failed to create claim page" });
    }
  });

  // GET / — list claim pages created by the authenticated user
  router.get("/", async (req: Request, res: Response) => {
    try {
      const claims = await claimService.listBySender(req.userId!);
      res.json({ claims });
    } catch {
      res.status(500).json({ error: "Failed to list claim pages" });
    }
  });

  return router;
}
