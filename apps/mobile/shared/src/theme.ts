/**
 * The design tokens, copied value-for-value from apps/Frontend/src/index.css
 * (`@theme`). Change a colour there, change it here. Screens never write a hex
 * code or a font name of their own.
 */
export const colors = {
  // Ink: warm-leaning near-black, never cool grey
  ink: "#12161a",
  ink2: "#4a5159",
  ink3: "#7b838b",
  ink4: "#a8aeb4",
  // Surfaces: white primary, warm off-white secondary
  surface: "#ffffff",
  surface2: "#faf9f7",
  surface3: "#f3f1ed",
  /** Merchant page background. */
  canvas: "#f3f4ef",
  // Hairlines
  line: "#e6e3de",
  lineStrong: "#d3cfc8",
  // The one accent. A fill under dark text, never text itself.
  amber: "#ffd901",
  amberSoft: "#fffbe0",
  amberEdge: "#d9b800",
  onAmber: "#1a1206",
  /** Amber dark enough to be text on white (the web's step numbers). */
  amberText: "#8a5d00",
  // Licence / verified
  verified: "#1f6b43",
  verifiedSoft: "#eaf4ee",
  // Semantic
  danger: "#b3261e",
  dangerSoft: "#fdecea",
  warning: "#8a5a00",
  warningSoft: "#fdf3e2",
  info: "#1f5fbf",
  infoSoft: "#e9f1fc",
  white: "#ffffff",
  /** Dim layer behind sheets. */
  scrim: "rgba(18,22,26,0.45)",
} as const;

/** 4-point scale. `space[4]` = 16. */
export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;

export const radius = { row: 10, panel: 14, button: 16, card: 20, sheet: 24, hero: 28, full: 999 } as const;

/**
 * Airbnb Cereal, three cuts. React Native picks a font file by family name,
 * not by weight, so always use these names and never `fontWeight`.
 * The web's `font-semibold` and `font-bold` both land on Bold (there is no 600 cut).
 * Hindi falls back to the phone's own Devanagari font: Cereal has no Devanagari.
 */
export const font = { regular: "Cereal-Book", medium: "Cereal-Medium", bold: "Cereal-Bold" } as const;

/** Type scale. Body is 15, as on the website. */
export const text = { xs: 12, sm: 13, base: 15, md: 16, lg: 18, xl: 22, xxl: 26, display: 32 } as const;

/**
 * Scale the whole type ramp so body text is `base`. Call once at module load,
 * before the first render (the merchant app uses 16 for easier reading).
 * ponytail: mutates the shared ramp in place; StyleSheets built at import
 * time keep the old sizes. Pass the scale through context if that ever matters.
 */
const TEXT_15 = { ...text };
export function setTextScale(base: number) {
  // From the original ramp, so running twice (Fast Refresh) never compounds.
  const ramp = text as Record<keyof typeof text, number>;
  for (const key of Object.keys(TEXT_15) as (keyof typeof text)[]) ramp[key] = Math.round(TEXT_15[key] * base / 15);
}

/** Smallest touch target, in points (Apple 44, Android 48). */
export const HIT = 48;

export const shadow = {
  card: {
    shadowColor: colors.ink,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;

/**
 * Merchant state colours. One meaning per colour, everywhere:
 * green done, amber needs you, red late/problem, blue under way, grey inactive.
 */
export type Tone = "good" | "attention" | "bad" | "info" | "muted";

export const tone: Record<Tone, { bg: string; fg: string; dot: string }> = {
  good: { bg: colors.verifiedSoft, fg: colors.verified, dot: colors.verified },
  attention: { bg: colors.amber, fg: colors.onAmber, dot: colors.amberEdge },
  bad: { bg: colors.dangerSoft, fg: colors.danger, dot: colors.danger },
  info: { bg: colors.infoSoft, fg: colors.info, dot: colors.info },
  muted: { bg: colors.surface3, fg: colors.ink2, dot: colors.ink4 },
};

export const chartSeries = ["#4b5bd6", "#1b9e8a"] as const;
