// pending-provider.tsx — processes queued actions once the stealth wallet becomes ready

import {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useStealthWallet } from "@/providers/stealth-wallet-provider";
import {
  getPendingActions,
  addPendingAction,
  removePendingAction,
  type PendingAction,
} from "@/utils/pending-engine";

type ProcessorHandler = (action: PendingAction) => Promise<void>;

interface PendingContextValue {
  pendingActions: PendingAction[];
  addAction: (type: string, payload: Record<string, string>) => PendingAction;
  removeAction: (id: string) => void;
  registerProcessor: (type: string, handler: ProcessorHandler) => void;
  isProcessing: boolean;
}

const PendingContext = createContext<PendingContextValue | null>(null);

export function PendingProvider({ children }: { children: ReactNode }) {
  const stealthWallet = useStealthWallet();
  const processorsRef = useRef<Map<string, ProcessorHandler>>(new Map());
  const [pendingActions, setPendingActions] = useState<PendingAction[]>(() =>
    getPendingActions(),
  );
  const [isProcessing, setIsProcessing] = useState(false);

  const refreshActions = useCallback(() => {
    setPendingActions(getPendingActions());
  }, []);

  const addAction = useCallback(
    (type: string, payload: Record<string, string>): PendingAction => {
      const action = addPendingAction(type, payload);
      refreshActions();
      return action;
    },
    [refreshActions],
  );

  const removeAction = useCallback(
    (id: string): void => {
      removePendingAction(id);
      refreshActions();
    },
    [refreshActions],
  );

  const registerProcessor = useCallback(
    (type: string, handler: ProcessorHandler): void => {
      processorsRef.current.set(type, handler);
    },
    [],
  );

  useEffect(() => {
    if (!stealthWallet.isReady) return;

    const actions = getPendingActions();
    if (actions.length === 0) return;

    const actionable = actions.filter(a =>
      processorsRef.current.has(a.type),
    );
    if (actionable.length === 0) return;

    let cancelled = false;

    async function processAll() {
      setIsProcessing(true);
      for (const action of actionable) {
        if (cancelled) break;
        const handler = processorsRef.current.get(action.type);
        if (!handler) continue;
        try {
          await handler(action);
          removePendingAction(action.id);
        } catch {
          // leave failed actions in the queue for retry
        }
      }
      if (!cancelled) {
        refreshActions();
        setIsProcessing(false);
      }
    }

    processAll();

    return () => {
      cancelled = true;
    };
    // only re-run when isReady transitions — intentionally omit refreshActions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stealthWallet.isReady]);

  return (
    <PendingContext.Provider
      value={{ pendingActions, addAction, removeAction, registerProcessor, isProcessing }}
    >
      {children}
    </PendingContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePendingContext(): PendingContextValue {
  const context = useContext(PendingContext);
  if (!context) {
    throw new Error("usePendingContext must be used within PendingProvider");
  }
  return context;
}
