import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown, FadeOut, LinearTransition, ReduceMotion } from "react-native-reanimated";
import { ChevronDown } from "lucide-react-native";
import { Text, colors, space } from "@retromobi/mobile-shared";
import { counterStyles } from "./Counter";

const resize = LinearTransition.duration(240).reduceMotion(ReduceMotion.System);
const expand = FadeInDown.duration(220).withInitialValues({ opacity: 0, transform: [{ translateY: -6 }] }).reduceMotion(ReduceMotion.System);
const collapse = FadeOut.duration(120).reduceMotion(ReduceMotion.System);

export function Disclosure({ label, children, dark }: { label: string; children: ReactNode; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  return <Animated.View layout={resize} style={{ overflow: "hidden" }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}
      style={({ pressed }) => [{ ...counterStyles.row, alignSelf: "flex-start", minHeight: 48, opacity: pressed ? 0.65 : 1 }]}>
      <ChevronDown size={17} color={dark ? colors.ink4 : colors.ink2} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
      <Text size="sm" weight="medium" color={dark ? "ink4" : "ink2"}>{label}</Text>
    </Pressable>
    {open && <Animated.View entering={expand} exiting={collapse}>
      <View style={{ gap: space[2], paddingBottom: space[2] }}>{children}</View>
    </Animated.View>}
  </Animated.View>;
}
