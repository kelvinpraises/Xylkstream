import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { config } from "@/config";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function decodeTokenDebug(token: string | null): string {
  if (!token) return "token=NULL";
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const now = Math.floor(Date.now() / 1000);
    const exp = payload.exp ?? 0;
    const iat = payload.iat ?? 0;
    return `sub=${payload.sub} aud=${payload.aud} iat=${new Date(iat * 1000).toISOString()} exp=${new Date(exp * 1000).toISOString()} expired=${now > exp} ttl=${exp - now}s`;
  } catch {
    return `token=MALFORMED (len=${token.length})`;
  }
}

async function circlesApi(
  path: string,
  getToken: () => Promise<string | null>,
  options?: RequestInit,
) {
  const token = await getToken();
  const res = await fetch(`${config.API_URL}/circles${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      console.error(`[circles] 401 on ${options?.method ?? "GET"} ${path}`, decodeTokenDebug(token));
    }
    throw new ApiError(body.error || `Request failed: ${res.status}`, res.status);
  }
  return res.json();
}

export function useCircles() {
  const { getAccessToken, ready, authenticated } = usePrivy();
  return useQuery({
    queryKey: ["circles"],
    queryFn: () => circlesApi("/", getAccessToken),
    select: (data) => data.circles as CircleListItem[],
    enabled: ready && authenticated,
    retry: (count, error) => error instanceof ApiError && error.status === 401 ? false : count < 3,
  });
}

export interface CircleListItem {
  id: number;
  name: string;
  invite_code: string;
  member_count: number;
  created_at: string;
}

export interface CircleMember {
  id: number;
  encrypted_stealth_address: string;
  ephemeral_pubkey: string;
  status: "pending" | "approved" | "rejected";
  joined_at: string;
}

export interface CircleDetail {
  circle: CircleListItem;
  members: CircleMember[];
}

export function useCircle(circleId: number) {
  const { getAccessToken, ready, authenticated } = usePrivy();
  return useQuery({
    queryKey: ["circles", circleId],
    queryFn: () => circlesApi(`/${circleId}`, getAccessToken) as Promise<CircleDetail>,
    enabled: !!circleId && ready && authenticated,
    retry: (count, error) => error instanceof ApiError && error.status === 401 ? false : count < 3,
  });
}

export function useCreateCircle() {
  const queryClient = useQueryClient();
  const { getAccessToken } = usePrivy();
  return useMutation({
    mutationFn: (params: {
      name: string;
      inviteCode: string;
      encryptionPubKey: string;
    }) =>
      circlesApi("/", getAccessToken, {
        method: "POST",
        body: JSON.stringify(params),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["circles"] }),
  });
}

export function useJoinCircle() {
  const queryClient = useQueryClient();
  const { getAccessToken } = usePrivy();
  return useMutation({
    mutationFn: (params: {
      inviteCode: string;
      encryptedStealthAddress: string;
      ephemeralPubKey: string;
    }) =>
      circlesApi("/join", getAccessToken, {
        method: "POST",
        body: JSON.stringify(params),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["circles"] }),
  });
}

export function useValidateInvite(inviteCode: string | null) {
  return useQuery({
    queryKey: ["circles", "validate", inviteCode],
    queryFn: () =>
      fetch(`${config.API_URL}/circles/validate/${inviteCode}`).then((r) => {
        if (!r.ok) throw new Error("Invalid invite");
        return r.json();
      }),
    enabled: !!inviteCode,
  });
}

export function useUpdateCircleName() {
  const queryClient = useQueryClient();
  const { getAccessToken } = usePrivy();
  return useMutation({
    mutationFn: ({ circleId, name }: { circleId: number; name: string }) =>
      circlesApi(`/${circleId}`, getAccessToken, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["circles"] });
      queryClient.invalidateQueries({ queryKey: ["circles", vars.circleId] });
    },
  });
}

export function useUpdateMemberStatus() {
  const queryClient = useQueryClient();
  const { getAccessToken } = usePrivy();
  return useMutation({
    mutationFn: ({
      circleId,
      memberId,
      status,
    }: {
      circleId: number;
      memberId: number;
      status: "pending" | "approved" | "rejected";
    }) =>
      circlesApi(`/${circleId}/members/${memberId}/status`, getAccessToken, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_data, vars) =>
      queryClient.invalidateQueries({ queryKey: ["circles", vars.circleId] }),
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  const { getAccessToken } = usePrivy();
  return useMutation({
    mutationFn: ({
      circleId,
      memberId,
    }: {
      circleId: number;
      memberId: number;
    }) =>
      circlesApi(`/${circleId}/members/${memberId}`, getAccessToken, {
        method: "DELETE",
      }),
    onSuccess: (_data, vars) =>
      queryClient.invalidateQueries({ queryKey: ["circles", vars.circleId] }),
  });
}
