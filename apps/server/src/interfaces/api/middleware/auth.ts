import { Request, Response, NextFunction } from "express";
import { authService } from "../../../services/auth/auth-service.js";

declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const { userId } = await authService.verifyPrivyToken(token);
    req.userId = userId;
    next();
  } catch (err) {
    const errMsg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("[auth] token verification failed:", errMsg);

    // Distinguish token issues from internal/database errors
    const isTokenError = err instanceof Error && (
      err.message.includes("expired") ||
      err.message.includes("invalid") ||
      err.message.includes("jwt") ||
      err.name === "JsonWebTokenError" ||
      err.name === "TokenExpiredError"
    );

    if (isTokenError) {
      res.status(401).json({ error: "Invalid or expired token" });
    } else {
      res.status(500).json({ error: "Internal server error during authentication" });
    }
  }
}
