import { useRef, useState } from "react";
import { View } from "react-native";
import { Store } from "lucide-react-native";
import {
  api, Button, Card, ErrorNote, Field, Input, Text, errorText, space, useT, type TKey,
} from "@retromobi/mobile-shared";

const fields = [
  ["name", "common.shopName"], ["addressLine1", "common.address"], ["city", "common.city"],
  ["pincode", "common.pincode"], ["state", "common.state"],
] as const satisfies readonly (readonly [string, TKey])[];

export function FirstShop({ onCreated }: { onCreated: () => Promise<unknown> }) {
  const { t, lang } = useT();
  const [form, setForm] = useState({ name: "", addressLine1: "", city: "", state: "Uttarakhand", pincode: "" });
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const invalid = fields.filter(([key]) => key === "pincode" ? !/^\d{6}$/.test(form.pincode) : !form[key].trim());

  async function submit() {
    if (locked.current || invalid.length) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      await api("/shops", { method: "POST", body: form });
      await onCreated();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return <Card title={t("common.firstShopTitle")} icon={Store}>
    <View style={{ gap: space[3] }}>
      <Text color="ink2">{t("common.firstShopBody")}</Text>
      {fields.map(([key, label]) => <Field key={key} label={t(label)}>
        <Input value={form[key]} accessibilityLabel={t(label)} editable={!busy}
          autoComplete={key === "pincode" ? "postal-code" : key === "addressLine1" ? "street-address" : undefined}
          keyboardType={key === "pincode" ? "number-pad" : "default"} returnKeyType={key === "state" ? "done" : "next"}
          maxLength={key === "pincode" ? 6 : undefined}
          onChangeText={(value) => setForm((prev) => ({ ...prev, [key]: key === "pincode" ? value.replace(/\D/g, "") : value }))} />
      </Field>)}
      {invalid.length > 0 && <Text size="sm" color="ink2">{t("setup.stillNeeded", { items: invalid.map(([key, label]) => t(key === "pincode" ? "setup.need_pincode" : label)).join(", ") })}</Text>}
      {error && <ErrorNote text={error} />}
      <Button label={busy ? t("common.saving") : t("common.createShop")} variant="primary" size="lg" full busy={busy}
        disabled={invalid.length > 0} onPress={() => void submit()} />
    </View>
  </Card>;
}
