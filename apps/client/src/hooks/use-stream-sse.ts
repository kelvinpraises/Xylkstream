import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { API_URL } from "@/config";
import type { AuditLogItem } from "@/lib/rpc-client";

interface SSEMessage {
  type: "connected" | "audit-log";
  streamId?: number;
  data?: AuditLogItem;
}

/**
 * Hook to subscribe to real-time audit log updates via SSE
 * Used in Studio to stream AI agent thoughts and actions
 */
export function useStreamSSE(
  streamId: number | null,
  onMessage?: (log: AuditLogItem) => void
) {
  const queryClient = useQueryClient();
  const { getAccessToken } = usePrivy();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef(false);

  const connect = useCallback(async () => {
    if (!streamId || isConnectingRef.current) return;

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    isConnectingRef.current = true;

    try {
      const token = await getAccessToken();
      if (!token) {
        console.warn("[SSE] No access token available");
        isConnectingRef.current = false;
        return;
      }

      const url = `${API_URL}/events/streams/${streamId}?token=${encodeURIComponent(token)}`;
      console.log(`[SSE] Connecting to ${url}`);

      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log(`[SSE] Connected to stream ${streamId}`);
        isConnectingRef.current = false;
      };

      eventSource.onmessage = (event) => {
        try {
          const message: SSEMessage = JSON.parse(event.data);

          if (message.type === "connected") {
            console.log(`[SSE] Connection confirmed for stream ${message.streamId}`);
          } else if (message.type === "audit-log" && message.data) {
            console.log(`[SSE] Received audit log:`, message.data);

            // Call custom handler if provided
            if (onMessage) {
              onMessage(message.data);
            }

            // Invalidate queries to trigger refetch
            queryClient.invalidateQueries({
              queryKey: ["audit-logs", streamId],
            });
          }
        } catch (error) {
          console.error("[SSE] Failed to parse message:", error);
        }
      };

      eventSource.onerror = (error) => {
        console.error(`[SSE] Connection error for stream ${streamId}:`, error);
        eventSource.close();
        eventSourceRef.current = null;
        isConnectingRef.current = false;

        // Reconnect after 5 seconds
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("[SSE] Attempting to reconnect...");
          connect();
        }, 5000);
      };
    } catch (error) {
      console.error("[SSE] Failed to establish connection:", error);
      isConnectingRef.current = false;
    }
  }, [streamId, getAccessToken, queryClient, onMessage]);

  useEffect(() => {
    if (streamId) {
      connect();
    }

    return () => {
      // Cleanup on unmount or streamId change
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        console.log(`[SSE] Closing connection for stream ${streamId}`);
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      isConnectingRef.current = false;
    };
  }, [streamId, connect]);

  return {
    isConnected: !!eventSourceRef.current && eventSourceRef.current.readyState === EventSource.OPEN,
  };
}
