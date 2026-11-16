import { useRef, useState } from "react";
import { FlatList, ScrollView, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Image, type ImageProps } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import type { LucideIcon } from "lucide-react-native";
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
export function IntroSlides({ slides, onDone, labels }: {
  slides: IntroSlide[];
  onDone: () => void;
  labels: { next: string; skip: string; start: string };
}) {
  const { width, height, fontScale } = useWindowDimensions();
  const list = useRef<FlatList<IntroSlide>>(null);
  const [index, setIndex] = useState(0);
  const last = index === slides.length - 1;

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width));

  return (
    <SafeAreaView style={styles.fill}>
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
          onPress={() => (last ? onDone() : list.current?.scrollToIndex({ index: index + 1 }))}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.surface },
  top: { minHeight: 56, alignItems: "flex-end", justifyContent: "center", paddingHorizontal: space[3] },
  pages: { flex: 1 },
  slide: { flexGrow: 1, alignItems: "center", justifyContent: "center", gap: space[3], paddingHorizontal: space[5], paddingVertical: space[2] },
  image: { width: "100%", borderRadius: radius.panel, backgroundColor: colors.surface3, marginBottom: space[2] },
  iconWrap: { height: 120, width: 120, borderRadius: 60, backgroundColor: colors.amber, alignItems: "center", justifyContent: "center", marginBottom: space[4] },
  dots: { flexDirection: "row", justifyContent: "center", gap: space[2], paddingVertical: space[4] },
  dot: { height: 8, width: 8, borderRadius: 4, backgroundColor: colors.lineStrong },
  dotOn: { width: 24, backgroundColor: colors.ink },
  bottom: { paddingHorizontal: space[5], paddingBottom: space[5] },
});
