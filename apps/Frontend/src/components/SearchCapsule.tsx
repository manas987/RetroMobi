import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { combine, formatTime, splitIso } from "./DateTimeField";
import { RangeCalendar } from "./RangeCalendar";
import { Modal } from "./Modal";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/popover";
import { formatDuration, isSameDay } from "../lib/dateRange";
import { useMediaQuery } from "../lib/useMediaQuery";
import { toIsoWithOffset } from "../lib/searchParams";

// One list, two shapes: the panel reads the whole row, Footer only wants names.
const CITY_LIST = [
  { name: "Dehradun", blurb: "Valley base for the hills", tint: "bg-verified-soft", icon: <RidgeIcon /> },
  { name: "Haridwar", blurb: "Temple town on the Ganga", tint: "bg-amber-soft", icon: <TempleIcon /> },
  { name: "Rishikesh", blurb: "Rafting and yoga country", tint: "bg-[#eef2f6]", icon: <RiverIcon /> },
];

export const CITIES = CITY_LIST.map((c) => c.name);

export interface SearchCapsuleValue {
  city: string;
  pickupAt: string;
  returnAt: string;
}

type Field = "where" | "when";

/** "" means the person has not picked yet. Anything else is a real ISO stamp. */
function splitOrBlank(iso: string, fallbackTime: string): { date: Date | null; time: string } {
  return iso ? splitIso(iso) : { date: null, time: fallbackTime };
}

