import { useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, Check } from "lucide-react";
import type { SearchCriteria, SearchResult } from "../lib/types";
import { activeFilters, bodyTypeLabel } from "../lib/searchParams";
import { RangeSlider, MaxSlider } from "./RangeSlider";
import { Modal } from "./Modal";
import type { GeolocationState } from "../lib/useGeolocation";

const MAX_PRICE_RUPEES = 5000;
const MAX_ENGINE_CC = 1000;
const MAX_DISTANCE_KM = 50;

// `prices` (paise) must be every vehicle matching every OTHER active filter —
// never the already price-filtered result set, or committing a price range
// permanently hides the bars for everything outside it (nothing left to drag
// back open with).
function priceHistogram(prices: number[]): number[] {
  const buckets = new Array(20).fill(0);
  for (const p of prices) {
    const rupees = p / 100;
    const idx = Math.min(19, Math.floor((rupees / MAX_PRICE_RUPEES) * 20));
    buckets[idx]++;
  }
  return buckets;
}

/**
 * Every filter, in one modal.
 *
 * Was a 256px rail down the left of Browse with a phone-only modal fallback.
 * The map is permanent now and takes that width, so the modal — which already
 * rendered the identical content — became the only surface, at every size.
 */
export function FilterSheet({
  criteria,
  onChange,
  results,
  priceHistogram: priceHistogramSource,
  geo,
  open,
  onOpenChange,
}: {
  criteria: SearchCriteria;
  onChange: (patch: Partial<SearchCriteria>) => void;
  results: SearchResult[];
  priceHistogram: number[];
  geo: GeolocationState;
  /** The "Filters" pill lives in Browse's controls row, not here, so the open
   *  state is controlled from there. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const active = activeFilters(criteria);
  const makes = Array.from(new Set(results.map((r) => r.model.make))).sort();
  // Once a brand is selected, `results` only ever contains that one brand —
  // without this, the group (and its only way to clear the filter) would
  // vanish the instant you picked one.
  const showBrandGroup = makes.length > 1 || (criteria.make?.length ?? 0) > 0;

  // Same "don't let the group vanish once you pick one" rule as Brand: a
  // selected type narrows `results` to that type alone.
  const bodyTypes = Array.from(
    new Set(results.map((r) => r.model.bodyType).filter((b): b is string => !!b)),
  ).sort();
  const showBodyTypeGroup = bodyTypes.length > 1 || (criteria.bodyType?.length ?? 0) > 0;

  function toggleBodyType(bodyType: string) {
    const current = criteria.bodyType ?? [];
    const next = current.includes(bodyType)
      ? current.filter((b) => b !== bodyType)
      : [...current, bodyType];
    onChange({ bodyType: next.length > 0 ? next : undefined });
  }

  function toggleMake(make: string) {
    const current = criteria.make ?? [];
    const next = current.includes(make) ? current.filter((m) => m !== make) : [...current, make];
    onChange({ make: next.length > 0 ? next : undefined });
  }

  function toggleFuelType(ft: "PETROL" | "ELECTRIC") {
    const current = criteria.fuelType ?? [];
    const next = current.includes(ft) ? current.filter((f) => f !== ft) : [...current, ft];
    onChange({ fuelType: next.length > 0 ? next : undefined });
  }

  const groups = (
    <>
      {active.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {active.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onChange(f.clear)}
              className="inline-flex items-center gap-1 rounded-full bg-surface-3 text-ink-2 text-xs px-2.5 py-1 hover:bg-line transition-colors"
            >
              {f.label}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      {/* Sort is not a filter — it never counts toward the pill's badge — but
          it belongs to the same "narrow this down" moment, and the sheet is
          the only surface left out here. */}
      <Group title="Sort" defaultOpen>
        <Checkbox label="Price: low to high" checked={criteria.sort === "price"} onChange={() => onChange({ sort: "price" })} />
        <Checkbox label="Rating" checked={criteria.sort === "rating"} onChange={() => onChange({ sort: "rating" })} />
        {/* Hidden, not disabled: same gate as the Distance filter below, and an
            option you cannot pick is noise in a sheet you scroll. */}
        {geo.status === "granted" && (
          <Checkbox label="Distance" checked={criteria.sort === "distance"} onChange={() => onChange({ sort: "distance" })} />
        )}
      </Group>

      <Group title="Verification" defaultOpen>
        <Checkbox
          label="Verified vehicles only"
          checked={!!criteria.fullyVerified}
          onChange={(v) => onChange({ fullyVerified: v || undefined })}
        />
      </Group>

      {showBodyTypeGroup && (
        <Group title="Vehicle type" defaultOpen>
          {bodyTypes.map((bodyType) => (
            <Checkbox
              key={bodyType}
              label={bodyTypeLabel(bodyType)}
              checked={!!criteria.bodyType?.includes(bodyType)}
              onChange={() => toggleBodyType(bodyType)}
            />
          ))}
        </Group>
      )}

      <Group title="Fuel type" defaultOpen>
        <Checkbox
          label="Petrol"
          checked={!!criteria.fuelType?.includes("PETROL")}
          onChange={() => toggleFuelType("PETROL")}
        />
        <Checkbox
          label="Electric"
          checked={!!criteria.fuelType?.includes("ELECTRIC")}
          onChange={() => toggleFuelType("ELECTRIC")}
        />
      </Group>

      {showBrandGroup && (
        <Group title="Brand">
          {makes.map((make) => (
            <Checkbox key={make} label={make} checked={!!criteria.make?.includes(make)} onChange={() => toggleMake(make)} />
          ))}
        </Group>
      )}

      <Group title="Price per day" defaultOpen>
        <RangeSlider
          min={0}
          max={MAX_PRICE_RUPEES}
          step={50}
          lo={criteria.minPrice ? Math.round(criteria.minPrice / 100) : 0}
          hi={criteria.maxPrice ? Math.round(criteria.maxPrice / 100) : MAX_PRICE_RUPEES}
          onCommit={(lo, hi) =>
            onChange({
              minPrice: lo > 0 ? lo * 100 : undefined,
              maxPrice: hi < MAX_PRICE_RUPEES ? hi * 100 : undefined,
            })
          }
          format={(v) => (v >= MAX_PRICE_RUPEES ? `₹${v.toLocaleString("en-IN")}+` : `₹${v.toLocaleString("en-IN")}`)}
          histogram={priceHistogram(priceHistogramSource)}
        />
      </Group>

      <Group title="Engine power">
        <RangeSlider
          min={0}
          max={MAX_ENGINE_CC}
          step={25}
          lo={criteria.minEngineCc ?? 0}
          hi={criteria.maxEngineCc ?? MAX_ENGINE_CC}
          onCommit={(lo, hi) =>
            onChange({
              minEngineCc: lo > 0 ? lo : undefined,
              maxEngineCc: hi < MAX_ENGINE_CC ? hi : undefined,
            })
          }
          format={(v) => (v >= MAX_ENGINE_CC ? `${v}cc+` : `${v}cc`)}
        />
      </Group>

      {geo.status === "granted" && (
        <Group title="Distance">
          <MaxSlider
            min={1}
            max={MAX_DISTANCE_KM}
            step={1}
            value={criteria.maxDistanceKm ?? MAX_DISTANCE_KM}
            onCommit={(v) => onChange({ maxDistanceKm: v < MAX_DISTANCE_KM ? v : undefined })}
            format={(v) => (v >= MAX_DISTANCE_KM ? `Any distance` : `Within ${v} km`)}
          />
        </Group>
      )}

      <Group title="Rating">
        {[4.5, 4, 3.5].map((r) => (
          <Checkbox
            key={r}
            label={`${r}★ and up`}
            // "X and up" tiers nest — checking 3.5 already covers 4 and 4.5,
            // so a lower checked tier shows every tier above it as checked too.
            checked={criteria.minRating != null && r >= criteria.minRating}
            onChange={() => onChange({ minRating: criteria.minRating === r ? undefined : r })}
          />
        ))}
      </Group>
    </>
  );

  return (
    <Modal open={open} onClose={() => onOpenChange(false)} title="Filters">
      <div className="flex flex-col gap-1">{groups}</div>
    </Modal>
  );
}

function Group({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="border-b border-line py-3">
      <Collapsible.Trigger className="w-full list-none flex items-center justify-between cursor-pointer text-sm font-medium text-ink outline-none">
        {title}
        <ChevronDown
          className={`h-3 w-3 text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </Collapsible.Trigger>
      <Collapsible.Content
        className="overflow-hidden origin-top data-[state=open]:[animation:pop-open_340ms_cubic-bezier(0.34,1.56,0.64,1)] data-[state=closed]:[animation:pop-close_200ms_cubic-bezier(0.4,0,1,1)]"
      >
        <div className="mt-2 flex flex-col">{children}</div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}


function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5 py-1 text-sm text-ink text-left"
    >
      <span
        className={`shrink-0 w-4 h-4 rounded-[5px] border flex items-center justify-center transition-colors ${
          checked ? "bg-ink border-ink" : "border-line-strong"
        }`}
      >
        {checked && <Check className="h-3 w-3 text-surface" strokeWidth={3} />}
      </span>
      {label}
    </button>
  );
}
