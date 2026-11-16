import { useState } from "react";
import { View } from "react-native";
import { usePreventRemove } from "expo-router";
import {
  Button, Card, ConfirmSheet, ErrorNote, SelectField, Switch, Text, api, queryClient, space, useT, useToast, type Row, type TKey,
} from "@retromobi/mobile-shared";
import { useMerchantShop } from "../../state/shop";
import { useMerchantQuery } from "../../state/query";
import { useCounterWrite } from "../bookings/common";
import { Fields, LabelInput, Pending } from "../fleet/tabs/Fields";
import { MapPin, type ShopPin } from "./MapPin";
import { DAY_ORDER, DEFAULT_SLOT, HALF_HOURS, hoursFromShop, hoursInvalid, hoursPayload, sameEveryDay, type Hours } from "./hours";

export function HoursEditor({ value, onChange, editable }: { value: Hours; onChange: (hours: Hours) => void; editable: boolean }) {
  const { t, date, time } = useT();
  const clock = (value: string) => time(`2024-01-01T${value}:00+05:30`);
  const options = (value: string) => [...new Set([...HALF_HOURS, value])].sort().map((v) => ({ value: v, label: clock(v) }));
  return <Card title={t("setup.hoursTitle")}>
    <Fields>
      {editable && <Button variant="ghost" label={t("setup.sameEveryDay")} onPress={() => onChange(sameEveryDay(value))} />}
      {DAY_ORDER.map((day) => {
        const name = date(`2024-01-0${day || 7}T12:00:00+05:30`, { weekday: "long" });
        const slot = value[day];
        return <Fields key={day}>
          <View style={{ minHeight: 48, flexDirection: "row", gap: space[2], alignItems: "center" }}>
            <Text style={{ flex: 1 }} weight="medium">{name}</Text>
            {editable && <Switch accessibilityLabel={name} value={!!slot} onValueChange={(open) => onChange({ ...value, [day]: open ? { ...DEFAULT_SLOT } : null })} />}
            {!editable && <Text color="ink2">{slot ? `${clock(slot.opensAt)} – ${clock(slot.closesAt)}` : t("setup.closedDay")}</Text>}
          </View>
          {editable && (slot ? <>
            <SelectField label={t("setup.opensAt")} value={slot.opensAt} options={options(slot.opensAt)} closeLabel={t("common.close")}
              onChange={(opensAt) => onChange({ ...value, [day]: { ...slot, opensAt } })} />
            <SelectField label={t("setup.closesAt")} value={slot.closesAt} options={options(slot.closesAt)} closeLabel={t("common.close")}
              onChange={(closesAt) => onChange({ ...value, [day]: { ...slot, closesAt } })} />
          </> : <Text color="ink2">{t("setup.closedDay")}</Text>)}
        </Fields>;
      })}
      {editable && hoursInvalid(value) && <ErrorNote text={t("setup.hoursInvalid")} />}
    </Fields>
  </Card>;
}

const details = [
  ["name", "name", "common.shopName"], ["phone", "phone", "setup.shopPhone"], ["addressLine1", "address_line1", "common.address"],
  ["landmark", "landmark", "shop.landmark"], ["city", "city", "common.city"], ["state", "state", "common.state"],
  ["pincode", "pincode", "common.pincode"], ["email", "email", "shop.email"],
] as const satisfies readonly (readonly [string, string, TKey])[];
type Details = Record<(typeof details)[number][0], string>;

export function ShopDetails({ shopId, setup = false, onDone }: { shopId: string; setup?: boolean; onDone?: () => void }) {
  const q = useMerchantQuery<Row>(`/shops/${shopId}`);
  if (!q.isSuccess) return <Pending error={q.error} retry={q.refetch} />;
  return <ShopEditor key={shopId} shop={q.data} shopId={shopId} setup={setup} onDone={onDone} />;
}

