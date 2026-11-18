import { useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Image, type ImageProps } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { ArrowRight, type LucideIcon } from "lucide-react-native";
import { colors, radius, space } from "../theme";
import { Button } from "../ui/Button";
import { Text } from "../ui/Text";

export interface IntroSlide {
  title: string;
  body: string;
  /** A photo (rider app) or an icon (merchant app). */
  image?: ImageProps["source"];
  icon?: LucideIcon;
}

/**
 * Swipeable first-open slides. "Skip" is always there; the last slide's button
 * finishes. Nothing here asks for a permission or an account.
 */
export function IntroSlides({ slides, onDone, labels, iconPanels, poster }: {
  slides: IntroSlide[];
  iconPanels?: boolean;
  /** Full-bleed photo posters with a big white headline (rider app). */
  poster?: boolean;
  onDone: () => void;
  labels: { next: string; skip: string; start: string };
}) {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<IntroSlide>>(null);
  const [index, setIndex] = useState(0);
  const last = index === slides.length - 1;

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  const next = () => (last ? onDone() : list.current?.scrollToIndex({ index: index + 1 }));

  if (poster) return (
    <View style={styles.posterFill}>
      <FlatList ref={list} data={slides} horizontal pagingEnabled showsHorizontalScrollIndicator={false} keyExtractor={(s) => s.title}
        onMomentumScrollEnd={onScrollEnd} getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => <View style={{ width, height }}>
          {item.image && <Image source={item.image} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />}
          <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 1 1" pointerEvents="none">
            <Defs><LinearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.ink} stopOpacity="0.72" />
              <Stop offset="0.42" stopColor={colors.ink} stopOpacity="0" />
              <Stop offset="0.72" stopColor={colors.ink} stopOpacity="0" />
              <Stop offset="1" stopColor={colors.ink} stopOpacity="0.6" />
            </LinearGradient></Defs>
            <Rect x="0" y="0" width="1" height="1" fill="url(#shade)" />
          </Svg>
          <View style={[styles.posterText, { paddingTop: insets.top + 84 }]}>
            <Text weight="bold" color="white" accessibilityRole="header" style={styles.posterTitle}>{item.title}</Text>
            <Text size="md" color="white" style={{ opacity: 0.88, maxWidth: 340 }}>{item.body}</Text>
          </View>
        </View>} />
      <SafeAreaView style={styles.posterTop} edges={["top"]} pointerEvents="box-none">
        {!last && <Pressable accessibilityRole="button" onPress={onDone} style={styles.posterSkip}>
          <Text weight="medium" color="white">{labels.skip}</Text>
        </Pressable>}
      </SafeAreaView>
      <SafeAreaView style={styles.posterBottom} edges={["bottom"]} pointerEvents="box-none">
        <View style={styles.dots} accessibilityLabel={`${index + 1} / ${slides.length}`}>
          {slides.map((s, i) => <View key={s.title} style={[styles.dot, styles.posterDot, i === index && styles.posterDotOn]} />)}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={last ? labels.start : labels.next} onPress={next}
          style={({ pressed }) => [styles.posterButton, pressed && { opacity: 0.85 }]}>
          <Text weight="bold" size="md">{last ? labels.start : labels.next}</Text>
          <View style={styles.posterDisc}><ArrowRight size={18} color={colors.onAmber} strokeWidth={2.4} /></View>
        </Pressable>
      </SafeAreaView>
    </View>
  );

  return (
    <SafeAreaView style={[styles.fill, iconPanels && styles.canvas]}>
      <View style={styles.top}>
        {!last && <Button label={labels.skip} variant="ghost" onPress={onDone} />}
      </View>
      <FlatList showsVerticalScrollIndicator={false}
        style={styles.pages}
        ref={list}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.title}
        onMomentumScrollEnd={onScrollEnd}
        // Rotating the phone changes the page width; snap back to the same slide.
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={{ width }} contentContainerStyle={styles.slide}>
            {iconPanels && item.icon ? <View style={styles.panel}>
              <View style={styles.panelMark}><item.icon size={36} color={colors.onAmber} strokeWidth={1.7} /></View>
              <Text size="display" weight="bold" color="surface" accessibilityRole="header">{item.title}</Text>
              <Text size="md" color="surface3">{item.body}</Text>
            </View> : <>
            {item.image ? (
              <Image source={item.image} style={[styles.image, { height: Math.min(340, height * (fontScale > 1.25 ? 0.30 : 0.40)) }]}
                contentFit="cover" accessible={false} />
            ) : item.icon ? (
              <View style={styles.iconWrap}>
                <item.icon size={56} color={colors.onAmber} />
              </View>
            ) : null}
            <Text size="xxl" weight="bold" center accessibilityRole="header">{item.title}</Text>
            <Text size="md" color="ink2" center>{item.body}</Text>
            </>}
          </ScrollView>
        )}
      />
      <View style={styles.dots} accessibilityLabel={`${index + 1} / ${slides.length}`}>
        {slides.map((s, i) => <View key={s.title} style={[styles.dot, i === index && styles.dotOn]} />)}
      </View>
      <View style={styles.bottom}>
        <Button
          label={last ? labels.start : labels.next}
          variant="primary"
          size="lg"
          full
          onPress={next}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.surface },
  canvas: { backgroundColor: colors.canvas },
  panel: { alignSelf: "stretch", backgroundColor: colors.ink, borderRadius: radius.sheet, gap: space[4], padding: space[6] },
  panelMark: { width: 66, height: 66, borderRadius: 20, backgroundColor: colors.amber, alignItems: "center", justifyContent: "center", marginBottom: space[2] },
  top: { minHeight: 56, alignItems: "flex-end", justifyContent: "center", paddingHorizontal: space[3] },
  pages: { flex: 1 },
  slide: { flexGrow: 1, alignItems: "center", justifyContent: "center", gap: space[3], paddingHorizontal: space[5], paddingVertical: space[2] },
  image: { width: "100%", borderRadius: radius.panel, backgroundColor: colors.surface3, marginBottom: space[2] },
  iconWrap: { height: 120, width: 120, borderRadius: 60, backgroundColor: colors.amber, alignItems: "center", justifyContent: "center", marginBottom: space[4] },
  dots: { flexDirection: "row", justifyContent: "center", gap: space[2], paddingVertical: space[4] },
  dot: { height: 8, width: 8, borderRadius: 4, backgroundColor: colors.lineStrong },
  dotOn: { width: 24, backgroundColor: colors.ink },
  bottom: { paddingHorizontal: space[5], paddingBottom: space[5] },
  posterFill: { flex: 1, backgroundColor: colors.ink },
  posterText: { ...StyleSheet.absoluteFill, justifyContent: "flex-start", paddingHorizontal: space[6], gap: space[3] },
  posterTitle: { fontSize: 44, lineHeight: 47, letterSpacing: -1.6 },
  posterTop: { position: "absolute", top: 0, right: 0, paddingHorizontal: space[3] },
  posterSkip: { minHeight: 48, justifyContent: "center", paddingHorizontal: space[4], marginTop: space[2], borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.18)" },
  posterBottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space[6], paddingBottom: space[4] },
  posterDot: { backgroundColor: "rgba(255,255,255,0.4)" },
  posterDotOn: { width: 24, backgroundColor: colors.white },
  posterButton: { minHeight: 60, borderRadius: radius.full, backgroundColor: colors.white, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: space[6], paddingRight: 7, marginBottom: space[2] },
  posterDisc: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.amber, alignItems: "center", justifyContent: "center" },
});
