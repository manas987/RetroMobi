import { useState } from "react";
import { View } from "react-native";
import { CheckCircle2 } from "lucide-react-native";
import {
  Button, Card, ErrorNote, Field, Input, LoadingRows, SelectOptions, Sheet, api, enumLabel, errorText, queryClient, space, useT, type Row,
} from "@retromobi/mobile-shared";
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
  const [price, setPrice] = useState(false);
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
          : <Field label={t("fleet.fModel")}><Button label={selected ? `${selected.group} · ${selected.label}` : t("fleet.pickModel")} onPress={() => setPicking(true)} /></Field>}
        <Field label={t("fleet.fPlate")}><Input value={plate} accessibilityLabel={t("fleet.fPlate")} autoCapitalize="characters" autoCorrect={false} onChangeText={(v) => setPlate(v.toUpperCase())} /></Field>
        <Field label={`${t("fleet.fColor")} (${t("common.optional")})`}><Input value={color} accessibilityLabel={t("fleet.fColor")} onChangeText={setColor} /></Field>
        {can("pricing:write") && <>
          <Button label={t("fleet.priceLater")} accessibilityState={{ expanded: price }} onPress={() => setPrice(!price)} />
          {price && <>
            <Field label={t("fleet.fPerDay")}><Input keyboardType="decimal-pad" accessibilityLabel={t("fleet.fPerDay")} value={amount} onChangeText={setAmount} /></Field>
            <Field label={t("fleet.fDeposit")} error={depositTooHigh ? t("fleet.depositMax") : undefined}><Input keyboardType="decimal-pad" accessibilityLabel={t("fleet.fDeposit")} value={deposit} onChangeText={setDeposit} /></Field>
            <Field label={t("fleet.fLateFee")}><Input keyboardType="decimal-pad" accessibilityLabel={t("fleet.fLateFee")} value={lateFee} onChangeText={setLateFee} /></Field>
          </>}
        </>}
        {error && <ErrorNote text={error} />}
      </View>}
  </Sheet>;
}
