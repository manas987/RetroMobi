import { useEffect, useState } from "react";

/** Airbnb-style dual-thumb range slider: optional histogram, numeric boxes
 *  below each thumb. `histogram`, when passed, is real data derived from the
 *  current result set — never fabricated. */
export function RangeSlider({
  min,
  max,
  step,
  lo,
  hi,
  onCommit,
  format,
  histogram,
}: {
  min: number;
  max: number;
  step: number;
  lo: number;
  hi: number;
  onCommit: (lo: number, hi: number) => void;
  format: (v: number) => string;
  histogram?: number[];
}) {
  const [a, setA] = useState(lo);
  const [b, setB] = useState(hi);

  useEffect(() => {
    setA(lo);
    setB(hi);
  }, [lo, hi]);

  // Debounced commit, same reasoning as the old PriceRangeSlider: don't
  // refetch/rewrite the URL on every tick of the drag.
  useEffect(() => {
    const t = setTimeout(() => onCommit(a, b), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b]);

  const loPct = ((a - min) / (max - min)) * 100;
  const hiPct = ((b - min) / (max - min)) * 100;
  const barMax = histogram ? Math.max(1, ...histogram) : 0;

  return (
    <div className="py-1.5">
      {histogram && (
        <div className="flex items-end gap-px h-10 mb-1">
          {histogram.map((count, i) => {
            const bucketPct = (i / histogram.length) * 100;
            const inRange = bucketPct >= loPct && bucketPct <= hiPct;
            return (
              <div
                key={i}
                className={`flex-1 rounded-t-sm ${inRange ? "bg-amber" : "bg-line-strong"}`}
                style={{ height: `${Math.max(8, (count / barMax) * 100)}%` }}
              />
            );
          })}
        </div>
      )}

      <div className="relative h-5 flex items-center">
        <div className="absolute inset-x-0 h-1 rounded-full bg-line-strong" />
        <div className="absolute h-1 rounded-full bg-amber" style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }} />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={a}
          onChange={(e) => setA(Math.min(Number(e.target.value), b - step))}
          className="price-range-thumb absolute inset-x-0 w-full appearance-none bg-transparent pointer-events-none"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={b}
          onChange={(e) => setB(Math.max(Number(e.target.value), a + step))}
          className="price-range-thumb absolute inset-x-0 w-full appearance-none bg-transparent pointer-events-none"
        />
      </div>
      <div className="flex items-center justify-between mt-2 text-xs text-ink-2 tnum">
        <span>{format(a)}</span>
        <span>{format(b)}</span>
      </div>
    </div>
  );
}

/** Single-thumb "within X" slider — used for the distance filter. */
export function MaxSlider({
  min,
  max,
  step,
  value,
  onCommit,
  format,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onCommit: (v: number) => void;
  format: (v: number) => string;
}) {
  const [v, setV] = useState(value);

  useEffect(() => setV(value), [value]);

  useEffect(() => {
    const t = setTimeout(() => onCommit(v), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  const pct = ((v - min) / (max - min)) * 100;

  return (
    <div className="py-1.5">
      <div className="relative h-5 flex items-center">
        <div className="absolute inset-x-0 h-1 rounded-full bg-line-strong" />
        <div className="absolute h-1 rounded-full bg-amber" style={{ left: 0, right: `${100 - pct}%` }} />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={v}
          onChange={(e) => setV(Number(e.target.value))}
          className="price-range-thumb absolute inset-x-0 w-full appearance-none bg-transparent"
        />
      </div>
      <div className="mt-2 text-xs text-ink-2 tnum">{format(v)}</div>
    </div>
  );
}
