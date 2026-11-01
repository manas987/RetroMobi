import { useEffect, useRef, useState } from "react";

/** Same generator as the footer design plan: layered noise ridges for a
 *  mountain skyline, a dashed road threading the three cities, and a dot
 *  that rides it on a loop. Ported, not redrawn — the math below mirrors
 *  the plan's `noise`/`ridge`/`buildScene` almost line for line. */
const CITY_DEFS = [
  { name: "Dehradun", fx: 0.22, fxNarrow: 0.2, layer: 2 },
  { name: "Haridwar", fx: 0.5, fxNarrow: 0.52, layer: 3 },
  { name: "Rishikesh", fx: 0.8, fxNarrow: 0.82, layer: 2 },
];

const SKY = "#ffffff";
const HORIZON = "#f7ead6";
const GLOW = "#f0a501";
const SUN = "#f6c25a";
const MIST = "#f4ede3";
const LAYER_COLORS = ["#e6ded4", "#d6cec4", "#bbc0b5", "#96aa98", "#708a76"];

function noise(seed: number) {
  const r = (i: number) => {
    const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return r(i) * (1 - u) + r(i + 1) * u;
  };
}

function ridge(seed: number, base: number, amp: number, scale: number, sharp?: boolean) {
  const n = noise(seed);
  return (x: number) => {
    let v = 0;
    let a = 1;
    let s = scale;
    let t = 0;
    for (let o = 0; o < 4; o++) {
      let k = n(x / s + o * 17);
      if (sharp) k = 1 - Math.abs(k * 2 - 1);
      v += k * a;
      t += a;
      a *= 0.5;
      s *= 0.5;
    }
    return base - amp * (v / t);
  };
}

