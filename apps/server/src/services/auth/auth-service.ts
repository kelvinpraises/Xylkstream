import jwt from "jsonwebtoken";
import { PrivyClient } from "@privy-io/server-auth";
import { getDatabase } from "../../infrastructure/database/connection.js";

// Singleton — reuses cached JWKS keys instead of fetching them on every request.
let _privyClient: PrivyClient | null = null;
function getPrivyClient(): PrivyClient {
  if (!_privyClient) {
    _privyClient = new PrivyClient(
      process.env.PRIVY_APP_ID!,
      process.env.PRIVY_SECRET!,
    );
  }
  return _privyClient;
}

export const authService = {
  async verifyPrivyToken(accessToken: string): Promise<{ userId: number }> {
    const privy = getPrivyClient();

    const claims = await privy.verifyAuthToken(accessToken);
    const privyDid = claims.userId;

    const db = getDatabase();
    const existing = await db
      .selectFrom("users")
      .select("id")
      .where("privy_did", "=", privyDid)
      .executeTakeFirst();

    if (existing) return { userId: existing.id };

    const result = await db
      .insertInto("users")
      .values({ privy_did: privyDid })
      .returning("id")
      .executeTakeFirst();

    if (!result) throw new Error("Failed to create user");
    return { userId: result.id };
  },

  mintAgentToken(userId: number): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET not set");
    return jwt.sign({ userId }, secret, { expiresIn: "15m" });
  },

  mintRefreshToken(userId: number): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET not set");
    return jwt.sign({ userId, type: "refresh" }, secret, { expiresIn: "7d" });
  },

  verifyAgentToken(token: string): { userId: number } {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET not set");
    const decoded = jwt.verify(token, secret) as { userId: number };
    return { userId: decoded.userId };
  },
};
