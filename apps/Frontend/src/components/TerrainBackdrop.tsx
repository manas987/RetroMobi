/** Abstract contour lines, not a stock photograph — RetroMobi has no real fleet
 *  photography yet, and PRODUCT.md is explicit that none should be implied. */
export function TerrainBackdrop({ opacity = 0.35, gradientId = "fade" }: { opacity?: number; gradientId?: string }) {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      style={{ opacity }}
      viewBox="0 0 800 420"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-verified)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--color-verified)" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      {[60, 110, 160, 210, 260, 310, 360].map((y, i) => (
        <path
          key={y}
          d={`M0 ${y} C 150 ${y - 40 - i * 4}, 280 ${y + 50 + i * 6}, 420 ${y - 10} S 700 ${y - 60}, 800 ${y + 20 - i * 3}`}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}
