// pending-engine.ts — localStorage CRUD for pending actions

const STORAGE_KEY = "xylkstream_pending_actions";

export interface PendingAction {
  id: string;
  type: string;
  payload: Record<string, string>;
  createdAt: number;
}

export function getPendingActions(): PendingAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addPendingAction(
  type: string,
  payload: Record<string, string>,
): PendingAction {
  const action: PendingAction = {
    id: crypto.randomUUID(),
    type,
    payload,
    createdAt: Date.now(),
  };
  const current = getPendingActions();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, action]));
  } catch {
    // storage may be full or unavailable — no-op
  }
  return action;
}

export function removePendingAction(id: string): void {
  const filtered = getPendingActions().filter(a => a.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // no-op
  }
}

export function clearPendingActions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}

export function getPendingByType(type: string): PendingAction[] {
  return getPendingActions().filter(a => a.type === type);
}
