import type { SearchCriteria, SearchResult } from "../lib/types";
import { bodyTypeLabel } from "../lib/searchParams";
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
  total,
  open,
  onOpenChange,
}: {
  criteria: SearchCriteria;
  onChange: (patch: Partial<SearchCriteria>) => void;
  results: SearchResult[];
  priceHistogram: number[];
  geo: GeolocationState;
  /** Matches across every page, not just this one — what the footer button
   *  promises to show. */
  total: number;
  /** The "Filters" pill lives in Browse's controls row, not here, so the open
   *  state is controlled from there. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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

  // One patch, not a fold over activeFilters()' `clear` entries — those are
  // incremental (they drop *one* body type), so merging them would leave a
  // multi-value filter half set.
  function clearAll() {
    onChange({
      bodyType: undefined,
      fuelType: undefined,
      make: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      minEngineCc: undefined,
      maxEngineCc: undefined,
      maxDistanceKm: undefined,
      minRating: undefined,
      fullyVerified: undefined,
      seatingCapacity: undefined,
    });
  }

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title="Filters"
      size="lg"
      footer={
        <>
          <button
            type="button"
            onClick={clearAll}
            className="text-sm font-medium text-ink underline underline-offset-2 hover:text-ink-2 transition-colors"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-11 px-6 rounded-full bg-ink text-surface text-sm font-semibold hover:bg-ink-2 transition-colors"
          >
            Show {total} {total === 1 ? "vehicle" : "vehicles"}
          </button>
        </>
      }
    >
      {/* Sort is the one single-choice group, so it is the one that gets a
          segmented track — a chip row would not say "pick exactly one". */}
      <Section title="Sort">
        <Segmented
          value={criteria.sort}
          onChange={(sort) => onChange({ sort: sort as SearchCriteria["sort"] })}
          options={[
            { value: "price", label: "Price" },
            { value: "rating", label: "Rating" },
            // Hidden, not disabled: same gate as the Distance filter below,
            // and an option you cannot pick is noise in a sheet you scroll.
            ...(geo.status === "granted" ? [{ value: "distance", label: "Distance" }] : []),
          ]}
        />
      </Section>

      <Section title="Verification">
        <ChipRow>
          <Chip
            label="Verified vehicles only"
            selected={!!criteria.fullyVerified}
            onClick={() => onChange({ fullyVerified: criteria.fullyVerified ? undefined : true })}
          />
        </ChipRow>
      </Section>

      {showBodyTypeGroup && (
        <Section title="Vehicle type">
          <ChipRow>
            {bodyTypes.map((bodyType) => (
              <Chip
                key={bodyType}
                label={bodyTypeLabel(bodyType)}
                selected={!!criteria.bodyType?.includes(bodyType)}
                onClick={() => toggleBodyType(bodyType)}
              />
            ))}
          </ChipRow>
        </Section>
      )}

      <Section title="Fuel type">
        <ChipRow>
          <Chip label="Petrol" selected={!!criteria.fuelType?.includes("PETROL")} onClick={() => toggleFuelType("PETROL")} />
          <Chip label="Electric" selected={!!criteria.fuelType?.includes("ELECTRIC")} onClick={() => toggleFuelType("ELECTRIC")} />
        </ChipRow>
      </Section>

      {showBrandGroup && (
        <Section title="Brand">
          <ChipRow>
            {makes.map((make) => (
              <Chip key={make} label={make} selected={!!criteria.make?.includes(make)} onClick={() => toggleMake(make)} />
            ))}
          </ChipRow>
        </Section>
      )}

      <Section title="Price per day">
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
      </Section>

      <Section title="Engine power">
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
      </Section>

      {geo.status === "granted" && (
        <Section title="Distance">
          <MaxSlider
            min={1}
            max={MAX_DISTANCE_KM}
            step={1}
            value={criteria.maxDistanceKm ?? MAX_DISTANCE_KM}
            onCommit={(v) => onChange({ maxDistanceKm: v < MAX_DISTANCE_KM ? v : undefined })}
            format={(v) => (v >= MAX_DISTANCE_KM ? `Any distance` : `Within ${v} km`)}
          />
        </Section>
      )}

      <Section title="Rating" last>
        <ChipRow>
          {[4.5, 4, 3.5].map((r) => (
            <Chip
              key={r}
              label={`${r}★ and up`}
              // "X and up" tiers nest — checking 3.5 already covers 4 and 4.5,
              // so a lower selected tier shows every tier above it selected too.
              selected={criteria.minRating != null && r >= criteria.minRating}
              onClick={() => onChange({ minRating: criteria.minRating === r ? undefined : r })}
            />
          ))}
        </ChipRow>
      </Section>
    </Modal>
  );
}

function Section({ title, last, children }: { title: string; last?: boolean; children: React.ReactNode }) {
  return (
    <section className={`py-6 ${last ? "" : "border-b border-line"}`}>
      <h3 className="text-lg font-semibold text-ink mb-4">{title}</h3>
      {children}
    </section>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2.5">{children}</div>;
}

/* border-2 in both states, not just the selected one — a border that thickens
   on selection would shift every chip beside it by a pixel. */
function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full border-2 px-4 py-2.5 text-sm transition-colors ${
        selected ? "border-ink bg-surface-3 text-ink font-medium" : "border-line text-ink-2 hover:border-line-strong"
      }`}
    >
      {label}
    </button>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex bg-surface-3 rounded-full p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`flex-1 rounded-full py-2.5 text-sm transition-colors ${
            value === o.value ? "bg-surface text-ink font-medium shadow-[0_1px_3px_rgba(18,22,26,0.14)]" : "text-ink-2 hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
