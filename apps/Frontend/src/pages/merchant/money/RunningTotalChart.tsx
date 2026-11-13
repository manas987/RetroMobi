import { useEffect, useRef, useState } from "react";
import { Reveal } from "../ui/ui";

export interface LineSeries {
  name: string;
  values: number[];
  color: string;
}

const H = 180;
const PAD = { top: 12, right: 12, bottom: 24, left: 52 };

/** A round number at or above `n`, so the top gridline reads cleanly (1, 2 or 5 × 10ⁿ). */
function niceMax(n: number) {
  if (n <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(n));
  return ([1, 2, 5, 10].find((m) => m * p >= n) ?? 10) * p;
}

/**
 * "Are you ahead of last month?" as two running-total lines: this period in the
 * accent colour, the previous one in grey. Measured to its real width so text
 * stays readable on a phone. Tap or hover anywhere to read both totals for that
 * day; "See the numbers" has every value without hovering.
 */
export function RunningTotalChart({
  labels,
  series,
  format,
  compact,
  tableLabel,
}: {
  /** One label per position (day of the period, or month). */
  labels: string[];
  /** The first series is the current period and is drawn on top. */
  series: LineSeries[];
  format: (n: number) => string;
  compact: (n: number) => string;
  tableLabel: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = Math.max(labels.length, ...series.map((s) => s.values.length));
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const plotW = Math.max(0, w - PAD.left - PAD.right);
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];

  function pick(clientX: number) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const i = Math.round(((clientX - rect.left - PAD.left) / Math.max(1, plotW)) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  }

  const tipLeft = hover === null ? 0 : Math.min(Math.max(x(hover), 70), Math.max(70, w - 70));

  return (
    <div>
      {/* Legend: line keys, the name, and where each line ends up. */}
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {series.map((s) => (
          <li key={s.name} className="flex items-center gap-2">
            <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} aria-hidden />
            <span className="text-ink-2">{s.name}</span>
            <span className="tnum font-semibold text-ink">{format(s.values[s.values.length - 1] ?? 0)}</span>
          </li>
        ))}
      </ul>
      <div
        ref={box}
        className="relative touch-pan-y select-none"
        style={{ height: H }}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
          if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n) - 1));
        }}
        onBlur={() => setHover(null)}
        aria-hidden
      >
        {w > 0 && (
          <svg width={w} height={H} className="block overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-3 text-[11px]">{compact(t)}</text>
              </g>
            ))}
            {n > 0 && (
              <>
                <text x={x(0)} y={H - 6} textAnchor="start" className="fill-ink-3 text-[11px]">{labels[0]}</text>
                <text x={x(n - 1)} y={H - 6} textAnchor="end" className="fill-ink-3 text-[11px]">{labels[n - 1]}</text>
              </>
            )}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--color-ink-4)" strokeWidth={1} />}
            {/* Previous first, so the current period is drawn on top. */}
            {[...series].reverse().map((s) => {
              const last = s.values.length - 1;
              return (
                <g key={s.name}>
                  <polyline
                    points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {last >= 0 && <circle cx={x(last)} cy={y(s.values[last]!)} r={4} fill={s.color} stroke="var(--color-surface)" strokeWidth={2} />}
                  {hover !== null && hover <= last && (
                    <circle cx={x(hover)} cy={y(s.values[hover]!)} r={4} fill={s.color} stroke="var(--color-surface)" strokeWidth={2} />
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-xs text-surface shadow-lg"
            style={{ left: tipLeft }}
          >
            <p className="mb-1 text-surface/70">{labels[hover]}</p>
            {series.map((s) => (
              <p key={s.name} className="flex items-center gap-2 whitespace-nowrap">
                <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                <span className="tnum font-semibold">{s.values[hover] !== undefined ? format(s.values[hover]!) : "—"}</span>
                <span className="text-surface/70">{s.name}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <Reveal label={tableLabel}>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr>
              <th className="py-1 font-normal" />
              {series.map((s) => <th key={s.name} className="py-1 font-medium text-ink-2">{s.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: n }, (_, i) => (
              <tr key={i} className="border-t border-line">
                <th className="py-1 font-normal">{labels[i]}</th>
                {series.map((s) => <td key={s.name} className="tnum py-1">{s.values[i] !== undefined ? format(s.values[i]!) : "—"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Reveal>
    </div>
  );
}
