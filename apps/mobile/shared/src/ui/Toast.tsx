import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, space } from "../theme";
import { Text } from "./Text";

type Show = (message: string) => void;
const ToastContext = createContext<Show>(() => {});

/** `const toast = useToast(); toast("Saved")`. One at a time; a new one replaces the old. */
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback<Show>((next) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(next);
    // Screen readers get it spoken; the visual toast is silent to them otherwise.
    AccessibilityInfo.announceForAccessibility(next);
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMessage(null));
    }, 3200);
  }, [opacity]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message && (
        <Animated.View pointerEvents="none" style={[styles.toast, { bottom: insets.bottom + 88, opacity }]}>
          <Text size="sm" color="surface" center>{message}</Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toast: { position: "absolute", alignSelf: "center", maxWidth: "90%", backgroundColor: colors.ink, borderRadius: radius.full, paddingHorizontal: space[4], paddingVertical: space[3] },
});
