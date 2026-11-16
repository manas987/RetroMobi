import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { IntroSlides, type IntroSlide } from "./IntroSlides";
import { LogoIntro } from "./LogoIntro";

const KEY = "retromobi_intro_seen_v1";

/**
 * Shows the logo animation and the slides the first time the app is opened,
 * and never again. Wrap the app's navigator in it.
 *
 * A blank white layer covers the app while the flag is being read, so the
 * app never flashes before the intro: keep the splash screen up until `onReady` fires.
 */
export function IntroGate({ slides, labels, subtitle, onReady, children, quick = false }: {
  slides: IntroSlide[];
  labels: { next: string; skip: string; start: string };
  subtitle?: string;
  quick?: boolean;
  /** The flag has been read; safe to hide the splash screen. */
  onReady: () => void;
  children: ReactNode;
}) {
  const [stage, setStage] = useState<"reading" | "logo" | "slides" | "done">("reading");

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((seen) => setStage(seen ? "done" : "logo"))
      // Storage failing must not trap anyone on the intro.
      .catch(() => setStage("done"))
      .finally(onReady);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish() {
    setStage("done");
    AsyncStorage.setItem(KEY, "1").catch(() => {});
  }

  // The navigator stays mounted underneath (Expo Router needs it from the first
  // render); the intro is a full-screen layer on top of it.
  return (
    <>
      {children}
      {stage !== "done" && (
        <View style={styles.cover}>
          {stage === "logo" && <LogoIntro quick={quick} subtitle={subtitle} onDone={() => setStage("slides")} />}
          {stage === "slides" && <IntroSlides slides={slides} labels={labels} onDone={finish} />}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  cover: { ...StyleSheet.absoluteFill, backgroundColor: "#ffffff" },
});
