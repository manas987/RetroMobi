import Svg, { Circle, Path } from "react-native-svg";
import { colors } from "../theme";

/** The scooter mark from the website header (Header.tsx), same geometry. */
export function Logo({ size = 26, color = colors.ink }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no">
      <Circle cx={6} cy={17} r={3.2} stroke={color} strokeWidth={1.6} />
      <Circle cx={18} cy={17} r={3.2} stroke={color} strokeWidth={1.6} />
      <Path d="M6 17 9 9h4l4 5h2M9 9 7.5 6.5" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
