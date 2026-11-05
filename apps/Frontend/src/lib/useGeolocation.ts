import { useCallback, useEffect, useRef, useState } from "react";

export type GeolocationState =
  | { status: "idle" | "asking" }
  | { status: "granted"; lat: number; lng: number }
  | { status: "denied" }
  | { status: "unsupported"; reason: "insecure" | "unavailable" }
  | { status: "error"; reason: "timeout" | "unavailable" };

export type GeolocationController = GeolocationState & {
  requestLocation: () => Promise<GeolocationState>;
};

export async function getLocation(
  platform: { geolocation?: Pick<Geolocation, "getCurrentPosition">; permissions?: Pick<Permissions, "query"> },
  secure: boolean,
): Promise<GeolocationState> {
  if (!secure) return { status: "unsupported", reason: "insecure" };
  if (!platform.geolocation) return { status: "unsupported", reason: "unavailable" };
  try {
    const permission = await platform.permissions?.query({ name: "geolocation" });
    if (permission?.state === "denied") return { status: "denied" };
  } catch {
    // Some browsers expose Permissions but do not support its geolocation query.
  }
  return new Promise((resolve) => {
    try {
      platform.geolocation!.getCurrentPosition(
        (pos) => resolve({ status: "granted", lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (error) => resolve(error.code === 1
          ? { status: "denied" }
          : { status: "error", reason: error.code === 3 ? "timeout" : "unavailable" }),
        { timeout: 8000, maximumAge: 5 * 60 * 1000 },
      );
    } catch {
      resolve({ status: "error", reason: "unavailable" });
    }
  });
}

/** Coordinates stay in memory; autoRequest defaults on for existing callers. */
export function useGeolocation({ autoRequest = true } = {}): GeolocationController {
  const [state, setState] = useState<GeolocationState>({ status: "idle" });
  const mounted = useRef(true);
  const pending = useRef<Promise<GeolocationState> | null>(null);

  const requestLocation = useCallback(() => {
    if (pending.current) return pending.current;
    setState({ status: "asking" });
    pending.current = getLocation(navigator, window.isSecureContext).then((next) => {
      pending.current = null;
      if (mounted.current) setState(next);
      return next;
    });
    return pending.current;
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (autoRequest) void requestLocation();
    return () => { mounted.current = false; };
  }, [autoRequest, requestLocation]);

  return { ...state, requestLocation };
}