export function FooterScene({
  hoveredCity,
  onHoverCity,
}: {
  hoveredCity: string | null;
  onHoverCity: (city: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const roadRef = useRef<SVGPathElement>(null);
  const riderRef = useRef<SVGGElement>(null);
  const [width, setWidth] = useState(1200);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A dot rides the dashed road on a 14s loop, easing in/out and fading at
  // each end — the road's own `getPointAtLength` drives its position, so it
  // always follows the curve exactly regardless of width.
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    let raf: number;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const road = roadRef.current;
      const dot = riderRef.current;
      if (!road || !dot) return;
      const L = road.getTotalLength();
      const p = reduce ? 1 : ((now - t0) / 14000) % 1;
      const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      const pt = road.getPointAtLength(e * L);
      dot.setAttribute("transform", `translate(${pt.x},${pt.y})`);
      dot.style.opacity = String(p > 0.94 ? (1 - p) / 0.06 : p < 0.04 ? p / 0.04 : 1);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const H = width < 640 ? 240 : width < 1000 ? 300 : 340;
  const narrow = width < 640;

  // The skyline is generated in pixel space, so a wider container used to just
  // reveal more mountain while the sun sat at a fraction of the width — the two
  // slid past each other on every resize. Sampling the ridges through this
  // factor puts peak, sun and city pin in one proportional space, so they stay
  // aligned at any width. Floored, because below ~720px an un-clamped factor
  // squeezes 1200px of noise into a phone and the ridges turn jagged.
  const SCENE_W = 1200;
  const u = Math.max(0.6, width / SCENE_W);

  const layers = [
    { f: ridge(3, H * 0.5, H * 0.3, 150, true), color: LAYER_COLORS[0]!, trees: 0 },
    { f: ridge(7, H * 0.6, H * 0.2, 300), color: LAYER_COLORS[1]!, trees: 0 },
    { f: ridge(11, H * 0.7, H * 0.18, 240), color: LAYER_COLORS[2]!, trees: 5 },
    { f: ridge(19, H * 0.81, H * 0.14, 210), color: LAYER_COLORS[3]!, trees: 9 },
    { f: ridge(23, H * 0.93, H * 0.12, 260), color: LAYER_COLORS[4]!, trees: 15 },
  ];

  const cities = CITY_DEFS.map((c) => {
    const x = (narrow ? c.fxNarrow : c.fx) * width;
    return { name: c.name, x, y: layers[c.layer]!.f(x / u) + 4 };
  });

  const step = 6;
  const layerPaths = layers.map((layer, i) => {
    let d = `M0 ${H} L0 ${layer.f(0).toFixed(1)}`;
    for (let x = step; x <= width + step; x += step) d += ` L${x} ${layer.f(x / u).toFixed(1)}`;
    d += ` L${width + step} ${H} Z`;
    if (layer.trees) {
      const r = noise(40 + i);
      for (let x = 4; x < width; x += layer.trees * (0.55 + r((x / u) * 0.13) * 0.7)) {
        const dx = x / u;
        if (r(dx * 0.07 + i) < 0.25) continue;
        const th = layer.trees * (1.1 + r(dx * 0.3) * 1.4);
        const tw = th * 0.42;
        const y = layer.f(dx) + 2;
        d += ` M${(x - tw / 2).toFixed(1)} ${y.toFixed(1)} L${x.toFixed(1)} ${(y - th).toFixed(1)} L${(x + tw / 2).toFixed(1)} ${y.toFixed(1)} Z`;
      }
    }
    return d;
  });

  // The road rises from the bottom edge and ends at Haridwar's pin, the
  // middle city — same shape as the plan's three-point bezier.
  const hx = cities[1]!.x;
  const hy = cities[1]!.y;
  const x0 = Math.max(20, hx - width * 0.22);
  const x1 = hx - width * 0.04;
  const pts: [number, number][] = [0, 1, 2, 3].map((j) => {
    const t = j / 3;
    return [j % 2 ? x1 : x0, H + 2 - t * (H + 2 - hy)];
  });
  pts[3] = [hx, hy];
  let roadD = `M${pts[0]![0]} ${pts[0]![1]}`;
  for (let j = 1; j < pts.length; j++) {
    const [a, b] = pts[j - 1]!;
    const [c, e] = pts[j]!;
    roadD += ` C${a} ${(b + e) / 2} ${c} ${(b + e) / 2} ${c} ${e}`;
  }

  // Above Haridwar, the middle city — reusing the pin's own x means the sun
  // tracks it through the narrow breakpoint's `fxNarrow` too, instead of
  // needing its own copy of the fraction.
  const sx = hx;
  // Fractions of H, so the disc keeps the same relation to the skyline at every
  // breakpoint. The ridge crosses Haridwar's x at 0.449H; this sits the disc
  // mostly above it with its base tucked behind, instead of the old 0.42H that
  // buried it entirely and left only the bloom showing.
  const sy = H * 0.404;
  const sr = H * 0.088;

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: H }}>
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} className="block">
        <defs>
          <radialGradient id="rm-glow">
            <stop offset="0%" stopColor={GLOW} stopOpacity={0.28} />
            <stop offset="100%" stopColor={GLOW} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="rm-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SKY} />
            <stop offset="100%" stopColor={HORIZON} />
          </linearGradient>
          {layers.map((layer, i) => (
            <linearGradient key={i} id={`rm-l${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={layer.color} />
              <stop offset="100%" stopColor={i < 4 ? MIST : layer.color} />
            </linearGradient>
          ))}
        </defs>

        <rect x={0} y={0} width={width} height={H} fill="url(#rm-sky)" />
        {/* rx was clamped at 380px, so the haze stayed a fixed-size blob while
            the rest of the scene stretched — the main reason the sun still read
            as drifting. ry is its own fraction rather than `sy - 1`, so raising
            the disc doesn't shrink the wash over the horizon. */}
        <ellipse cx={sx} cy={sy} rx={width * 0.32} ry={H * 0.436} fill="url(#rm-glow)" />
        <circle cx={sx} cy={sy} r={sr} fill={SUN} opacity={0.9} />

        {layerPaths.map((d, i) => (
          <path key={i} d={d} fill={`url(#rm-l${i})`} />
        ))}

        {cities.map((c) => {
          const on = hoveredCity === c.name;
          return (
            <g key={c.name}>
              <circle cx={c.x} cy={c.y} r={on ? 26 : 14} fill="url(#rm-glow)" />
              <circle cx={c.x} cy={c.y} r={on ? 5 : 3.5} fill={GLOW} stroke="#ffffff" strokeWidth={1.5} />
            </g>
          );
        })}

        <path ref={roadRef} d={roadD} fill="none" stroke={SKY} strokeWidth={1.8} strokeDasharray="5 5" opacity={0.9} />
        <g ref={riderRef}>
          <circle r={12} fill="url(#rm-glow)" />
          <circle r={3.4} fill={GLOW} stroke="#ffffff" strokeWidth={1.2} />
        </g>
      </svg>

      {cities.map((c) => {
        const on = hoveredCity === c.name;
        return (
          <a
            key={c.name}
            href="#"
            onClick={(e) => e.preventDefault()}
            onMouseEnter={() => onHoverCity(c.name)}
            onMouseLeave={() => onHoverCity(null)}
            tabIndex={-1}
            aria-hidden="true"
            className={`absolute flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap shadow-[0_6px_16px_-8px_rgba(18,22,26,0.35)] text-ink transition-colors ${
              on ? "bg-amber" : "bg-surface"
            }`}
            style={{ left: c.x, top: c.y - 12, transform: "translate(-50%,-100%)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
              <circle cx="12" cy="9.5" r="2.5" />
            </svg>
            {c.name}
          </a>
        );
      })}
    </div>
  );
}
