import { useState } from "react";
import { View } from "react-native";
import { CheckCircle2 } from "lucide-react-native";
import {
  Button, Card, COUNTRIES, DateRangeSheet, ErrorNote, Field, Input, LoadingRows, SelectOptions, SelectTrigger, Sheet, Text,
  api, colors, dateTimeLabel, errorText, istDay, rupees, space, useT, validPhone, type DateWindow, type Row,
} from "@retromobi/mobile-shared";
import { useMerchantShop } from "../../state/shop";
import { useMerchantQuery } from "../../state/query";
import { useCounterWrite, vehicleLabel } from "./common";
import { LabelInput } from "../fleet/tabs/Fields";

function walkinWindow(startDay?: string): DateWindow {
  if (startDay && startDay > istDay(new Date())) {
    return { pickupAt: `${startDay}T10:00:00+05:30`, returnAt: `${startDay}T18:00:00+05:30` };
  }
  const quarter = 15 * 60_000;
  const at = Math.ceil(Date.now() / quarter) * quarter;
  return { pickupAt: new Date(at).toISOString(), returnAt: new Date(at + 8 * 60 * 60_000).toISOString() };
}

type Props = { onClose: () => void; vehicleId?: string; startDay?: string };
type Result = { totals: { rentalAmount: number; securityDepositAmount: number } };

export function WalkinSheet({ open, ...props }: Props & { open: boolean }) {
  return open ? <WalkinForm {...props} /> : null;
}

function WalkinForm({ onClose, vehicleId: initialVehicleId, startDay }: Props) {
  const { t, lang, date, time } = useT();
  const { shopId } = useMerchantShop();
  const q = useMerchantQuery<{ vehicles: Row[] }>(shopId ? `/shops/${shopId}/vehicles` : null);
  const [vehicleId, setVehicleId] = useState(initialVehicleId ?? "");
  const [name, setName] = useState("");
  const [digits, setDigits] = useState("");
  const [country, setCountry] = useState(COUNTRIES.find((item) => item.code === "IN")!);
  const [dl, setDl] = useState("");
  const [win, setWin] = useState(() => walkinWindow(startDay));
  const [pick, setPick] = useState<"vehicle" | "country" | "dates" | null>(null);
  const [saved, setSaved] = useState<Result | null>(null);
  const { busy, error, run } = useCounterWrite();
  const closeLabel = t("common.close");
  const vehicles = q.data?.vehicles ?? [];
  const selected = vehicles.find((v) => v.id === vehicleId);
  const phone = country.dial + digits;
  const start = Date.parse(win.pickupAt);
  const end = Date.parse(win.returnAt);
  const valid = !!selected && selected.amount != null && !!name.trim() && validPhone(phone) && !!dl.trim() && end > start;

  function submit() {
    if (!valid) return;
    void run(async () => {
      const result = await api<Result>("/bookings/walkin", { method: "POST", body: {
        vehicleId, walkinName: name.trim(), walkinPhone: phone, walkinDlNumber: dl.trim(),
        pickupAt: new Date(start).toISOString(), returnAt: new Date(end).toISOString(),
      } });
      setSaved(result);
    });
  }

  if (pick === "dates") return <DateRangeSheet open onClose={() => setPick(null)} value={win} onChange={setWin} lang={lang} />;
  if (pick === "vehicle") return <Sheet open scroll={false} title={t("actions.walkinVehicle")} closeLabel={closeLabel} onClose={() => setPick(null)}>
    <SelectOptions value={vehicleId} options={vehicles.map((v) => ({
      value: String(v.id), label: v.amount == null ? `${vehicleLabel(v)} — ${t("actions.walkinNoPrice")}` : vehicleLabel(v), disabled: v.amount == null,
    }))} onChange={(id) => { setVehicleId(id); setPick(null); }} />
  </Sheet>;
  if (pick === "country") return <Sheet open scroll={false} title={t("actions.walkinPhone")} closeLabel={closeLabel} onClose={() => setPick(null)}>
    <SelectOptions value={country.code} options={COUNTRIES.map((c) => ({ value: c.code, label: `${c.flag} ${c.dial} · ${c.name}` }))}
      onChange={(code) => { setCountry(COUNTRIES.find((c) => c.code === code)!); setPick(null); }} />
  </Sheet>;

  return <Sheet open onClose={onClose} closeLabel={closeLabel} title={t("actions.walkinTitle")} busy={busy} footer={
    saved ? <Button variant="dark" label={t("common.done")} onPress={onClose} />
      : vehicles.length > 0 ? <Button variant="primary" label={t("actions.walkinSubmit")} disabled={!valid} busy={busy} onPress={submit} /> : null
  }>
    {saved ? <Card icon={CheckCircle2} title={t("actions.walkinSaved")} style={{ backgroundColor: colors.verifiedSoft }}>
      <Text size="lg" weight="bold">{t("actions.walkinCollect", { amount: rupees(saved.totals.rentalAmount) })}</Text>
      {saved.totals.securityDepositAmount > 0 && <Text>{t("actions.walkinDepositNote", { amount: rupees(saved.totals.securityDepositAmount) })}</Text>}
    </Card> : q.isPending ? <LoadingRows label={t("common.loading")} />
      : q.isError ? <ErrorNote text={errorText(lang, q.error)} retryLabel={t("common.retry")} onRetry={() => void q.refetch()} />
      : vehicles.length === 0 ? <Text color="ink2">{t("actions.walkinNoVehicles")}</Text>
      : <View style={{ gap: space[3] }}>
        <Text color="ink2">{t("actions.walkinIntro")}</Text>
        <SelectTrigger compact label={t("actions.walkinVehicle")} value={selected ? vehicleLabel(selected) : undefined}
          placeholder={t("actions.walkinChooseVehicle")} onPress={() => setPick("vehicle")} />
        <LabelInput label={t("actions.walkinName")} value={name} onChangeText={setName} accessibilityLabel={t("actions.walkinName")} autoComplete="name" />
        <Field label={t("actions.walkinPhone")}>
          <View style={{ flexDirection: "row", gap: space[2] }}>
            <Button label={`${country.flag} ${country.dial}`} accessibilityLabel={`${t("actions.walkinPhone")} · ${country.name} ${country.dial}`} onPress={() => setPick("country")} />
            <Input value={digits} style={{ flex: 1 }} keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel-national"
              accessibilityLabel={t("actions.walkinPhone")} maxLength={12} onChangeText={(v) => setDigits(v.replace(/\D/g, ""))} />
          </View>
        </Field>
        <LabelInput label={t("actions.licenceNumber")} value={dl} onChangeText={(v) => setDl(v.toUpperCase())} accessibilityLabel={t("actions.licenceNumber")} autoCapitalize="characters" autoCorrect={false} />
        <SelectTrigger compact label={t("actions.walkinWhen")} onPress={() => setPick("dates")}
          value={`${lang === "en" ? dateTimeLabel(win.pickupAt) : `${date(win.pickupAt)}, ${time(win.pickupAt)}`} → ${date(win.returnAt)}, ${time(win.returnAt)}`} />
        {end <= start && <Text color="danger">{t("actions.walkinWindowError")}</Text>}
        {error && <ErrorNote text={error} />}
      </View>}
  </Sheet>;
}
