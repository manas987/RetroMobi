import { useEffect, useState } from "react";

export type GeolocationState =
  | { status: "idle" | "asking" }
  | { status: "granted"; lat: number; lng: number }
  | { status: "denied" | "unsupported" | "error" };

/** Asks for the browser's geolocation permission once on mount. The
 *  coordinates never leave this hook's state — not written to the URL, not
 *  persisted to storage, not saved to the user's account. Callers that want
 *  server-computed distances pass them as a one-off request param. */
export function useGeolocation(): GeolocationState {
  const [state, setState] = useState<GeolocationState>({ status: "idle" });

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setState({ status: "unsupported" });
      return;
    }
    setState({ status: "asking" });
    navigator.geolocation.getCurrentPosition(
      (pos) => setState({ status: "granted", lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setState({ status: "denied" }),
      { timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  return state;
}
