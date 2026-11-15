import { apiPortal, apiUrl } from "./config";
import { getSession, setSession, type Session } from "./session";

/** Same shape as the website's PortalApiError: screens key their copy off `code`. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** The server's machine-readable `error`, e.g. "payments_unavailable". "" when there is none. */
    public code: string = "",
    /** Seconds to wait, on a 429. */
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

/** The request never reached the server: offline, DNS, timeout. */
export class NetworkError extends Error {
  constructor(message = "Couldn't reach RetroMobi. Check your connection and try again.") {
    super(message);
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Send the bearer token. Default: true whenever someone is signed in. */
  auth?: boolean;
  /** Cancels the request; TanStack Query passes one to every queryFn. */
  signal?: AbortSignal;
  /** Milliseconds before giving up. Hill data is slow, so the default is generous. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

async function send(path: string, options: RequestOptions, token: string | undefined): Promise<Response> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onOuterAbort = () => timeout.abort();
  options.signal?.addEventListener("abort", onOuterAbort);
  try {
    return await fetch(apiUrl(path), {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: timeout.signal,
    });
  } catch (err) {
    // The caller cancelled (screen closed, query superseded): pass that through untouched.
    if (options.signal?.aborted) throw err;
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onOuterAbort);
  }
}

/**
 * One refresh at a time. A cold foreground fires several queries into an
 * expired 15-minute access token at once; the refresh token rotates on use, so
 * N parallel refreshes would invalidate each other and sign the user out.
 */
let refreshInFlight: Promise<Session | null> | null = null;

function refreshTokens(): Promise<Session | null> {
  if (refreshInFlight) return refreshInFlight;
  const before = getSession();
  if (!before) return Promise.resolve(null);

  refreshInFlight = (async () => {
    try {
      const res = await send("/auth/refresh", { method: "POST", body: { refreshToken: before.refreshToken, deviceId: before.deviceId } }, undefined);
      if (!res.ok) {
        // Revoked or expired: this session is over.
        if (res.status === 401 || res.status === 400) setSession(null);
        return null;
      }
      const data = (await res.json()) as { accessToken: string; refreshToken: string };
      setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return getSession();
    } catch {
      // Network failure, not an auth failure: keep the session, let the caller show the error.
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/**
 * Calls `/api/<portal>${path}`. A 401 on a signed-in request means the short
 * access token expired, which is routine: the tokens are refreshed and the
 * request retried once. A 401 that survives that clears the session, and every
 * screen that needs one reacts to `useSession()` becoming null.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const useAuth = options.auth ?? true;
  const token = useAuth ? getSession()?.accessToken : undefined;
  let res = await send(path, options, token);

  if (res.status === 401 && token && !path.startsWith("/auth/")) {
    const renewed = await refreshTokens();
    if (renewed) res = await send(path, options, renewed.accessToken);
    if (res.status === 401) setSession(null);
  }

  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; retryAfterSeconds?: number };
  if (!res.ok) {
    throw new ApiError(res.status, data.message ?? data.error ?? `request failed (${res.status})`, data.error ?? "", data.retryAfterSeconds);
  }
  return data as T;
}

/** Revokes the refresh token server-side, then signs out locally either way. */
export async function logout(): Promise<void> {
  const session = getSession();
  if (session) {
    await api("/auth/logout", { method: "POST", body: { refreshToken: session.refreshToken } }).catch(() => {});
  }
  setSession(null);
}

/** A 4xx won't fix itself; a dropped connection or a 5xx might. For TanStack Query's `retry`. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < 2;
}

/** Human text for a caught error when the screen has no better copy of its own. */
export function errorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (err instanceof NetworkError) return err.message;
  if (err instanceof ApiError) return err.message || fallback;
  return fallback;
}

export { apiPortal };
