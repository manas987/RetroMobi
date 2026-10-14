import { useEffect, useState } from "react";

const MAX_RUPEES = 5000;
const STEP = 50;

export function PriceRangeSlider({
  minPaise,
  maxPaise,
  onCommit,
}: {
  minPaise: number | undefined;
  maxPaise: number | undefined;
  onCommit: (minPaise: number | undefined, maxPaise: number | undefined) => void;
}) {
  const [lo, setLo] = useState(minPaise ? Math.round(minPaise / 100) : 0);
  const [hi, setHi] = useState(maxPaise ? Math.round(maxPaise / 100) : MAX_RUPEES);

  // External changes (e.g. the "×" chip clearing a filter) should resync the slider.
  useEffect(() => {
    setLo(minPaise ? Math.round(minPaise / 100) : 0);
    setHi(maxPaise ? Math.round(maxPaise / 100) : MAX_RUPEES);
  }, [minPaise, maxPaise]);

  // Commit on a debounce rather than every tick of the drag, so it doesn't
  // refetch and rewrite the URL dozens of times per second while dragging.
  useEffect(() => {
    const t = setTimeout(() => {
      onCommit(lo > 0 ? lo * 100 : undefined, hi < MAX_RUPEES ? hi * 100 : undefined);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lo, hi]);

  const loPct = (lo / MAX_RUPEES) * 100;
  const hiPct = (hi / MAX_RUPEES) * 100;

  return (
    <div className="py-1.5">
      <div className="relative h-5 flex items-center">
        <div className="absolute inset-x-0 h-1 rounded-full bg-line-strong" />
        <div
          className="absolute h-1 rounded-full bg-amber"
          style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }}
        />
        <input
          type="range"
          min={0}
          max={MAX_RUPEES}
          step={STEP}
          value={lo}
          onChange={(e) => setLo(Math.min(Number(e.target.value), hi - STEP))}
          className="price-range-thumb absolute inset-x-0 w-full appearance-none bg-transparent pointer-events-none"
        />
        <input
          type="range"
          min={0}
          max={MAX_RUPEES}
          step={STEP}
          value={hi}
          onChange={(e) => setHi(Math.max(Number(e.target.value), lo + STEP))}
          className="price-range-thumb absolute inset-x-0 w-full appearance-none bg-transparent pointer-events-none"
        />
      </div>
      <div className="flex items-center justify-between mt-2 text-xs text-ink-2 tnum">
        <span>₹{lo.toLocaleString("en-IN")}</span>
        <span>{hi >= MAX_RUPEES ? `₹${MAX_RUPEES.toLocaleString("en-IN")}+` : `₹${hi.toLocaleString("en-IN")}`}</span>
      </div>
    </div>
  );
}
