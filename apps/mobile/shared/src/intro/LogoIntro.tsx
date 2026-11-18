import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { colors, font, space } from "../theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

// Stroke lengths of the mark, in viewBox units: a wheel is 2πr, the frame is measured by hand.
const WHEEL = 2 * Math.PI * 3.2;
const FRAME = 24;
const TOTAL_MS = 2100;

/**
 * First-open animation: the two wheels draw, the frame draws between them,
 * the wordmark rises in. About two seconds, then `onDone`.
 *
 * With "reduce motion" on, the finished logo is shown still for a moment.
 */
export function LogoIntro({ subtitle, onDone, quick = false }: { subtitle?: string; quick?: boolean; onDone: () => void }) {
  const reduced = useReducedMotion();
  const wheels = useSharedValue(reduced ? 1 : 0);
  const frame = useSharedValue(reduced ? 1 : 0);
  const word = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (!reduced) {
      const ease = Easing.out(Easing.cubic);
      wheels.value = withTiming(1, { duration: quick ? 280 : 650, easing: ease });
      frame.value = withDelay(quick ? 160 : 350, withTiming(1, { duration: quick ? 320 : 700, easing: ease }));
      word.value = withDelay(quick ? 410 : 950, withTiming(1, { duration: quick ? 240 : 450, easing: ease }));
    }
    // A plain timer, not an animation callback: it fires even if animations are off.
    const timer = setTimeout(onDone, quick ? (reduced ? 120 : 800) : (reduced ? 900 : TOTAL_MS));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wheelProps = useAnimatedProps(() => ({ strokeDashoffset: WHEEL * (1 - wheels.value) }));
  const frameProps = useAnimatedProps(() => ({ strokeDashoffset: FRAME * (1 - frame.value) }));
  const wordStyle = useAnimatedStyle(() => ({ opacity: word.value, transform: [{ translateY: (1 - word.value) * 12 }] }));

  return (
    <View style={styles.fill} accessibilityRole="image" accessibilityLabel="RetroMobi">
      <Svg width={120} height={120} viewBox="0 0 24 24" fill="none">
        <AnimatedCircle cx={6} cy={17} r={3.2} stroke={colors.ink} strokeWidth={1.4} strokeDasharray={WHEEL} animatedProps={wheelProps} />
        <AnimatedCircle cx={18} cy={17} r={3.2} stroke={colors.ink} strokeWidth={1.4} strokeDasharray={WHEEL} animatedProps={wheelProps} />
        <AnimatedPath d="M6 17 9 9h4l4 5h2M9 9 7.5 6.5" stroke={colors.amberEdge} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={FRAME} animatedProps={frameProps} />
      </Svg>
      <Animated.Text style={[styles.word, wordStyle]}>retromobi</Animated.Text>
      {subtitle ? <Animated.Text style={[styles.sub, wordStyle]}>{subtitle}</Animated.Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, gap: space[2] },
  word: { fontFamily: font.bold, fontSize: 30, letterSpacing: -0.6, color: colors.ink },
  sub: { fontFamily: font.regular, fontSize: 14, color: colors.ink3 },
});
