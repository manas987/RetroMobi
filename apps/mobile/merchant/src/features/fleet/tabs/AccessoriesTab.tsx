import { useState } from "react";
import { View } from "react-native";
import { Button, Card, Chip, ConfirmSheet, EmptyState, ErrorNote, Switch, Text, api, space, useT, type Row } from "@retromobi/mobile-shared";
import { useMerchantQuery } from "../../../state/query";
import { useMerchantShop } from "../../../state/shop";
import { useCounterWrite } from "../../bookings/common";
import { Fields, FormButtons, LabelInput, Pending } from "./Fields";

export function AccessoriesTab({ id }: { id: string }) {
  const { t } = useT();
  const { can } = useMerchantShop();
  const base = `/vehicles/${id}/accessories`;
  const q = useMerchantQuery<{ accessories: Row[] }>(base);
  const [form, setForm] = useState(false);
  const [remove, setRemove] = useState<Row | null>(null);
  const [type, setType] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [available, setAvailable] = useState(true);
  const add = useCounterWrite();
  const deletion = useCounterWrite();
  if (!q.isSuccess) return <Pending error={q.error} retry={q.refetch} />;
  const list = q.data.accessories;
  const duplicate = list.some((a) => String(a.type).trim().toLowerCase() === type.trim().toLowerCase());
  const qty = Number(quantity);
  const valid = !!type.trim() && !duplicate && Number.isSafeInteger(qty) && qty > 0;
  const start = () => { setType(""); setQuantity("1"); setAvailable(true); setForm(true); };
  return <Card title={t("fleet.accTitle")}>
    <Fields>
      <Text color="ink2">{t("fleet.accHint")}</Text>
      {!list.length && <EmptyState text={t("fleet.accEmpty")} />}
      {list.map((a) => <View key={String(a.id)} style={{ gap: space[2] }}>
        <Text weight="medium">{String(a.type)} × {String(a.quantity)}</Text>
        <Chip tone={a.status === "AVAILABLE" ? "good" : "muted"} label={t(a.status === "AVAILABLE" ? "fleet.accAvailable" : "fleet.accUnavailable")} />
        {can("fleet:write") && <Button label={t("common.remove")} variant="ghost" onPress={() => setRemove(a)} />}
      </View>)}
      {can("fleet:write") && (!form ? <Button label={t("fleet.accAdd")} onPress={start} /> : <Fields>
        <LabelInput label={t("fleet.accName")} value={type} onChangeText={setType} error={duplicate ? t("fleet.accDuplicate") : undefined} />
        <LabelInput label={t("fleet.accQty")} value={quantity} keyboardType="number-pad" onChangeText={setQuantity} />
        <View style={{ flexDirection: "row", minHeight: 48, alignItems: "center", gap: space[2] }}>
          <Text style={{ flex: 1 }}>{t("fleet.accAvailableToRiders")}</Text>
          <Switch value={available} onValueChange={setAvailable} accessibilityLabel={t("fleet.accAvailableToRiders")} />
        </View>
        <FormButtons busy={add.busy} valid={valid} error={add.error} close={() => setForm(false)} save={() => {
          if (valid) void add.run(async () => {
            await api(base, { method: "POST", body: { type: type.trim(), quantity: qty, status: available ? "AVAILABLE" : "UNAVAILABLE" } });
            setForm(false);
          });
        }} />
      </Fields>)}
      {deletion.error && !remove && <ErrorNote text={deletion.error} />}
      <ConfirmSheet open={!!remove} title={t("common.remove")} body={String(remove?.type ?? "")} cancelLabel={t("common.cancel")}
        confirmLabel={t("common.remove")} danger busy={deletion.busy} error={deletion.error} onClose={() => setRemove(null)} onConfirm={() => {
          if (remove) void deletion.run(async () => { await api(`${base}/${remove.id}`, { method: "DELETE" }); setRemove(null); });
        }} />
    </Fields>
  </Card>;
}
