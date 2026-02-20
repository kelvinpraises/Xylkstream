import { Request, Response, NextFunction } from "express";

export function localhostOnly(req: Request, res: Response, next: NextFunction) {
  const clientIp = req.ip || req.socket.remoteAddress;
  const isLocalhost =
    clientIp === "127.0.0.1" || clientIp === "::1" || clientIp === "::ffff:127.0.0.1";

  if (!isLocalhost) {
    return res
      .status(403)
      .json({ error: "Forbidden: Internal endpoints only accessible from localhost" });
  }

  next();
}
