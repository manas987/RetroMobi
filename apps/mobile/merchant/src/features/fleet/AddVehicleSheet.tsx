import { useState } from "react";
import { View } from "react-native";
import { CheckCircle2 } from "lucide-react-native";
import {
  Button, Card, ErrorNote, LoadingRows, SelectOptions, SelectTrigger, Sheet, api, enumLabel, errorText, queryClient, space, useT, type Row,
} from "@retromobi/mobile-shared";
import { LabelInput } from "./tabs/Fields";
import { Disclosure } from "../../ui/Disclosure";
import { useMerchantShop } from "../../state/shop";
import { useMerchantQuery } from "../../state/query";
import { useCounterWrite } from "../bookings/common";

export const paise = (value: string) => Math.round(Number(value || "0") * 100);

export function AddVehicleSheet({ open, onClose, onManage }: { open: boolean; onClose: () => void; onManage: (id: string) => void }) {
  return open ? <AddVehicle onClose={onClose} onManage={onManage} /> : null;
}

function AddVehicle({ onClose, onManage }: { onClose: () => void; onManage: (id: string) => void }) {
  const { shopId, can } = useMerchantShop();
  const { t, lang } = useT();
  const models = useMerchantQuery<{ models: Row[] }>("/models");
  const [modelId, setModelId] = useState("");
  const [picking, setPicking] = useState(false);
  const [plate, setPlate] = useState("");
  const [color, setColor] = useState("");
  const [amount, setAmount] = useState("");
  const [deposit, setDeposit] = useState("");
  const [lateFee, setLateFee] = useState("50");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const { busy, error, run } = useCounterWrite();
  const hasPrice = can("pricing:write") && amount !== "";
  const depositTooHigh = paise(deposit) > 1_000_000;
  const valid = !!modelId && !!plate.trim() && !depositTooHigh && (!hasPrice || paise(amount) > 0 && paise(deposit) >= 0 && paise(lateFee) >= 0);
  const options = (models.data?.models ?? []).slice().sort((a, b) => String(a.make).localeCompare(String(b.make))).map((m) => ({
    value: String(m.id), label: `${m.model} (${enumLabel(m.fuel_type)})`, group: String(m.make),
  }));
  const selected = options.find((option) => option.value === modelId);

  function submit() {
    if (!valid || !shopId || !can("fleet:write")) return;
    void run(async () => {
      const row = await api<Row>(`/shops/${shopId}/vehicles`, { method: "POST", body: {
        modelId, registrationNumber: plate.trim(), color: color.trim() || undefined,
      } });
      setCreatedId(String(row.id));
      if (hasPrice) {
        try {
          await api(`/vehicles/${row.id}/pricing`, { method: "PUT", body: {
            amount: paise(amount), weekendAmount: paise(amount), securityDepositAmount: paise(deposit), lateFeeAmount: paise(lateFee),
          } });
        } finally {
          void queryClient.invalidateQueries({ queryKey: ["merchant"] });
        }
      }
    });
  }

  return <Sheet open title={t(picking ? "fleet.fModel" : "fleet.addTitle")} closeLabel={t("common.close")}
    onClose={picking ? () => setPicking(false) : onClose} scroll={!picking} busy={busy}
    footer={picking ? null : createdId ? <View style={{ gap: space[2] }}>
      <Button variant="primary" label={t("fleet.addPhotosPapers")} onPress={() => onManage(createdId)} />
      <Button variant="ghost" label={t("common.done")} onPress={onClose} />
    </View> : <Button variant="primary" label={t("fleet.addVehicle")} disabled={!valid} busy={busy} onPress={submit} />}>
    {picking ? <SelectOptions value={modelId} options={options} onChange={(id) => { setModelId(id); setPicking(false); }} />
      : createdId ? <Card title={t("fleet.added")} icon={CheckCircle2}>{error && <ErrorNote text={error} />}</Card>
      : <View style={{ gap: space[3] }}>
        {models.isPending ? <LoadingRows rows={1} label={t("common.loading")} /> : models.isError
          ? <ErrorNote text={errorText(lang, models.error)} retryLabel={t("common.retry")} onRetry={() => void models.refetch()} />
          : <SelectTrigger compact label={t("fleet.fModel")} value={selected ? `${selected.group} · ${selected.label}` : undefined}
            placeholder={t("fleet.pickModel")} onPress={() => setPicking(true)} />}
        <LabelInput label={t("fleet.fPlate")} value={plate} accessibilityLabel={t("fleet.fPlate")} autoCapitalize="characters" autoCorrect={false} onChangeText={(v) => setPlate(v.toUpperCase())} />
        <LabelInput label={`${t("fleet.fColor")} (${t("common.optional")})`} value={color} accessibilityLabel={t("fleet.fColor")} onChangeText={setColor} />
        {can("pricing:write") && <Disclosure label={t("fleet.priceLater")}>
          <LabelInput label={t("fleet.fPerDay")} prefix="₹" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
          <LabelInput label={t("fleet.fDeposit")} error={depositTooHigh ? t("fleet.depositMax") : undefined}
            prefix="₹" keyboardType="decimal-pad" value={deposit} onChangeText={setDeposit} />
          <LabelInput label={t("fleet.fLateFee")} prefix="₹" keyboardType="decimal-pad" value={lateFee} onChangeText={setLateFee} />
        </Disclosure>}

        {error && <ErrorNote text={error} />}
      </View>}
  </Sheet>;
}
