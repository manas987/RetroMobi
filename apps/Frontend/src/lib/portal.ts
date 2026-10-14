import { useCallback, useState } from "react";

export type Portal = "merchant" | "admin" | "user";

export interface Session {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  /** Admin's role (SUPPORT/ADMIN/SUPER_ADMIN), unused by the merchant portal. */
  role?: string;
}

function storageKey(portal: Portal) {
  return `retromobi_${portal}_session`;
}

function readSession(portal: Portal): Session | null {
  try {
    const raw = localStorage.getItem(storageKey(portal));
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeSession(portal: Portal, session: Session | null) {
  try {
    if (session) localStorage.setItem(storageKey(portal), JSON.stringify(session));
    else localStorage.removeItem(storageKey(portal));
  } catch {
    // ponytail: best-effort only — a private-browsing tab that blocks storage
    // just means the session doesn't survive a refresh, not a crash.
  }
}

function deviceId(): string {
  const KEY = "retromobi_device_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

/** Session state + phone-OTP login for a merchant or admin portal. */
export function usePortalSession(portal: Portal) {
  const [session, setSession] = useState<Session | null>(() => readSession(portal));

  const set = useCallback(
    (tokens: { accessToken: string; refreshToken: string; role?: string } | null) => {
      const next = tokens ? { ...tokens, deviceId: deviceId() } : null;
      writeSession(portal, next);
      setSession(next);
    },
    [portal],
  );

  const logout = useCallback(() => set(null), [set]);

  return { session, setTokens: set, logout, deviceId: deviceId() };
}

export class PortalApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Fetches `/api/<portal>${path}`, attaching the bearer token when present. */
export async function portalFetch<T>(
  portal: Portal,
  path: string,
  options: { token?: string; method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`/api/${portal}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PortalApiError(res.status, data.message ?? data.error ?? `request failed (${res.status})`);
  return data as T;
}

/** Generic row shape for admin/merchant list endpoints — mostly raw DB rows. */
export type Row = Record<string, unknown>;
