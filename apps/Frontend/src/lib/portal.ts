import { useCallback, useEffect, useState } from "react";

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

/** Hooks re-read their portal's session when a non-React caller (a token
 *  refresh inside `portalFetch`) replaces it. */
const sessionListeners = new Set<(portal: Portal) => void>();

function writeSession(portal: Portal, session: Session | null) {
  try {
    if (session) localStorage.setItem(storageKey(portal), JSON.stringify(session));
    else localStorage.removeItem(storageKey(portal));
  } catch {
    // ponytail: best-effort only — a private-browsing tab that blocks storage
    // just means the session doesn't survive a refresh, not a crash.
  }
  for (const l of sessionListeners) l(portal);
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

  useEffect(() => {
    const onChange = (changed: Portal) => {
      if (changed === portal) setSession(readSession(portal));
    };
    sessionListeners.add(onChange);
    return () => {
      sessionListeners.delete(onChange);
    };
  }, [portal]);

  const set = useCallback(
    (tokens: { accessToken: string; refreshToken: string; role?: string } | null) => {
      const next = tokens ? { ...tokens, deviceId: deviceId() } : null;
      writeSession(portal, next);
      setSession(next);
    },
    [portal],
  );

  /** Revokes the refresh token server-side before clearing it locally — a
   *  cleared localStorage alone leaves the session usable for its full TTL. */
  const logout = useCallback(() => {
    const current = readSession(portal);
    if (current) {
      portalFetch(portal, "/auth/logout", {
        method: "POST",
        token: current.accessToken,
        body: { refreshToken: current.refreshToken },
      }).catch(() => {
        // Best-effort: a failed revoke must not trap the user in a signed-in UI.
      });
    }
    set(null);
  }, [portal, set]);

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

/** In-flight refresh per portal, so N requests failing at once rotate the
 *  refresh token once rather than racing and invalidating each other. */
const refreshInFlight: Partial<Record<Portal, Promise<Session | null>>> = {};

function refreshTokens(portal: Portal): Promise<Session | null> {
  const existing = refreshInFlight[portal];
  if (existing) return existing;

  const current = readSession(portal);
  if (!current) return Promise.resolve(null);

  const attempt = (async () => {
    try {
      const res = await fetch(`/api/${portal}/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: current.refreshToken, deviceId: current.deviceId }),
      });
      if (!res.ok) {
        // The refresh token is revoked or expired too — this session is over.
        writeSession(portal, null);
        return null;
      }
      const data = (await res.json()) as { accessToken: string; refreshToken: string };
      const next: Session = { ...current, accessToken: data.accessToken, refreshToken: data.refreshToken };
      writeSession(portal, next);
      return next;
    } catch {
      // Network failure, not an auth failure — keep the session, let the
      // caller surface the error.
      return null;
    } finally {
      delete refreshInFlight[portal];
    }
  })();

  refreshInFlight[portal] = attempt;
  return attempt;
}

function request(portal: Portal, path: string, options: { token?: string; method?: string; body?: unknown }) {
  return fetch(`/api/${portal}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

/**
 * Fetches `/api/<portal>${path}`, attaching the bearer token when present.
 *
 * A 401 on an authenticated request means the short-lived access token
 * expired, which is routine — the refresh token is rotated and the request
 * is retried once before the error reaches the caller.
 */
export async function portalFetch<T>(
  portal: Portal,
  path: string,
  options: { token?: string; method?: string; body?: unknown } = {},
): Promise<T> {
  let res = await request(portal, path, options);

  if (res.status === 401 && options.token && !path.startsWith("/auth/")) {
    const renewed = await refreshTokens(portal);
    if (renewed) res = await request(portal, path, { ...options, token: renewed.accessToken });
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PortalApiError(res.status, data.message ?? data.error ?? `request failed (${res.status})`);
  return data as T;
}

/** Generic row shape for admin/merchant list endpoints — mostly raw DB rows. */
export type Row = Record<string, unknown>;

/** Reads the `uid`/`mid`/`aid` claim out of an access token without verifying
 *  it — the server verifies on every request, this is only for the frontend
 *  to know "which row is mine" in an otherwise-public list. */
export function decodeJwtSubject(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")));
    return payload.uid ?? payload.mid ?? payload.aid ?? null;
  } catch {
    return null;
  }
}

/**
 * A 401 that survived `portalFetch`'s refresh retry means the session is
 * genuinely over — clear it so the UI re-renders as signed out. It does *not*
 * navigate: every page that cannot work anonymously already redirects on
 * `!session`, and a redirect here would throw a signed-out visitor off a
 * public page (a vehicle detail, a shop page) just because one authenticated
 * widget on it failed. Returns true when it handled the error.
 */
export function handleSessionExpiry(portal: Portal, err: unknown): boolean {
  if (err instanceof PortalApiError && err.status === 401) {
    writeSession(portal, null);
    return true;
  }
  return false;
}

/**
 * GET `/api/<portal>${path}` as state. `path: null` skips the fetch (e.g.
 * while a dependency like shopId is still loading). For data that needs a
 * manual refetch (after a mutation), call `portalFetch` directly and pass
 * errors through `handleSessionExpiry` instead.
 */
export function usePortalQuery<T>(portal: Portal, path: string | null, token: string | undefined) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path || !token) return;
    let cancelled = false;
    setData(null);
    setError(null);

    portalFetch<T>(portal, path, { token })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (cancelled || handleSessionExpiry(portal, err)) return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
      });

    return () => {
      cancelled = true;
    };
  }, [portal, path, token]);

  return { data, error };
}