function ShopEditor({ shop, shopId, setup, onDone }: { shop: Row; shopId: string; setup: boolean; onDone?: () => void }) {
  const { t, lang } = useT();
  const toast = useToast();
  const { can, shops, reloadShops } = useMerchantShop();
  const editable = can("shop:write");
  const write = useCounterWrite();
  const [form, setForm] = useState(() => Object.fromEntries(details.map(([key, raw]) => [key, String(shop[raw] ?? "")])) as Details);
  const [pin, setPin] = useState<ShopPin | null>(() => shop.longitude != null && shop.latitude != null ? [Number(shop.longitude), Number(shop.latitude)] : null);
  const [hours, setHours] = useState(() => hoursFromShop(shop));
  const [savedForm, setSavedForm] = useState(JSON.stringify({ form, pin }));
  const [savedHours, setSavedHours] = useState(JSON.stringify(hoursPayload(hours)));
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const detailsChanged = savedForm !== JSON.stringify({ form, pin });
  const hoursChanged = savedHours !== JSON.stringify(hoursPayload(hours));
  const dirty = detailsChanged || hoursChanged;
  const missing = [
    !form.name.trim() && t("common.shopName"), !form.addressLine1.trim() && t("setup.need_address"),
    !form.city.trim() && t("setup.need_city"), !/^\d{6}$/.test(form.pincode) && t("setup.need_pincode"),
    setup && !pin && t("setup.need_pin"), hoursInvalid(hours) && t("setup.need_hours"),
  ].filter(Boolean);
  const disablePrevention = usePreventRemove(dirty, ({ repeat }) => setDiscard(() => repeat));

  function save() {
    if (missing.length || !editable) return;
    void write.run(async () => {
      try {
        if (detailsChanged || setup) {
          await api(`/shops/${shopId}`, { method: "PATCH", body: {
            addressLine1: form.addressLine1.trim(), city: form.city.trim(), pincode: form.pincode,
            phone: form.phone.trim() || undefined, longitude: pin?.[0], latitude: pin?.[1],
            ...(setup ? {} : { name: form.name.trim(), landmark: form.landmark.trim(), state: form.state.trim(), email: form.email.trim() || undefined }),
          } });
          setSavedForm(JSON.stringify({ form, pin }));
        }
        if (hoursChanged || setup) {
          const rows = hoursPayload(hours);
          await api(`/shops/${shopId}/hours`, { method: "PUT", body: { hours: rows } });
          setSavedHours(JSON.stringify(rows));
        }
        toast(t("shop.saved"));
        onDone?.();
      } finally {
        void reloadShops();
        void queryClient.invalidateQueries({ queryKey: ["merchant"] });
      }
    });
  }

  return <Fields>
    <Card title={t(setup ? "setup.shopTitle" : "shop.detailsCard")}>
      <Fields>
        {setup && <Text color="ink2">{t("setup.shopWhy")}</Text>}
        {details.filter(([key]) => !setup || ["addressLine1", "city", "pincode", "phone"].includes(key)).map(([key, , label]) =>
          <LabelInput key={key} label={t(label)} value={form[key]} editable={editable && !write.busy && !(key === "state" && shops.length > 1)}
            hint={key === "state" && shops.length > 1 ? t("shop.stateLocked") : key === "landmark" ? t("shop.landmarkHint") : undefined}
            maxLength={key === "pincode" ? 6 : undefined} keyboardType={key === "pincode" ? "number-pad" : key === "phone" ? "phone-pad" : key === "email" ? "email-address" : "default"}
            autoCapitalize={key === "email" ? "none" : undefined}
            onChangeText={(value) => setForm((prev) => ({ ...prev, [key]: key === "pincode" ? value.replace(/\D/g, "") : value }))} />)}
        <MapPin value={pin} onChange={setPin} readOnly={!editable || write.busy} />
      </Fields>
    </Card>
    <HoursEditor value={hours} onChange={setHours} editable={editable && !write.busy} />
    {!!missing.length && editable && (dirty || setup) && <Text color="danger">{t("setup.stillNeeded", { items: missing.join(", ") })}</Text>}
    {write.error && <ErrorNote text={write.error} />}
    {editable && (dirty || setup) && <Button variant="primary" label={t(setup ? "setup.saveContinue" : "shop.saveChanges")}
      disabled={!!missing.length} busy={write.busy} onPress={save} />}
    <ConfirmSheet open={!!discard} title={lang === "hi" ? "बदलाव छोड़ दें?" : "Discard changes?"}
      body={lang === "hi" ? "आपके बदलाव सेव नहीं हुए हैं।" : "Your changes haven’t been saved."}
      confirmLabel={lang === "hi" ? "बदलाव छोड़ें" : "Discard changes"} cancelLabel={t("common.cancel")} danger busy={write.busy}
      onClose={() => setDiscard(null)} onConfirm={() => { disablePrevention(); discard?.(); setDiscard(null); }} />
  </Fields>;
}
