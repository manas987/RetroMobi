import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Easing, FadeInDown, ReduceMotion, useReducedMotion } from "react-native-reanimated";
import { X } from "lucide-react-native";
import { useT } from "../i18n";
import { colors, HIT, radius, space } from "../theme";
import { Text } from "./Text";
import { Button } from "./Button";

const sheetEntry = FadeInDown.duration(310).easing(Easing.out(Easing.cubic))
  .withInitialValues({ opacity: 0.72, transform: [{ translateY: 64 }] })
  .reduceMotion(ReduceMotion.System);

/**
 * A bottom sheet for one task (hand over, add rider, filters). The website's
 * centred popups become this on a phone.
 *
 * - Android back button and a tap on the dim area both call `onClose`.
 * - The body scrolls and rises above the keyboard.
 * - Pass `busy` while a request runs so the sheet can't be closed mid-save.
 */
export function Sheet({ open, onClose, title, children, footer, busy = false, scroll = true, dismissible = true, closeLabel }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Pinned under the scroll area: the primary action. */
  footer?: ReactNode;
  busy?: boolean;
  scroll?: boolean;
  dismissible?: boolean;
  closeLabel?: string;
}) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const close = () => { if (!busy && dismissible) onClose(); };
  return (
    <Modal visible={open} transparent animationType={reducedMotion ? "none" : "fade"} onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.fill} behavior="padding">
        <Pressable style={styles.scrim} onPress={close} accessible={false} disabled={busy || !dismissible} />
        <Animated.View entering={sheetEntry} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space[4]) }]} accessibilityViewIsModal>
          <View style={styles.grab} accessible={false} />
          <View style={styles.head}>
            <Text weight="bold" size="lg" style={{ flex: 1 }} accessibilityRole="header">{title}</Text>
            {dismissible && <Pressable onPress={close} disabled={busy} accessibilityState={{ disabled: busy }} style={styles.close} accessibilityRole="button" accessibilityLabel={closeLabel ?? t("common.close")}>
              <X size={20} color={colors.ink2} />
            </Pressable>}
          </View>
          {scroll ? <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>{children}</ScrollView> : children}
          {footer && <View style={styles.footer}>{footer}</View>}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** "Are you sure?" for anything that removes, cancels or publishes. */
export function ConfirmSheet({ open, onClose, title, body, confirmLabel, cancelLabel = "Cancel", danger = false, busy = false, error, onConfirm }: {
  open: boolean;
  onClose: () => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} busy={busy}
      footer={
        <View style={{ gap: space[2] }}>
          <Button label={confirmLabel} variant={danger ? "danger" : "primary"} size="lg" busy={busy} onPress={onConfirm} full />
          <Button label={cancelLabel} variant="ghost" size="lg" disabled={busy} onPress={onClose} full />
        </View>
      }>
      {typeof body === "string" ? <Text color="ink2" size="md">{body}</Text> : body}
      {error ? <Text color="danger" size="sm" style={{ marginTop: space[3] }} accessibilityRole="alert">{error}</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  sheet: { maxHeight: "90%", backgroundColor: colors.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet },
  grab: { alignSelf: "center", width: 40, height: 5, borderRadius: radius.full, backgroundColor: colors.lineStrong, marginTop: space[2] },
  head: { flexDirection: "row", alignItems: "center", gap: space[3], paddingLeft: space[5], paddingRight: space[3], paddingBottom: space[3], paddingTop: space[1], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  close: { height: HIT, width: HIT, alignItems: "center", justifyContent: "center", borderRadius: radius.full, backgroundColor: colors.surface3 },
  body: { padding: space[5] },
  footer: { paddingHorizontal: space[5], paddingTop: space[3], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});
