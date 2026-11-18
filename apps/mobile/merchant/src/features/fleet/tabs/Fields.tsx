import { useState, type ReactNode } from "react";
import { StyleSheet, View, type TextInputProps } from "react-native";
import { Button, ErrorNote, Input, LoadingRows, Text, colors, errorText, radius, space, useT } from "@retromobi/mobile-shared";

export function Fields({ children }: { children: ReactNode }) {
  return <View style={{ gap: space[3] }}>{children}</View>;
}
export function LabelInput({ label, hint, error, prefix, style, onFocus, onBlur, ...props }: TextInputProps & { label: string; hint?: string; error?: string; /** Shown before the value, e.g. "₹". */ prefix?: string }) {
  const [focused, setFocused] = useState(false);
  return <View style={{ gap: space[1] }}>
    <View style={[fieldStyles.frame, focused && fieldStyles.focus, error && fieldStyles.invalid]}>
      <Text size="xs" weight="medium" color={error ? "danger" : "ink2"} style={fieldStyles.label}>{label}</Text>
      <View style={fieldStyles.row}>
        {prefix && <Text size="md" weight="bold" style={fieldStyles.prefix} accessible={false}>{prefix}</Text>}
        <Input {...props} accessibilityLabel={props.accessibilityLabel ?? label}
          onFocus={(event) => { setFocused(true); onFocus?.(event); }}
          onBlur={(event) => { setFocused(false); onBlur?.(event); }}
          style={[fieldStyles.input, prefix && fieldStyles.afterPrefix, props.multiline && fieldStyles.multiline, style]} />
      </View>
    </View>
    {error ? <Text size="sm" color="danger" accessibilityRole="alert">{error}</Text>
      : hint ? <Text size="xs" color="ink2">{hint}</Text> : null}
  </View>;
}
const fieldStyles = StyleSheet.create({
  frame: { backgroundColor: colors.surface2, borderRadius: radius.panel, borderWidth: 1, borderColor: colors.lineStrong, paddingTop: space[2] },
  focus: { borderColor: colors.verified, backgroundColor: colors.surface },
  invalid: { borderColor: colors.danger },
  label: { paddingHorizontal: space[3] },
  input: { flex: 1, minHeight: 36, backgroundColor: "transparent", borderWidth: 0, paddingTop: 0, paddingBottom: space[2], paddingHorizontal: space[3] },
  multiline: { minHeight: 76, textAlignVertical: "top" },
  row: { flexDirection: "row", alignItems: "center" },
  prefix: { paddingLeft: space[3], paddingBottom: space[2] },
  afterPrefix: { flex: 1, paddingLeft: space[1] },
});
export function Pending({ error, retry }: { error: Error | null; retry: () => unknown }) {
  const { t, lang } = useT();
  return error ? <ErrorNote text={errorText(lang, error)} retryLabel={t("common.retry")} onRetry={() => void retry()} />
    : <LoadingRows label={t("common.loading")} />;
}
export function FormButtons({ save, close, busy, valid, error, label }: {
  save: () => void; close?: () => void; busy: boolean; valid: boolean; error: string | null; label?: string;
}) {
  const { t } = useT();
  return <>
    {error && <ErrorNote text={error} />}
    <Button label={label ?? t("common.save")} variant="primary" busy={busy} disabled={!valid} onPress={save} />
    {close && <Button label={t("common.cancel")} variant="ghost" disabled={busy} onPress={close} />}
  </>;
}
