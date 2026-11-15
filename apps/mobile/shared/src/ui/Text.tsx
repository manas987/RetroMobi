import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { colors, font, text } from "../theme";

type Size = keyof typeof text;
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
  const base: TextStyle = {
    fontFamily: font[weight],
    fontSize: text[size],
    lineHeight: Math.round(text[size] * 1.4),
    color: colors[color],
    textAlign: center ? "center" : undefined,
    fontVariant: tnum ? ["tabular-nums"] : undefined,
  };
  return <RNText maxFontSizeMultiplier={1.6} {...rest} style={[base, style]} />;
}
