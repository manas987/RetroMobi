import { useState } from "react";
import { toIsoWithOffset } from "../lib/searchParams";

const CITIES = ["Dehradun", "Haridwar", "Rishikesh"];

/** <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm", our ISO carries an offset too. */
function toLocalInputValue(iso: string): string {
  return iso.slice(0, 16);
}

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
  const [pickupAt, setPickupAt] = useState(toLocalInputValue(initial.pickupAt));
  const [returnAt, setReturnAt] = useState(toLocalInputValue(initial.returnAt));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!city || !pickupAt || !returnAt) return;
    onSearch({
      city,
      pickupAt: toIsoWithOffset(new Date(pickupAt)),
      returnAt: toIsoWithOffset(new Date(returnAt)),
    });
  }

  return (
    <form
      onSubmit={submit}
      className={`bg-surface rounded-panel shadow-[0_1px_2px_rgba(18,22,26,0.06),0_12px_32px_rgba(18,22,26,0.1)] border border-line flex flex-col sm:flex-row ${compact ? "text-sm" : ""}`}
    >
      <Field label="Pick-up location">
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-full bg-transparent outline-none text-ink font-medium"
        >
          {CITIES.map((c) => (
            <option key={c} value={c}>
              {c}, Uttarakhand
            </option>
          ))}
        </select>
      </Field>
      <Divider />
      <Field label="Pick-up">
        <input
          type="datetime-local"
          value={pickupAt}
          onChange={(e) => setPickupAt(e.target.value)}
          className="w-full bg-transparent outline-none text-ink font-medium"
        />
      </Field>
      <Divider />
      <Field label="Return">
        <input
          type="datetime-local"
          value={returnAt}
          onChange={(e) => setReturnAt(e.target.value)}
          className="w-full bg-transparent outline-none text-ink font-medium"
        />
      </Field>
      <div className="p-2 flex items-stretch">
        <button
          type="submit"
          className="w-full sm:w-auto px-6 rounded-row bg-amber text-on-amber font-semibold text-sm flex items-center justify-center gap-2 hover:brightness-95 transition-[filter]"
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
    <label className="flex-1 min-w-0 px-4 py-2.5 flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-ink-3">{label}</span>
      {children}
    </label>
  );
}

function Divider() {
  return <div className="hidden sm:block w-px my-2 bg-line" />;
}