export function SearchCapsule({
  initial,
  onSearch,
  compact = false,
  className = "",
}: {
  initial: SearchCapsuleValue;
  onSearch: (v: SearchCapsuleValue) => void;
  compact?: boolean;
  /** Width and placement are the caller's business — this component carries no
   *  margin or positioning of its own, so it drops into a hero, a toolbar or a
   *  centred overlay unchanged. */
  className?: string;
}) {
  const [city, setCity] = useState(initial.city);

  // Browse lands with no city in the URL, so `initial.city` starts as "" —
  // the dropdown locks onto that empty value (useState's initializer only
  // runs once on mount) even after Browse's own bootstrap effect silently
  // navigates to a real default city and the results grid updates. Stay in
  // sync with whatever the URL actually ends up saying.
  useEffect(() => setCity(initial.city), [initial.city]);

  // An empty string means "not chosen yet" — the homepage opens blank rather
  // than guessing a city and a window on someone's behalf. splitIso on "" would
  // give an Invalid Date and a "NaN:NaN" time, so it never sees one.
  const initPickup = splitOrBlank(initial.pickupAt, "10:00");
  const initReturn = splitOrBlank(initial.returnAt, "22:00");
  const [pickupDate, setPickupDate] = useState<Date | null>(initPickup.date);
  const [pickupTime, setPickupTime] = useState(initPickup.time);
  const [returnDate, setReturnDate] = useState<Date | null>(initReturn.date);
  const [returnTime, setReturnTime] = useState(initReturn.time);

  const ready = Boolean(city && pickupDate && returnDate);

  const isDesktop = useMediaQuery("(min-width: 900px)");
  const [active, setActive] = useState<Field | null>(null);

  // The panel stays mounted while it fades out, so it has to keep rendering
  // the field that was open rather than falling back to the other one.
  const lastField = useRef<Field>("where");
  if (active) lastField.current = active;
  const shown = active ?? lastField.current;

  function runSearch() {
    if (!pickupDate || !returnDate) return;
    // Enter in the calendar can reach here with the dates done and Where still
    // blank — the state the homepage opens in. Move to the field that is
    // actually missing rather than inventing a destination.
    if (!city) {
      setActive("where");
      return;
    }
    setActive(null);
    onSearch({
      city,
      pickupAt: toIsoWithOffset(combine(pickupDate, pickupTime)),
      returnAt: toIsoWithOffset(combine(returnDate, returnTime)),
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    runSearch();
  }

  // Changing the city only moves the trigger label if it waits for the
  // Search button — the results grid stays on the old city in the meantime,
  // looking like it belongs to the newly-picked one. Search right away.
  function changeCity(next: string) {
    setCity(next);
    setActive(null);
    // Only when there is a window to search in. On the homepage the dates are
    // still blank at this point, and searching now would mean inventing one.
    if (!pickupDate || !returnDate) return;
    onSearch({
      city: next,
      pickupAt: toIsoWithOffset(combine(pickupDate, pickupTime)),
      returnAt: toIsoWithOffset(combine(returnDate, returnTime)),
    });
  }

  // --- the travelling pill -------------------------------------------------
  // A single element that moves between segments rather than a background on
  // each one, because only one element can animate from one place to another.
  const formRef = useRef<HTMLFormElement>(null);
  const whereRef = useRef<HTMLDivElement>(null);
  const whenRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    function measure() {
      // Parked on Where when nothing is open, so the first click doesn't slide
      // the pill in from the form's left edge.
      const el = (active === "when" ? whenRef : whereRef).current;
      if (!el || !formRef.current) return;
      const box = formRef.current.getBoundingClientRect();
      const seg = el.getBoundingClientRect();
      setPill({ left: seg.left - box.left, width: seg.width });
    }
    measure();
    // Watching the fields rather than the window also covers a late webfont
    // reflowing them, and costs less than a resize listener that fires for
    // every window change whether or not this bar moved.
    const ro = new ResizeObserver(measure);
    for (const el of [whereRef.current, whenRef.current]) if (el) ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  const dayLabel = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const whenValue =
    pickupDate && returnDate
      ? isSameDay(pickupDate, returnDate)
        ? `${dayLabel(pickupDate)} · ${formatTime(pickupTime)} – ${formatTime(returnTime)}`
        : `${dayLabel(pickupDate)}, ${formatTime(pickupTime)} – ${dayLabel(returnDate)}, ${formatTime(returnTime)}`
      : null;

  const calendar = (months: number) => (
    <RangeCalendar
      months={months}
      pickupDate={pickupDate}
      pickupTime={pickupTime}
      returnDate={returnDate}
      returnTime={returnTime}
      onPickupDate={setPickupDate}
      onReturnDate={setReturnDate}
      onPickupTime={setPickupTime}
      onReturnTime={setReturnTime}
      onEnter={runSearch}
    />
  );

  const pad = compact ? "px-7 py-3" : "px-7 py-3 min-[900px]:py-4";

  const bar = (
    <form
      ref={formRef}
      onSubmit={submit}
      className={`group relative border border-line shadow-[0_1px_2px_rgba(18,22,26,0.06),0_12px_32px_rgba(18,22,26,0.1)] p-2 flex flex-col gap-1 rounded-panel transition-colors min-[900px]:p-0 min-[900px]:flex-row min-[900px]:items-stretch min-[900px]:gap-0 min-[900px]:rounded-full ${
        /* The bar recedes so the open field is the only white thing on it.
           Sampling the reference: its bar greys to #e6e6e6, exactly the tint a
           hovered segment gets — the two states are the same grey by design.
           --color-line is that lightness already, and warm, so it matches the
           rest of the palette without a literal. */
        active ? "bg-surface min-[900px]:bg-line" : "bg-surface"
      } ${
        /* Sized to its content. On Browse it stays full width: there it is a
           toolbar over a full-width results grid, and a centred island above
           that would read as detached. */
        compact ? "text-sm" : "min-[900px]:max-w-[660px] min-[900px]:mx-auto"
      } ${className}`}
    >
      {/* inset-y-0 resolves against the padding box, so with the form's desktop
          padding at 0 this lands just inside the hairline border — the same
          rounded-full at the same height as the bar's interior, which is why
          its cap coincides with the bar's own curve at either end. */}
      <div
        aria-hidden="true"
        className="hidden min-[900px]:block absolute inset-y-0 rounded-full bg-surface shadow-[0_3px_14px_rgba(18,22,26,0.13)] transition-[left,width,opacity] duration-250 ease-out"
        style={{ left: pill.left, width: pill.width, opacity: active ? 1 : 0 }}
      />

      <Segment ref={whereRef} active={active === "where"} grow="flex-1">
        <button type="button" onClick={() => setActive("where")} className={`w-full h-full flex flex-col justify-center gap-1.5 text-left outline-none ${pad}`}>
          <span className="text-[13px] font-semibold text-ink leading-none">Where</span>
          <span className={`text-[15px] truncate ${city ? "font-medium text-ink" : "text-ink-3"}`}>
            {city ? `${city}, Uttarakhand` : "Search destinations"}
          </span>
        </button>
      </Segment>

      {/* The reference drops a divider as soon as either neighbour is hovered,
          not just when one opens. With two segments the lone divider touches
          both, so both rules collapse to "anything hovered or open". */}
      <div
        className={`hidden min-[900px]:block w-px h-8 shrink-0 self-center bg-line transition-opacity group-has-[[data-seg]:hover]:opacity-0 ${active ? "opacity-0" : ""}`}
      />

      {/* flex-none so this segment is exactly as wide as the date text plus the
          button's reserved strip; the bar's leftover width goes to Where, the
          way the reference gives its widest segment to the destination. */}
      <Segment ref={whenRef} active={active === "when"} grow="min-[900px]:flex-none">
        <button type="button" onClick={() => setActive("when")} className={`w-full h-full flex flex-col justify-center gap-1.5 text-left outline-none ${pad} min-[900px]:pr-34`}>
          <span className="flex items-center gap-2 text-[13px] font-semibold text-ink leading-none">
            When
            {pickupDate && returnDate && (
              <span className="font-normal text-[11px] px-1.5 py-px rounded-full bg-surface-2 text-ink-3">
                {formatDuration(pickupDate, returnDate)}
              </span>
            )}
          </span>
          <span className={`text-[15px] truncate ${whenValue ? "font-medium text-ink" : "text-ink-3"}`}>
            {whenValue ?? "Add dates"}
          </span>
        </button>
      </Segment>

      {/* Overlaid rather than in the flow, as in the reference — which is also
          what stops it reflowing the fields as it grows, and so what stops the
          pill being measured against a width the button is about to leave. */}
      <button
        type="submit"
        aria-label="Search"
        disabled={!ready}
        className={`relative z-10 shrink-0 disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:brightness-100 flex items-center justify-center gap-2 bg-amber text-on-amber font-semibold text-sm hover:brightness-95 transition-all w-full py-3 rounded-row min-[900px]:absolute min-[900px]:right-3 min-[900px]:top-1/2 min-[900px]:-translate-y-1/2 min-[900px]:h-12 min-[900px]:py-0 min-[900px]:rounded-full ${
          active ? "min-[900px]:w-auto min-[900px]:px-6" : "min-[900px]:w-12"
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className={active ? "" : "min-[900px]:hidden"}>Search</span>
      </button>
    </form>
  );

  // A floating panel has nowhere good to put a two-month calendar on a phone,
  // so below the width the bar itself stacks at, both fields open as a modal.
  if (!isDesktop) {
    return (
      <>
        {bar}
        <Modal open={active !== null} onClose={() => setActive(null)} title={shown === "where" ? "Where" : "Dates"}>
          {shown === "where" ? <CityList onPick={changeCity} /> : calendar(1)}
        </Modal>
      </>
    );
  }

  return (
    <Popover open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
      <PopoverAnchor asChild>{bar}</PopoverAnchor>
      <MorphPanel active={active} shown={shown}>
        {shown === "where" ? <CityList onPick={changeCity} /> : calendar(2)}
      </MorphPanel>
    </Popover>
  );
}

/**
 * One panel for both fields, which resizes between them instead of closing and
 * reopening — the reference keeps its left edge pinned and grows the right one
 * while the old content fades out under the new.
 *
 * Width and height have to be explicit numbers for that to animate at all, so
 * an inner `w-max` box is measured and the outer box is told the result. The
 * transition is suppressed on the way in, where the reference just fades.
 */
function MorphPanel({
  active,
  shown,
  children,
}: {
  active: Field | null;
  shown: Field;
  children: React.ReactNode;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // Only a field-to-field switch animates. Opening from closed would otherwise
  // grow out of whatever the last panel measured, or out of nothing at all.
  const [morphing, setMorphing] = useState(false);
  const prev = useRef<Field | null>(null);

  useLayoutEffect(() => {
    setMorphing(prev.current !== null && active !== null && prev.current !== active);
    prev.current = active;
  }, [active]);

  // A callback ref, not an effect keyed on `shown`: this box mounts and
  // unmounts with the popover, which has nothing to do with when `shown`
  // changes. Keyed on `shown`, opening Where first measured nothing at all
  // (`shown` already defaults to "where", so the effect never re-ran) and a
  // close left the observer bound to a detached node. React calls this exactly
  // on mount and unmount, which is exactly when the observer should move.
  const ro = useRef<ResizeObserver>(undefined);
  const measureRef = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    if (!el) return;
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    ro.current = new ResizeObserver(measure);
    ro.current.observe(el);
  }, []);

  return (
    <PopoverContent
      align="start"
      sideOffset={12}
      // Clicking the other segment must not take the dismiss path, or the close
      // races the open and the switch only lands sometimes. Letting the bar
      // handle its own clicks makes the switch a plain state change.
      onInteractOutside={(e) => {
        if ((e.target as HTMLElement | null)?.closest("form")) e.preventDefault();
      }}
      // The panel is the bar's own surface, so it must not steal focus from the
      // segment that opened it on every switch.
      onOpenAutoFocus={(e) => e.preventDefault()}
      className="overflow-hidden p-0"
      style={
        size
          ? {
              width: size.w,
              height: size.h,
              transition: morphing ? "width 250ms ease-out, height 250ms ease-out" : "none",
            }
          : undefined
      }
    >
      <div ref={measureRef} key={shown} className="w-max animate-in fade-in-0 duration-200">
        {children}
      </div>
    </PopoverContent>
  );
}

function CityList({ onPick }: { onPick: (city: string) => void }) {
  return (
    <div className="p-2 w-[min(26rem,calc(100vw-1.5rem))]">
      {CITY_LIST.map((c) => (
        <button
          key={c.name}
          type="button"
          onClick={() => onPick(c.name)}
          className="w-full flex items-center gap-4 px-3 py-2.5 rounded-[12px] text-left outline-none hover:bg-surface-3 focus-visible:bg-surface-3 transition-colors"
        >
          <span className={`size-13 shrink-0 rounded-[10px] flex items-center justify-center ${c.tint}`}>
            {c.icon}
          </span>
          <span className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[15px] font-medium text-ink">{c.name}, Uttarakhand</span>
            <span className="text-sm text-ink-3">{c.blurb}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function Segment({
  ref,
  active,
  grow,
  children,
}: {
  ref: React.Ref<HTMLDivElement>;
  active: boolean;
  grow: string;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={ref}
      data-seg=""
      // A wrapper only — the button inside carries the padding and fills it, so
      // the whole segment is clickable rather than just the two lines of text.
      // z-10 keeps that text above the travelling pill. One hover rule for both
      // bar states: 10% ink lands on #e7e7e8 over white, which is the grey the
      // reference greys its bar to, and composites a step darker again over
      // that grey — matching its #e6e6e6 / #d7d7d7 pair. The open field skips
      // it; it already has the pill.
      className={`relative z-10 ${grow} min-w-0 rounded-panel transition-colors min-[900px]:rounded-full ${
        active ? "" : "hover:bg-ink/10"
      }`}
    >
      {children}
    </div>
  );
}

/* Three glyphs rather than one shared pin: the tinted tiles are the only thing
   giving the panel any character, and a ridge, an arch and a river are what
   actually distinguish these three towns. */
const glyph = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function RidgeIcon() {
  return (
    <svg {...glyph} aria-hidden="true" className="text-[#4a7a5c]">
      <path d="M2 18 8.5 7l4 6.5L15 10l7 8z" />
      <path d="m6.6 10.2 3.8 2.2" />
    </svg>
  );
}

function TempleIcon() {
  return (
    <svg {...glyph} aria-hidden="true" className="text-[#9a6a12]">
      <path d="M12 2.5 18 8v12H6V8z" />
      <path d="M12 20v-5a2 2 0 1 1 4 0v5" />
      <path d="M4 20h16" />
    </svg>
  );
}

function RiverIcon() {
  return (
    <svg {...glyph} aria-hidden="true" className="text-[#3f6b93]">
      <path d="M2 15.5c2.5-2 4.5 2 7 0s4.5-2 7 0 4.5 2 6 0" />
      <path d="M2 20c2.5-2 4.5 2 7 0s4.5-2 7 0 4.5 2 6 0" />
      <path d="M8 10.5 12 3l4 7.5" />
    </svg>
  );
}
