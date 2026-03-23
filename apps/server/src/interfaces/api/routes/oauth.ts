import { Router, Request, Response } from "express";
import crypto from "crypto";
import { authService } from "../../../services/auth/auth-service.js";

const router = Router();

// ── In-memory stores (REMOVE!) ──────────────────────────────

interface PendingAuthCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  state: string;
  userId: number | null;
  authorized: boolean;
  createdAt: number;
}

interface AuthCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  userId: number;
  createdAt: number;
}

// Registered dynamic clients
const dynamicClients = new Map<string, { clientId: string; redirectUris: string[] }>();

// Pending authorization requests (keyed by a temporary request ID shown on consent screen)
const pendingAuths = new Map<string, PendingAuthCode>();

// Issued authorization codes (keyed by code, short-lived)
const authCodes = new Map<string, AuthCode>();

// Cleanup expired entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingAuths) {
    if (now - v.createdAt > 5 * 60 * 1000) pendingAuths.delete(k);
  }
  for (const [k, v] of authCodes) {
    if (now - v.createdAt > 60 * 1000) authCodes.delete(k);
  }
}, 60 * 1000);

// ── POST /oauth/register — Dynamic Client Registration (RFC 7591) ──────

router.post("/register", (req: Request, res: Response) => {
  const { redirect_uris } = req.body as { redirect_uris?: string[] };

  if (!redirect_uris || redirect_uris.length === 0) {
    res.status(400).json({ error: "redirect_uris required" });
    return;
  }

  const clientId = `xylk_${crypto.randomBytes(16).toString("hex")}`;
  dynamicClients.set(clientId, { clientId, redirectUris: redirect_uris });

  res.status(201).json({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris,
  });
});

// ── GET /oauth/authorize — Authorization endpoint ──────────────────────
// MCP client opens this in a browser. User sees consent screen in the
// Xylkstream frontend, which POSTs back to /oauth/approve.

router.get("/authorize", (req: Request, res: Response) => {
  const {
    client_id,
    redirect_uri,
    response_type,
    code_challenge,
    code_challenge_method,
    scope,
    state,
  } = req.query as Record<string, string>;

  if (response_type !== "code") {
    res.status(400).json({ error: "unsupported_response_type" });
    return;
  }

  if (!client_id || !redirect_uri || !code_challenge) {
    res.status(400).json({ error: "invalid_request", error_description: "Missing required parameters" });
    return;
  }

  // Generate a request ID and store the pending auth
  const requestId = crypto.randomBytes(16).toString("hex");
  pendingAuths.set(requestId, {
    clientId: client_id,
    redirectUri: redirect_uri,
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method || "S256",
    scope: scope || "",
    state: state || "",
    userId: null,
    authorized: false,
    createdAt: Date.now(),
  });

  // Redirect to frontend consent screen
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  res.redirect(`${frontendUrl}/oauth/authorize?request_id=${requestId}`);
});

// ── POST /oauth/approve — Called by frontend after user consents ───────

router.post("/approve", async (req: Request, res: Response) => {
  const { requestId, privyAccessToken, approved } = req.body as {
    requestId?: string;
    privyAccessToken?: string;
    approved?: boolean;
  };

  if (!requestId || !privyAccessToken) {
    res.status(400).json({ error: "requestId and privyAccessToken required" });
    return;
  }

  const pending = pendingAuths.get(requestId);
  if (!pending) {
    res.status(404).json({ error: "Invalid or expired authorization request" });
    return;
  }

  if (!approved) {
    pendingAuths.delete(requestId);
    // Return denial redirect URL
    const url = new URL(pending.redirectUri);
    url.searchParams.set("error", "access_denied");
    if (pending.state) url.searchParams.set("state", pending.state);
    res.json({ redirectUrl: url.toString() });
    return;
  }

  try {
    const { userId } = await authService.verifyPrivyToken(privyAccessToken);

    // Generate authorization code
    const code = crypto.randomBytes(32).toString("hex");
    authCodes.set(code, {
      code,
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      codeChallenge: pending.codeChallenge,
      userId,
      createdAt: Date.now(),
    });

    pendingAuths.delete(requestId);

    // Return redirect URL with code
    const url = new URL(pending.redirectUri);
    url.searchParams.set("code", code);
    if (pending.state) url.searchParams.set("state", pending.state);

    res.json({ redirectUrl: url.toString() });
  } catch {
    res.status(401).json({ error: "Invalid Privy token" });
  }
});

// ── POST /oauth/token — Token exchange ─────────────────────────────────

router.post("/token", async (req: Request, res: Response) => {
  const { grant_type, code, code_verifier, client_id, redirect_uri, refresh_token } =
    req.body as Record<string, string>;

  // ─── Refresh token grant ───
  if (grant_type === "refresh_token") {
    if (!refresh_token) {
      res.status(400).json({ error: "invalid_request", error_description: "Missing refresh_token" });
      return;
    }

    try {
      const { userId } = authService.verifyAgentToken(refresh_token);
      const accessToken = authService.mintAgentToken(userId);
      const newRefreshToken = authService.mintRefreshToken(userId);

      res.json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: newRefreshToken,
      });
    } catch {
      res.status(401).json({ error: "invalid_grant", error_description: "Invalid refresh token" });
    }
    return;
  }

  // ─── Authorization code grant ───
  if (grant_type !== "authorization_code") {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }

  if (!code || !code_verifier || !client_id) {
    res.status(400).json({ error: "invalid_request", error_description: "Missing required parameters" });
    return;
  }

  const authCode = authCodes.get(code);
  if (!authCode) {
    res.status(400).json({ error: "invalid_grant", error_description: "Invalid or expired authorization code" });
    return;
  }

  // Verify client_id matches
  if (authCode.clientId !== client_id) {
    res.status(400).json({ error: "invalid_grant", error_description: "client_id mismatch" });
    return;
  }

  // Verify redirect_uri matches (if provided)
  if (redirect_uri && authCode.redirectUri !== redirect_uri) {
    res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
    return;
  }

  // Verify PKCE code_challenge
  const hash = crypto.createHash("sha256").update(code_verifier).digest("base64url");
  if (hash !== authCode.codeChallenge) {
    res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
    return;
  }

  // Code is single-use
  authCodes.delete(code);

  // Expired? (60 second lifetime)
  if (Date.now() - authCode.createdAt > 60 * 1000) {
    res.status(400).json({ error: "invalid_grant", error_description: "Authorization code expired" });
    return;
  }

  const accessToken = authService.mintAgentToken(authCode.userId);
  const refreshToken = authService.mintRefreshToken(authCode.userId);

  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 900,
    refresh_token: refreshToken,
  });
});

export default router;
