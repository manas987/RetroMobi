import type { SearchCriteria } from "../lib/types";
import { activeFilters } from "../lib/searchParams";
import { PriceRangeSlider } from "./PriceRangeSlider";

export function FilterRail({
  criteria,
  onChange,
}: {
  criteria: SearchCriteria;
  onChange: (patch: Partial<SearchCriteria>) => void;
}) {
  const active = activeFilters(criteria);

  return (
    <aside className="w-full lg:w-64 shrink-0 flex flex-col gap-1">
      {active.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {active.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onChange({ [f.key]: undefined } as Partial<SearchCriteria>)}
              className="inline-flex items-center gap-1 rounded-full bg-surface-3 text-ink-2 text-xs px-2.5 py-1 hover:bg-line transition-colors"
            >
              {f.label}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      <Group title="Verification" defaultOpen>
        <label className="flex items-center gap-2 py-1 text-sm text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={!!criteria.fullyVerified}
            onChange={(e) => onChange({ fullyVerified: e.target.checked || undefined })}
            className="accent-amber-edge w-4 h-4"
          />
          Licensed to rent — verified only
        </label>
      </Group>

      <Group title="Fuel type" defaultOpen>
        <RadioRow
          label="All"
          checked={!criteria.fuelType}
          onClick={() => onChange({ fuelType: undefined })}
        />
        <RadioRow
          label="Petrol"
          checked={criteria.fuelType === "PETROL"}
          onClick={() => onChange({ fuelType: "PETROL" })}
        />
        <RadioRow
          label="Electric"
          checked={criteria.fuelType === "ELECTRIC"}
          onClick={() => onChange({ fuelType: "ELECTRIC" })}
        />
      </Group>

      <Group title="Price per day" defaultOpen>
        <PriceRangeSlider
          minPaise={criteria.minPrice}
          maxPaise={criteria.maxPrice}
          onCommit={(minPrice, maxPrice) => onChange({ minPrice, maxPrice })}
        />
      </Group>

      <Group title="Rating">
        {[4.5, 4, 3.5].map((r) => (
          <RadioRow
            key={r}
            label={`${r}★ and up`}
            checked={criteria.minRating === r}
            onClick={() => onChange({ minRating: criteria.minRating === r ? undefined : r })}
          />
        ))}
      </Group>
    </aside>
  );
}

function Group({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details className="border-b border-line py-3 group" open={defaultOpen}>
      <summary className="list-none flex items-center justify-between cursor-pointer text-sm font-medium text-ink">
        {title}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          className="text-ink-3 transition-transform group-open:rotate-180"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="mt-2 flex flex-col">{children}</div>
    </details>
  );
}

function RadioRow({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left text-sm py-1.5 px-1 rounded-row ${checked ? "text-ink font-medium" : "text-ink-2"} hover:bg-surface-3 transition-colors`}
    >
      {checked ? "● " : "○ "}
      {label}
    </button>
  );
}
