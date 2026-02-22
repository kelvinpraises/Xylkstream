import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePrivy } from "@privy-io/react-auth";
import { RpcStub } from "capnweb";
import {
  authenticateRpcSession,
  type AuthenticatedSession,
} from "@/lib/rpc-client";

interface RpcSessionContextValue {
  session: RpcStub<AuthenticatedSession> | null;
  isLoading: boolean;
  error: Error | null;
}

const RpcSessionContext = createContext<RpcSessionContextValue>({
  session: null,
  isLoading: true,
  error: null,
});

export function RpcSessionProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const [session, setSession] = useState<RpcStub<AuthenticatedSession> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!ready) return;

    if (!authenticated) {
      setSession(null);
      setIsLoading(false);
      return;
    }

    let mounted = true;

    async function initSession() {
      try {
        setIsLoading(true);
        setError(null);

        const token = await getAccessToken();
        if (!token) {
          throw new Error("Failed to get access token");
        }

        const rpcSession = await authenticateRpcSession(token);

        if (mounted) {
          setSession(rpcSession);
        }
      } catch (err) {
        console.error("Failed to initialize RPC session:", err);
        if (mounted) {
          setError(err instanceof Error ? err : new Error("Unknown error"));
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    initSession();

    return () => {
      mounted = false;
    };
  }, [ready, authenticated, getAccessToken]);

  return (
    <RpcSessionContext.Provider value={{ session, isLoading, error }}>
      {children}
    </RpcSessionContext.Provider>
  );
}

export function useRpcSession() {
  const context = useContext(RpcSessionContext);
  if (!context) {
    throw new Error("useRpcSession must be used within RpcSessionProvider");
  }
  return context;
}
