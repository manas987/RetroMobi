import { useState } from "react";
import { Link } from "wouter";
import { CalendarCheck, Plus, Trash2 } from "lucide-react";
import { portalFetch, type Row } from "../../../../lib/portal";
import { STAGE_TONE } from "../../../../lib/bookingStage";
import { useT } from "../../../../i18n";
import { useMerchantShop } from "../../Layout";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "../../query";
import { renterName } from "../../bookingActions";
import { Button, Card, Chip, ErrorNote, Field, INPUT, LoadingRows, Sheet } from "../../ui/ui";
import { useStagedBookings } from "../vehicleNow";

export function CalendarTab({ id }: { id: string }) {
  const { token, can } = useMerchantShop();
  const { t, lang, date, time } = useT();
  const invalidate = useInvalidateMerchant();
  const q = useMerchantQuery<{ blocks: Row[] }>(`/vehicles/${id}/unavailability`, token);
  const { staged } = useStagedBookings();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const write = can("fleet:write");
  const mine = staged
    .filter((x) => x.b.vehicle_id === id)
    .sort((a, b) => String(a.b.scheduled_pickup_at).localeCompare(String(b.b.scheduled_pickup_at)));
  const blocks = q.data?.blocks ?? [];
  const day = (iso: unknown) => date(iso, { day: "numeric", month: "short" });

  async function remove(blockId: unknown) {
    setError(null);
    try {
      await portalFetch("merchant", `/vehicles/${id}/unavailability/${blockId}`, { method: "DELETE", token });
      await invalidate();
    } catch (err) {
      setError(errorText(lang, err));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={t("fleet.upcomingTitle")} icon={CalendarCheck}>
        {mine.length === 0 ? (
          <p className="text-sm text-ink-3">{t("fleet.noUpcoming")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {mine.map(({ b, stage }) => (
              <li key={String(b.id)}>
                <Link href={`/merchant/bookings?booking=${b.id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3 hover:bg-surface-3">
                  <span className="min-w-0 text-sm">
                    <span className="block truncate font-semibold text-ink">{renterName(b)}</span>
                    <span className="block text-ink-2">{day(b.scheduled_pickup_at)} {time(b.scheduled_pickup_at)} → {day(b.scheduled_return_at)} {time(b.scheduled_return_at)}</span>
                  </span>
                  <Chip tone={STAGE_TONE[stage]}>{t(`status.stage_${stage}` as const)}</Chip>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t("fleet.blocksTitle")} action={write ? <Button icon={Plus} onClick={() => setOpen(true)}>{t("fleet.blockDays")}</Button> : undefined}>
        <p className="mb-3 text-sm text-ink-3">{t("fleet.blocksHint")}</p>
        {error && <div className="mb-3"><ErrorNote text={error} /></div>}
        {q.isPending && <LoadingRows rows={1} />}
        {q.isError && <ErrorNote onRetry={() => q.refetch()} />}
        {q.data && blocks.length === 0 && <p className="text-sm text-ink-3">{t("fleet.blocksEmpty")}</p>}
        <ul className="flex flex-col gap-2">
          {blocks.map((b) => (
            <li key={String(b.id)} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
              <span className="min-w-0 text-sm">
                <span className="tnum block font-semibold text-ink">{day(b.start_at)} – {date(b.end_at, { day: "numeric", month: "short", year: "numeric" })}</span>
                {b.reason != null && <span className="block truncate text-ink-3">{String(b.reason)}</span>}
              </span>
              {write && (
                <button type="button" onClick={() => remove(b.id)} aria-label={t("common.remove")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-danger hover:bg-danger-soft">
                  <Trash2 className="h-5 w-5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
        <Sheet open={open} onClose={() => setOpen(false)} title={t("fleet.blockDays")}>
          {open && <BlockForm id={id} onDone={() => setOpen(false)} />}
        </Sheet>
      </Card>
    </div>
  );
}

function BlockForm({ id, onDone }: { id: string; onDone: () => void }) {
  const { token } = useMerchantShop();
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const badRange = from !== "" && until !== "" && until < from;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      // Whole days, inclusive of the last one, in shop time.
      await portalFetch("merchant", `/vehicles/${id}/unavailability`, {
        method: "POST",
        token,
        body: { startAt: new Date(`${from}T00:00:00+05:30`).toISOString(), endAt: new Date(`${until}T23:59:59+05:30`).toISOString(), reason: reason.trim() || undefined },
      });
      await invalidate();
      onDone();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <div className="mb-4"><ErrorNote text={error} /></div>}
      <Field label={t("common.from")}><input className={INPUT} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      <Field label={t("fleet.untilIncl")} error={badRange ? t("fleet.badRange") : undefined}><input className={INPUT} type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></Field>
      <Field label={`${t("fleet.fReason")} (${t("common.optional")})`} hint={t("fleet.reasonHint")}><input className={INPUT} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <Button variant="primary" size="lg" className="w-full" disabled={busy || !from || !until || badRange} onClick={save}>{busy ? t("common.saving") : t("fleet.blockThese")}</Button>
    </div>
  );
}
