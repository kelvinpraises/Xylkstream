import { useState, useCallback, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { config } from "@/config";

interface DeviceAuthState {
  status: "idle" | "waiting" | "authorized" | "error";
  userCode: string | null;
  deviceCode: string | null;
  error: string | null;
}

export function useAgentConnection() {
  const { getAccessToken } = usePrivy();
  const [state, setState] = useState<DeviceAuthState>({
    status: "idle",
    userCode: null,
    deviceCode: null,
    error: null,
  });
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startConnection = useCallback(async () => {
    stopPolling();
    setState({ status: "waiting", userCode: null, deviceCode: null, error: null });

    try {
      const res = await fetch(`${config.API_URL}/device-auth/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) throw new Error("Failed to start device auth");

      const { deviceCode, userCode } = await res.json();
      setState((s) => ({ ...s, userCode, deviceCode }));

      // Auto-authorize: browser user is the authorizer
      const token = await getAccessToken();
      if (token) {
        const authRes = await fetch(`${config.API_URL}/device-auth/authorize`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ userCode }),
        });

        if (authRes.ok) {
          setState((s) => ({ ...s, status: "authorized" }));
          return;
        }
      }

      // If auto-auth failed, just show the code for manual entry
    } catch (err) {
      setState({
        status: "error",
        userCode: null,
        deviceCode: null,
        error: err instanceof Error ? err.message : "Connection failed",
      });
    }
  }, [getAccessToken, stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setState({ status: "idle", userCode: null, deviceCode: null, error: null });
  }, [stopPolling]);

  return {
    ...state,
    startConnection,
    reset,
  };
}
