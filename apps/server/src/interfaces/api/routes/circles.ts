import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { circleService } from "../../../services/circles/circle-service.js";

export function createCirclesRouter(): Router {
  const router = Router();

  // Public: validate invite code exists and return circle metadata
  router.get("/validate/:inviteCode", async (req: Request, res: Response) => {
    const inviteCode = req.params.inviteCode as string;

    try {
      const info = await circleService.validateInviteCode(inviteCode);
      if (!info) {
        res.status(404).json({ error: "Invite code not found" });
        return;
      }
      res.json(info);
    } catch {
      res.status(500).json({ error: "Failed to validate invite code" });
    }
  });

  // All routes below require authentication
  router.use(requireAuth);

  // POST / — create a new circle
  router.post("/", async (req: Request, res: Response) => {
    const { name, inviteCode, encryptionPubKey } = req.body as {
      name?: string;
      inviteCode?: string;
      encryptionPubKey?: string;
    };

    if (!name || !inviteCode || !encryptionPubKey) {
      res.status(400).json({ error: "name, inviteCode, and encryptionPubKey are required" });
      return;
    }

    try {
      const circle = await circleService.create({
        ownerUserId: req.userId!,
        name,
        inviteCode,
        encryptionPubkey: encryptionPubKey,
      });
      res.status(201).json({ circle });
    } catch {
      res.status(500).json({ error: "Failed to create circle" });
    }
  });

  // GET / — list circles owned by the authenticated user
  router.get("/", async (req: Request, res: Response) => {
    try {
      const circles = await circleService.listByOwner(req.userId!);
      res.json({ circles });
    } catch {
      res.status(500).json({ error: "Failed to list circles" });
    }
  });

  // POST /join — join a circle using an invite code
  router.post("/join", async (req: Request, res: Response) => {
    const { inviteCode, encryptedStealthAddress, ephemeralPubKey } = req.body as {
      inviteCode?: string;
      encryptedStealthAddress?: string;
      ephemeralPubKey?: string;
    };

    if (!inviteCode || !encryptedStealthAddress || !ephemeralPubKey) {
      res
        .status(400)
        .json({ error: "inviteCode, encryptedStealthAddress, and ephemeralPubKey are required" });
      return;
    }

    try {
      const info = await circleService.validateInviteCode(inviteCode);
      if (!info) {
        res.status(404).json({ error: "Invite code not found" });
        return;
      }

      const member = await circleService.join({
        circleId: info.circleId,
        userId: req.userId!,
        encryptedStealthAddress,
        ephemeralPubkey: ephemeralPubKey,
      });
      res.status(201).json({ member, circle: info });
    } catch {
      res.status(500).json({ error: "Failed to join circle" });
    }
  });

  // GET /:id — get circle detail with members (owner only)
  router.get("/:id", async (req: Request, res: Response) => {
    const circleId = Number(req.params.id);

    if (isNaN(circleId)) {
      res.status(400).json({ error: "Invalid circle id" });
      return;
    }

    try {
      const result = await circleService.getById(circleId, req.userId!);
      if (!result) {
        res.status(404).json({ error: "Circle not found" });
        return;
      }
      res.json(result);
    } catch {
      res.status(500).json({ error: "Failed to fetch circle" });
    }
  });

  // PATCH /:id — update circle name (owner only)
  router.patch("/:id", async (req: Request, res: Response) => {
    const circleId = Number(req.params.id);
    const { name } = req.body as { name?: string };

    if (isNaN(circleId) || !name?.trim()) {
      res.status(400).json({ error: "Valid circle id and name are required" });
      return;
    }

    try {
      const updated = await circleService.updateName(circleId, name.trim(), req.userId!);
      if (!updated) {
        res.status(404).json({ error: "Circle not found or not authorized" });
        return;
      }
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to update circle" });
    }
  });

  // PATCH /:id/members/:memberId/status — update member status (owner only)
  router.patch("/:id/members/:memberId/status", async (req: Request, res: Response) => {
    const circleId = Number(req.params.id);
    const memberId = Number(req.params.memberId);
    const { status } = req.body as { status?: string };

    if (isNaN(circleId) || isNaN(memberId) || !["pending", "approved", "rejected"].includes(status ?? "")) {
      res.status(400).json({ error: "Valid circle id, member id, and status (pending|approved|rejected) are required" });
      return;
    }

    try {
      const updated = await circleService.updateMemberStatus(
        circleId, memberId, status as "pending" | "approved" | "rejected", req.userId!,
      );
      if (!updated) {
        res.status(404).json({ error: "Member not found or not authorized" });
        return;
      }
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to update member status" });
    }
  });

  // DELETE /:id/members/:memberId — remove a member (owner only)
  router.delete("/:id/members/:memberId", async (req: Request, res: Response) => {
    const circleId = Number(req.params.id);
    const memberId = Number(req.params.memberId);

    if (isNaN(circleId) || isNaN(memberId)) {
      res.status(400).json({ error: "Invalid circle id or member id" });
      return;
    }

    try {
      const removed = await circleService.removeMember(circleId, memberId, req.userId!);
      if (!removed) {
        res.status(404).json({ error: "Member not found or not authorized" });
        return;
      }
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to remove member" });
    }
  });

  return router;
}
