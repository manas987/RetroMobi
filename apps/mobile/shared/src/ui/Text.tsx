import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { colors, font, text } from "../theme";

type Size = keyof typeof text;

/**
 * Cereal has no Devanagari, so Hindi uses the system font and its real weights. With a fixed
 * lineHeight, Android measured Hindi too narrow: it wrapped inside a one-line box and the
 * last word vanished ("बुक करें" → "बुक"). Hindi text therefore keeps the font's own line height.
 */
const DEVANAGARI = /[\u0900-\u097F]/;
function devanagari(children: unknown): boolean {
  if (typeof children === "string") return DEVANAGARI.test(children);
  return Array.isArray(children) && children.some(devanagari);
}
const hindi: Record<Weight, TextStyle> = {
  regular: { fontFamily: undefined, fontWeight: "400" },
  medium: { fontFamily: undefined, fontWeight: "500" },
  bold: { fontFamily: undefined, fontWeight: "700" },
};
type Weight = keyof typeof font;
type Color = keyof typeof colors;

/**
 * The only text component screens use. It sets the font family (React Native
 * has no inherited font), and leaves font scaling ON so the phone's "larger
 * text" setting works -- capped so a huge setting can't break layouts.
 */
export function Text({
  size = "base",
  weight = "regular",
  color = "ink",
  center,
  tnum,
  style,
  ...rest
}: TextProps & { size?: Size; weight?: Weight; color?: Color; center?: boolean; /** Tabular digits, for prices and times. */ tnum?: boolean }) {
  const hi = devanagari(rest.children);
  const base: TextStyle = {
    fontFamily: font[weight],
    fontSize: text[size],
    // A fixed line height makes Android mis-measure Devanagari (see `devanagari` above): Hindi keeps the font's own.
    lineHeight: hi ? undefined : Math.round(text[size] * 1.4),
    color: colors[color],
    textAlign: center ? "center" : undefined,
    // RN 0.88 processes a removed variant as null; keep an array when numeric text becomes plain text.
    fontVariant: tnum ? ["tabular-nums"] : [],
  };
  return <RNText maxFontSizeMultiplier={1.6} {...rest} style={[base, hi && hindi[weight], style]} />;
}
