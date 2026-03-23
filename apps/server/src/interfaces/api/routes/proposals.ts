import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { proposalService } from "../../../services/proposals/proposal-service.js";

export function createProposalsRouter(): Router {
  const router = Router();

  // List proposals for authenticated user
  router.get("/", requireAuth, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const proposals = await proposalService.list(req.userId!, status);
      res.json({ proposals });
    } catch (error) {
      res.status(500).json({ error: "Failed to list proposals" });
    }
  });

  // Get pending count
  router.get("/count", requireAuth, async (req, res) => {
    try {
      const count = await proposalService.countPending(req.userId!);
      res.json({ count });
    } catch (error) {
      console.error("[proposals/count] error:", error);
      res.status(500).json({ error: "Failed to count proposals" });
    }
  });

  // Update proposal status (approve/reject)
  router.patch("/:id/status", requireAuth, async (req, res) => {
    try {
      const proposalId = Number(req.params.id);
      const { status } = req.body as { status: "approved" | "rejected" | "executed" };

      if (!["approved", "rejected", "executed"].includes(status)) {
        res.status(400).json({ error: "Invalid status. Must be: approved, rejected, or executed" });
        return;
      }

      const updated = await proposalService.updateStatus(proposalId, req.userId!, status);
      if (!updated) {
        res.status(404).json({ error: "Proposal not found" });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update proposal" });
    }
  });

  return router;
}
