import { RpcTarget } from "capnweb";

import { authService } from "@/services/identity/auth-service";
import { AuthenticatedSession } from "@/interfaces/rpc/external/targets/authenticated-session";

/**
 * Auth RPC Target (External)
 * Returns AuthenticatedSession on successful auth
 */
export class AuthTarget extends RpcTarget {
  async authenticate(params: { accessToken: string }): Promise<AuthenticatedSession> {
    const { user, accountId } = await authService.authenticateUser(params.accessToken);

    return new AuthenticatedSession(user.id, accountId);
  }
}
