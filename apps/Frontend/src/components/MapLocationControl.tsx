import { useId, useRef, useState } from "react";
import { LoaderCircle, Navigation, X } from "lucide-react";
import type { GeolocationController, GeolocationState } from "../lib/useGeolocation";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/popover";

export function LocationHelp({ state, onRetry, onDismiss }: {
  state: GeolocationState;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const pending = state.status === "idle" || state.status === "asking";
  const message = pending ? "Finding your location…"
    : state.status === "denied" ? "Location access is blocked. Allow location in your browser’s site settings, then try again."
    : state.status === "unsupported" ? (state.reason === "insecure"
      ? "Location requires a secure connection. Open this site over HTTPS to use your location."
      : "Location isn’t supported in this browser. You can still explore shops on the map.")
    : "We couldn’t get your location. Try again.";
  return (
    <div className="relative p-4 pr-11">
      <p role="status" className="text-sm text-ink-2">{message}</p>
      {(state.status === "denied" || state.status === "error") && (
        <button type="button" onClick={onRetry} className="mt-3 text-sm font-semibold text-ink underline underline-offset-2">Try again</button>
      )}
      <button type="button" onClick={onDismiss} aria-label="Close location help" className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full text-ink-2">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function MapLocationControl({ geo, onLocate, className }: {
  geo: GeolocationController;
  onLocate: (position: { lat: number; lng: number }) => void;
  className: string;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const helpId = useId();
  async function locate() {
    if (geo.status === "asking") return;
    if (geo.status === "granted") {
      onLocate(geo);
      setHelpOpen(false);
      return;
    }
    setHelpOpen(true);
    const next = await geo.requestLocation();
    if (next.status === "granted") {
      onLocate(next);
      setHelpOpen(false);
    }
  }
  return (
    <Popover open={helpOpen} onOpenChange={setHelpOpen}>
      <PopoverAnchor asChild>
        <button ref={buttonRef} type="button" onClick={() => void locate()} disabled={geo.status === "asking"}
          className={`${className} disabled:opacity-50`} aria-label={geo.status === "asking" ? "Finding your location" : "Centre on my location"}
          aria-haspopup="dialog" aria-expanded={helpOpen} aria-controls={helpOpen ? helpId : undefined}
          aria-busy={geo.status === "asking"} title="Centre on my location">
          {geo.status === "asking" ? <LoaderCircle className="h-[18px] w-[18px] animate-spin motion-reduce:animate-none" /> : <Navigation className="h-[18px] w-[18px] -rotate-45" />}
        </button>
      </PopoverAnchor>
      <PopoverContent id={helpId} side="left" align="start" className="w-[min(18rem,calc(100vw-1.5rem))]" aria-label="Location help"
        onCloseAutoFocus={(e) => { e.preventDefault(); buttonRef.current?.focus(); }}>
        <LocationHelp state={geo} onRetry={() => void locate()} onDismiss={() => setHelpOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
