import { NextFunction, Request, Response } from "express";
import { authService } from "@/services/identity/auth-service";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        accountId: number;
      };
    }
  }
}

export const protect = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authorized, no token" });
    return;
  }

  try {
    const token = authHeader.split(" ")[1];
    const { user, accountId } = await authService.authenticateUser(token);

    req.user = {
      id: user.id,
      accountId,
    };

    next();
  } catch (error) {
    console.error("[auth] Token verification failed:", error);
    res.status(401).json({ error: "Not authorized, token failed" });
  }
};
