import { Router, Request, Response } from "express";
import crypto from "crypto";
import { authService } from "../../../services/auth/auth-service.js";

const router = Router();

interface PendingAuth {
  userCode: string;
  userId: number | null;
  createdAt: number;
  authorized: boolean;
}

// In-memory store with 5-min TTL
const pendingAuths = new Map<string, PendingAuth>();

// Cleanup expired entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [code, auth] of pendingAuths) {
    if (now - auth.createdAt > 5 * 60 * 1000) {
      pendingAuths.delete(code);
    }
  }
}, 60 * 1000);

// POST /start
router.post("/start", (_req: Request, res: Response) => {
  const deviceCode = crypto.randomBytes(16).toString("hex");
  const userCode = crypto.randomBytes(3).toString("hex").toUpperCase();

  pendingAuths.set(deviceCode, {
    userCode,
    userId: null,
    createdAt: Date.now(),
    authorized: false,
  });

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  res.json({
    deviceCode,
    userCode,
    verificationUrl: `${frontendUrl}/auth/device?code=${userCode}`,
    expiresIn: 300,
    interval: 5,
  });
});

// POST /authorize
router.post("/authorize", async (req: Request, res: Response) => {
  const { userCode, privyAccessToken } = req.body as {
    userCode?: string;
    privyAccessToken?: string;
  };

  if (!userCode || !privyAccessToken) {
    res.status(400).json({ error: "userCode and privyAccessToken are required" });
    return;
  }

  try {
    const { userId } = await authService.verifyPrivyToken(privyAccessToken);

    let found = false;
    for (const [, auth] of pendingAuths) {
      if (auth.userCode === userCode && !auth.authorized) {
        auth.userId = userId;
        auth.authorized = true;
        found = true;
        break;
      }
    }

    if (!found) {
      res.status(404).json({ error: "Invalid or expired user code" });
      return;
    }

    res.json({ success: true });
  } catch {
    res.status(401).json({ error: "Invalid Privy token" });
  }
});

// POST /poll
router.post("/poll", async (req: Request, res: Response) => {
  const { deviceCode } = req.body as { deviceCode?: string };

  if (!deviceCode) {
    res.status(400).json({ error: "deviceCode is required" });
    return;
  }

  const auth = pendingAuths.get(deviceCode);

  if (!auth) {
    res.status(404).json({ error: "expired_token" });
    return;
  }

  if (Date.now() - auth.createdAt > 5 * 60 * 1000) {
    pendingAuths.delete(deviceCode);
    res.status(410).json({ error: "expired_token" });
    return;
  }

  if (!auth.authorized) {
    res.json({ status: "authorization_pending" });
    return;
  }

  const accessToken = await authService.mintAgentToken(auth.userId!);
  pendingAuths.delete(deviceCode);

  res.json({
    status: "authorized",
    accessToken,
    tokenType: "Bearer",
    expiresIn: 900,
  });
});

// POST /refresh
router.post("/refresh", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const { userId } = await authService.verifyAgentToken(token);
    const accessToken = await authService.mintAgentToken(userId);

    res.json({
      accessToken,
      tokenType: "Bearer",
      expiresIn: 900,
    });
  } catch {
    res.status(401).json({ error: "Token expired or invalid" });
  }
});

export default router;
