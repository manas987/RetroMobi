import { useState } from "react";
import { CalendarClock, CalendarOff } from "lucide-react-native";
import { useRouter } from "expo-router";
import { Button, Card, ConfirmSheet, DateField, EmptyState, Text, api, istDay, useT, type Row } from "@retromobi/mobile-shared";
import { CounterRowLink, counterStyles } from "../../../ui/Counter";
import { useMerchantQuery } from "../../../state/query";
import { useMerchantShop } from "../../../state/shop";
import { renterName, useCounterWrite } from "../../bookings/common";
import type { Staged } from "../vehicleNow";
import { Fields, FormButtons, LabelInput, Pending } from "./Fields";

export function CalendarTab({ id, shopId, staged }: { id: string; shopId: string; staged: Staged[] }) {
  const { t, date, time } = useT();
  const router = useRouter();
  const { can } = useMerchantShop();
  const base = `/vehicles/${id}/unavailability`;
  const q = useMerchantQuery<{ blocks: Row[] }>(base);
  const [form, setForm] = useState(false);
  const [remove, setRemove] = useState<Row | null>(null);
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const add = useCounterWrite();
  const deletion = useCounterWrite();
  const today = istDay(new Date());
  const valid = !!from && !!until && from <= until && from >= today;
  const upcoming = staged.filter(({ b }) => b.vehicle_id === id).sort((a, b) => String(a.b.scheduled_pickup_at).localeCompare(String(b.b.scheduled_pickup_at)));
  return <>
    <Card style={counterStyles.panel} title={t("fleet.upcomingTitle")}>
      <Fields>
        {!upcoming.length && <EmptyState text={t("fleet.noUpcoming")} />}
        {upcoming.map(({ b }) => <CounterRowLink key={String(b.id)} icon={CalendarClock} title={renterName(b)}
          detail={`${date(b.scheduled_pickup_at)} ${time(b.scheduled_pickup_at)} → ${date(b.scheduled_return_at)} ${time(b.scheduled_return_at)}`}
          onPress={() => router.push({ pathname: "/booking/[id]", params: { id: String(b.id), shopId } })} />)}
      </Fields>
    </Card>
    <Card style={counterStyles.panel} icon={CalendarOff} title={t("fleet.blocksTitle")}>
      <Fields>
        <Text color="ink2">{t("fleet.blocksHint")}</Text>
        {!q.isSuccess ? <Pending error={q.error} retry={q.refetch} /> : <>
          {!q.data.blocks.length && <EmptyState text={t("fleet.blocksEmpty")} />}
          {q.data.blocks.map((block) => <Fields key={String(block.id)}>
            <Text weight="medium">{date(block.start_at)} – {date(block.end_at)}</Text>
            {block.reason != null && <Text color="ink2">{String(block.reason)}</Text>}
            {can("fleet:write") && <Button label={t("common.remove")} variant="ghost" onPress={() => setRemove(block)} />}
          </Fields>)}
          {can("fleet:write") && (!form ? <Button label={t("fleet.blockDays")} onPress={() => { setFrom(""); setUntil(""); setReason(""); setForm(true); }} />
            : <>
              <DateField inline label={t("common.from")} value={from} min={today} onChange={setFrom} yearStepper={false} />
              <DateField inline label={t("fleet.untilIncl")} value={until} min={from || today} onChange={setUntil} yearStepper={false} />
              {!!from && !!until && until < from && <Text color="danger">{t("fleet.badRange")}</Text>}
              <LabelInput label={t("fleet.fReason")} hint={t("fleet.reasonHint")} value={reason} onChangeText={setReason} />
              <FormButtons label={t("fleet.blockThese")} valid={valid} error={add.error} busy={add.busy} close={() => setForm(false)} save={() => {
                if (!valid) return;
                void add.run(async () => {
                  await api(base, { method: "POST", body: {
                    startAt: new Date(`${from}T00:00:00+05:30`).toISOString(), endAt: new Date(`${until}T23:59:59+05:30`).toISOString(), reason: reason.trim() || undefined,
                  } });
                  setForm(false);
                });
              }} />
            </>)}
        </>}
        <ConfirmSheet open={!!remove} title={t("common.remove")} body={remove ? `${date(remove.start_at)} – ${date(remove.end_at)}` : ""}
          cancelLabel={t("common.cancel")} confirmLabel={t("common.remove")} danger busy={deletion.busy} error={deletion.error}
          onClose={() => setRemove(null)} onConfirm={() => {
            if (remove) void deletion.run(async () => { await api(`${base}/${remove.id}`, { method: "DELETE" }); setRemove(null); });
          }} />
      </Fields>
    </Card>
  </>;
}
