import { useState } from "react";
import { Button, Card, DateField, EmptyState, ErrorNote, Text, api, dateLabel, istDay, rupees, useT, useToast, ApiError, type Row } from "@retromobi/mobile-shared";
import { useMerchantQuery } from "../../../state/query";
import { useMerchantShop } from "../../../state/shop";
import { useCounterWrite } from "../../bookings/common";
import { paise } from "../AddVehicleSheet";
import { Fields, FormButtons, LabelInput, Pending } from "./Fields";

const asRupees = (value: unknown) => value == null ? "" : String(Number(value) / 100);
export function PriceTab({ id }: { id: string }) {
  const { t } = useT();
  const q = useMerchantQuery<Row>(`/vehicles/${id}/pricing`);
  const missing = q.error instanceof ApiError && q.error.status === 404;
  if (!q.isSuccess && !missing) return <Pending error={q.error} retry={q.refetch} />;
  return <>
    {missing && <ErrorNote text={t("fleet.noPriceWarn")} />}
    <BaseRates key={missing ? "new" : "set"} id={id} pricing={q.data ?? {}} />
    <Specials id={id} />
  </>;
}

function BaseRates({ id, pricing }: { id: string; pricing: Row }) {
  const { t } = useT();
  const toast = useToast();
  const { can } = useMerchantShop();
  const write = useCounterWrite();
  const editable = can("pricing:write");
  const [amount, setAmount] = useState(asRupees(pricing.amount));
  const [weekend, setWeekend] = useState(asRupees(pricing.weekend_amount));
  const [deposit, setDeposit] = useState(asRupees(pricing.security_deposit_amount));
  const [lateFee, setLateFee] = useState(asRupees(pricing.late_fee_amount) || "50");
  const depositTooHigh = paise(deposit) > 1_000_000;
  const valid = editable && !!deposit.trim() && !depositTooHigh && [paise(amount), paise(weekend || amount)].every((n) => Number.isSafeInteger(n) && n > 0)
    && [paise(deposit), paise(lateFee)].every((n) => Number.isSafeInteger(n) && n >= 0);
  return <Card title={t("fleet.priceTitle")}>
    <Fields>
      <Text color="ink2">{t("fleet.priceHint")}</Text>
      <LabelInput label={t("fleet.fPerDay")} value={amount} keyboardType="decimal-pad" onChangeText={setAmount} editable={editable && !write.busy} />
      <LabelInput label={t("fleet.fWeekend")} hint={t("fleet.weekendHint")} value={weekend} keyboardType="decimal-pad" onChangeText={setWeekend} editable={editable && !write.busy} />
      <LabelInput label={t("fleet.fDeposit")} value={deposit} keyboardType="decimal-pad" onChangeText={setDeposit} editable={editable && !write.busy} error={depositTooHigh ? t("fleet.depositMax") : undefined} />
      <LabelInput label={t("fleet.fLateFee")} value={lateFee} keyboardType="decimal-pad" onChangeText={setLateFee} editable={editable && !write.busy} />
      {editable && <FormButtons busy={write.busy} error={write.error} valid={valid} save={() => {
        if (!valid) return;
        void write.run(async () => {
          await api(`/vehicles/${id}/pricing`, { method: "PUT", body: {
            amount: paise(amount), weekendAmount: paise(weekend || amount), securityDepositAmount: paise(deposit), lateFeeAmount: paise(lateFee),
          } });
          toast(t("common.saved"));
        });
      }} />}
    </Fields>
  </Card>;
}

function Specials({ id }: { id: string }) {
  const { t, lang } = useT();
  const { can } = useMerchantShop();
  const base = `/vehicles/${id}/pricing/specials`;
  const q = useMerchantQuery<{ specials: Row[] }>(base);
  const write = useCounterWrite();
  const [form, setForm] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [weekend, setWeekend] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const today = istDay(new Date());
  const valid = !!name.trim() && from >= today && until >= from && [paise(amount), paise(weekend || amount)].every((n) => Number.isSafeInteger(n) && n > 0);
  return <Card title={t("fleet.specialsTitle")}>
    <Fields>
      {!q.isSuccess ? <Pending error={q.error} retry={q.refetch} /> : <>
        {!q.data.specials.length && <EmptyState text={t("fleet.specialsEmpty")} />}
        {q.data.specials.map((item) => <Fields key={String(item.id)}>
          <Text weight="medium">{String(item.name)} · {rupees(Number(item.amount))}</Text>
          <Text size="sm" color="ink2">{dateLabel(item.effective_from, lang)} – {dateLabel(item.effective_until, lang)}</Text>
          {can("pricing:write") && <Button label={t("common.remove")} variant="ghost" disabled={write.busy}
            onPress={() => void write.run(async () => { await api(`${base}/${item.id}`, { method: "DELETE" }); })} />}
        </Fields>)}
        {can("pricing:write") && (!form ? <Button label={t("fleet.specialsAdd")} onPress={() => { setName(""); setAmount(""); setWeekend(""); setFrom(""); setUntil(""); setForm(true); }} />
          : <>
            <LabelInput label={t("fleet.specialName")} value={name} onChangeText={setName} />
            <LabelInput label={t("fleet.fPerDay")} value={amount} keyboardType="decimal-pad" onChangeText={setAmount} />
            <LabelInput label={t("fleet.fWeekend")} hint={t("fleet.weekendHint")} value={weekend} keyboardType="decimal-pad" onChangeText={setWeekend} />
            <DateField label={t("common.from")} value={from} min={today} onChange={setFrom} yearStepper={false} />
            <DateField label={t("fleet.untilIncl")} value={until} min={from || today} onChange={setUntil} yearStepper={false} />
            {!!until && until < from && <Text color="danger">{t("fleet.badRange")}</Text>}
            <FormButtons valid={valid} busy={write.busy} error={write.error} close={() => setForm(false)} save={() => {
              if (valid) void write.run(async () => {
                await api(base, { method: "POST", body: { name: name.trim(), amount: paise(amount), weekendAmount: paise(weekend || amount), effectiveFrom: from, effectiveUntil: until } });
                setForm(false);
              });
            }} />
          </>)}
        {!form && write.error && <ErrorNote text={write.error} />}
      </>}
    </Fields>
  </Card>;
}
