import type { ReactNode } from "react";
import { View, type TextInputProps } from "react-native";
import { Button, ErrorNote, Field, Input, LoadingRows, errorText, space, useT } from "@retromobi/mobile-shared";

export function Fields({ children }: { children: ReactNode }) {
  return <View style={{ gap: space[3] }}>{children}</View>;
}
export function LabelInput({ label, hint, error, ...props }: TextInputProps & { label: string; hint?: string; error?: string }) {
  return <Field label={label} hint={hint} error={error}><Input accessibilityLabel={label} {...props} /></Field>;
}
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
