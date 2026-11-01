import { useEffect, useState } from "react";
import { combine, splitIso } from "./DateTimeField";
import { DateRangeField } from "./DateRangeField";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { toIsoWithOffset } from "../lib/searchParams";

export const CITIES = ["Dehradun", "Haridwar", "Rishikesh"];

export interface SearchCapsuleValue {
  city: string;
  pickupAt: string;
  returnAt: string;
}

export function SearchCapsule({
  initial,
  onSearch,
  compact = false,
}: {
  initial: SearchCapsuleValue;
  onSearch: (v: SearchCapsuleValue) => void;
  compact?: boolean;
}) {
  const [city, setCity] = useState(initial.city);

  // Browse lands with no city in the URL, so `initial.city` starts as "" —
  // the dropdown locks onto that empty value (useState's initializer only
  // runs once on mount) even after Browse's own bootstrap effect silently
  // navigates to a real default city and the results grid updates. Stay in
  // sync with whatever the URL actually ends up saying.
  useEffect(() => setCity(initial.city), [initial.city]);

  const initPickup = splitIso(initial.pickupAt);
  const initReturn = splitIso(initial.returnAt);
  const [pickupDate, setPickupDate] = useState(initPickup.date);
  const [pickupTime, setPickupTime] = useState(initPickup.time);
  const [returnDate, setReturnDate] = useState(initReturn.date);
  const [returnTime, setReturnTime] = useState(initReturn.time);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!city) return;
    onSearch({
      city,
      pickupAt: toIsoWithOffset(combine(pickupDate, pickupTime)),
      returnAt: toIsoWithOffset(combine(returnDate, returnTime)),
    });
  }

  // Changing the city only moves the trigger label if it waits for the
  // Search button — the results grid stays on the old city in the meantime,
  // looking like it belongs to the newly-picked one. Search right away.
  function changeCity(next: string) {
    setCity(next);
    onSearch({
      city: next,
      pickupAt: toIsoWithOffset(combine(pickupDate, pickupTime)),
      returnAt: toIsoWithOffset(combine(returnDate, returnTime)),
    });
  }

  return (
    <form
      onSubmit={submit}
      className={`bg-surface rounded-panel shadow-[0_1px_2px_rgba(18,22,26,0.06),0_12px_32px_rgba(18,22,26,0.1)] border border-line flex flex-col min-[900px]:flex-row ${compact ? "text-sm" : ""}`}
    >
      <Field label="Pick-up location">
        <Select value={city} onValueChange={changeCity}>
          <SelectTrigger className="h-auto w-full border-0 rounded-none bg-transparent p-0 justify-start gap-1.5 text-ink font-medium hover:bg-transparent">
            <SelectValue className="truncate" />
          </SelectTrigger>
          <SelectContent>
            {CITIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}, Uttarakhand
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Divider />
      <div className="px-4 py-2.5 shrink-0">
        <DateRangeField
          label=""
          pickupDate={pickupDate}
          pickupTime={pickupTime}
          returnDate={returnDate}
          returnTime={returnTime}
          onPickupDate={setPickupDate}
          onReturnDate={setReturnDate}
          onPickupTime={setPickupTime}
          onReturnTime={setReturnTime}
        />
      </div>
      <div className="p-2 flex items-stretch">
        <button
          type="submit"
          className="w-full min-[900px]:w-auto px-6 rounded-row bg-amber text-on-amber font-semibold text-sm flex items-center justify-center gap-2 hover:brightness-95 transition-[filter]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Search
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-0 px-4 py-2.5 flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-ink-3">{label}</span>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="hidden min-[900px]:block w-px my-2 bg-line" />;
}
