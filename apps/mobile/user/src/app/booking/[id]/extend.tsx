import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { Button, DateField, ErrorNote, LoadingRows, SelectField, Text, api, dateTimeLabel, errorMessage, formatIstTime, istBookingTime, istDay,
  rupees, splitIstBookingTime, type Row } from "@retromobi/mobile-shared";
import { Card, EmptyState } from "../../../features/RiderSurface";
import { BookingPage } from "../../../features/bookings/BookingPage";
import { isPast } from "../../../features/bookings/bookings";
import { openPayment, checkPayment } from "../../../features/checkout/cashfree";
import type { PaymentIntent } from "../../../features/checkout/payment";
import { refreshRiderData, usePrivate, useWrite } from "../../../state/private";

export default function Extend() {
  return <BookingPage title="Extend this ride">{(row) => row.status === "CONFIRMED" && row.actual_pickup_at && !isPast(row)
    ? <Extension row={row} /> : <EmptyState title="This booking cannot be extended" />}</BookingPage>;
}

type Quote = PaymentIntent & { extensionId: string; additionalAmount: number };
const clockTimes = Array.from({ length: 48 }, (_, i) => `${String(i >> 1).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

function Extension({ row }: { row: Row }) {
  const path = `/bookings/${encodeURIComponent(String(row.id))}/extension`;
  const q = usePrivate<Row | null>(path);
  const existing = q.data;
  const [earliest] = useState(() => Math.max(Date.now(), Date.parse(String(row.scheduled_return_at))));
  const [initial] = useState(() => splitIstBookingTime(new Date(earliest + 86_400_000).toISOString()));
  const [day, setDay] = useState(initial.day);
  const [time, setTime] = useState(initial.time);
  const [quote, setQuote] = useState<Quote>();
  const [launchedId, setLaunchedId] = useState<string>();
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState("");
  const mounted = useRef(true);
  const polling = useRef(false);
  const w = useWrite();
  const returnAt = istBookingTime(day, time);
  const pending = existing?.status === "PENDING" ? existing : null;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // 'payment' can reconcile an order without opening the provider again.
  async function reconcile(id: string) {
    await api(`${path}/${encodeURIComponent(id)}/payment`, { method: "POST" });
    const result = await q.refetch({ throwOnError: true, cancelRefetch: false });
    if (result.data?.status !== "PENDING") await refreshRiderData("/bookings");
    return result.data;
  }

  function returned(id: string) {
    if (!mounted.current || polling.current) return;
    polling.current = true; setChecking(true);
    void checkPayment(() => reconcile(id), (result) => result?.status !== "PENDING", () => mounted.current)
      .catch((err) => { if (mounted.current) setNotice(errorMessage(err)); })
      .finally(() => { polling.current = false; if (mounted.current) setChecking(false); });
  }

  const refresh = q.refetch;
  useEffect(() => {
    if (!launchedId) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh({ cancelRefetch: false });
    });
    return () => sub.remove();
  }, [launchedId, refresh]);

  return <>
    <Text>Current return · {dateTimeLabel(row.scheduled_return_at)}</Text>
    <Text>Keep your current return time until the extension is approved.</Text>
    {q.isPending ? <LoadingRows label="Checking for an extension" /> : q.isError ? <ErrorNote text={errorMessage(q.error)} onRetry={() => void q.refetch()} /> : <>
      {existing && <Card title={pending ? "Extension awaiting payment" : existing.status === "APPROVED" ? "Extension approved" : "Extension not applied"}>
        <Text>{dateTimeLabel(existing.new_return_at)} · {rupees(Number(existing.payable_amount ?? existing.additional_amount ?? 0))}</Text>
        {pending && <Text>If the extra time becomes unavailable after payment, you’ll receive a full refund.</Text>}
      </Card>}
      {pending ? <>
        {quote && quote.extensionId === pending.id && launchedId !== quote.extensionId
          ? <Button label="Continue to payment" variant="primary" busy={w.busy} onPress={() => void w.run(async () => {
            setNotice(""); setLaunchedId(quote.extensionId);
            try { await openPayment(quote, () => returned(quote.extensionId)); }
            catch (err) { setLaunchedId(undefined); throw err; }
          })} />
          // shortcut: old sessions lack an order ID; enable native payment resume when the endpoint supplies it.
          : <Text>To reopen an unfinished payment, use the RetroMobi website. If you’ve already paid, check the status here.</Text>}
        <Button label="Check extension status" busy={w.busy || checking} onPress={() => void w.run(async () => { setNotice(""); await reconcile(String(pending.id)); })} />
      </> : <>
        <DateField label="New return date" value={day} onChange={setDay} min={istDay(new Date(earliest))} />
        <SelectField label="New return time" value={time} onChange={setTime}
          options={[...new Set([...clockTimes, time])].sort().map((value) => ({ value, label: formatIstTime(istBookingTime(day, value)) }))} />
        <Button label="Check availability and price" variant="primary" busy={w.busy}
          disabled={Date.parse(returnAt) <= Date.parse(String(row.scheduled_return_at))} onPress={() => void w.run(async () => {
            if (Date.parse(returnAt) <= Date.now()) throw new Error("Choose a later return time.");
            const result = await api<Quote>(path, { method: "POST", body: { newReturnAt: returnAt } });
            if (!result?.extensionId || !result.orderId || !result.paymentSessionId) throw new Error("Couldn't read the extension price. Check its status before trying again.");
            setQuote(result);
            await q.refetch({ throwOnError: true });
          }, (err) => err instanceof Error ? err.message : "Couldn’t prepare this extension.")} />
      </>}
    </>}
    {(w.error || notice) && <ErrorNote text={w.error || notice} />}
  </>;
}
