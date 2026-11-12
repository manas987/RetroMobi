import { CalendarClock, CheckCircle2, RotateCcw } from "lucide-react";
import type { Row } from "../../../lib/portal";
import { istDay } from "../../../lib/format";
import { nextAction, STAGE_TONE, type BookingStage, type Tone } from "../../../lib/bookingStage";
import { useT } from "../../../i18n";
import { renterName, vehicleLabel } from "../bookingActions";
import { useMerchantShop } from "../Layout";
import { Button, Chip, TONE } from "../ui/ui";
import { pickupIso, returnIso } from "./filters";

export interface RowActions {
  onOpen: (id: string) => void;
  onHandover: (b: Row) => void;
  onReturn: (b: Row) => void;
}

const DEPOSIT_TONE: Record<string, Tone> = { HELD: "info", RELEASED: "good", CLAIMED: "attention", PARTIALLY_DEDUCTED: "attention" };

export function renterPhone(b: Row): string | null {
  const p = b.source === "OFFLINE" ? b.walkin_phone : b.customer_phone;
  return p ? String(p) : null;
}

/** The next-step button for a booking (or nothing, if the role or stage has none). */
export function NextStep({ b, stage, onHandover, onReturn, className = "" }: { b: Row; stage: BookingStage } & Pick<RowActions, "onHandover" | "onReturn"> & { className?: string }) {
  const { t } = useT();
  const { can } = useMerchantShop();
  const act = nextAction(stage);
  if (act === "handover" && can("bookings:write"))
    return (
      <Button variant="primary" className={className} onClick={(e) => { e.stopPropagation(); onHandover(b); }}>
        {b.source === "OFFLINE" ? t("actions.handoverWalkin") : t("actions.handover")}
      </Button>
    );
  if (act === "return" && can("bookings:return"))
    return (
      <Button variant="dark" className={className} onClick={(e) => { e.stopPropagation(); onReturn(b); }}>
        {t("actions.markReturned")}
      </Button>
    );
  return null;
}

/**
 * One booking. Wide when the nearest `@container` ancestor is 2xl or more
 * (a grid row); otherwise a stacked card. The whole row opens the sheet.
 */
export function BookingRow({ b, stage, actions }: { b: Row; stage: BookingStage } & { actions: RowActions }) {
  const { t, date, time } = useT();
  const id = String(b.id);
  const tone = STAGE_TONE[stage];
  const finished = stage === "RETURNED" || stage === "DEPOSIT_CLAIMED";
  const Icon = finished ? CheckCircle2 : nextAction(stage) === "return" ? RotateCcw : CalendarClock;
  const phone = renterPhone(b);
  const p = pickupIso(b);
  const r = returnIso(b);
  const sameDay = istDay(new Date(p)) === istDay(new Date(r));
  const times = t("bookings.untilDay", {
    pickup: time(p),
    ret: sameDay ? time(r) : `${date(r, { weekday: "short", day: "numeric" })}, ${time(r)}`,
  });
  const deposit = b.source !== "OFFLINE" && b.deposit_status ? String(b.deposit_status) : null;
  const late = stage === "PICKUP_LATE" || stage === "OVERDUE";

  return (
    <li
      onClick={() => actions.onOpen(id)}
      className={`cursor-pointer rounded-2xl bg-surface shadow-card p-4 flex flex-col gap-1.5 transition hover:shadow-lg ${late ? "ring-1 ring-danger/40" : ""} @2xl:grid @2xl:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_auto_12rem] @2xl:items-center @2xl:gap-4`}
    >
      <span className={`hidden @2xl:inline-flex h-10 w-10 items-center justify-center rounded-xl ${TONE[tone].icon}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <button type="button" onClick={(e) => { e.stopPropagation(); actions.onOpen(id); }} className="min-w-0 truncate text-left font-semibold text-ink">
            {renterName(b)}
          </button>
          <span className="ml-auto @2xl:hidden"><Chip tone={tone}>{t(`status.stage_${stage}` as const)}</Chip></span>
        </div>
        {phone && (
          <a href={`tel:${phone}`} onClick={(e) => e.stopPropagation()} className="tnum text-sm text-ink-3 hover:text-ink">
            {phone}
          </a>
        )}
      </div>
      <p className="min-w-0 text-sm text-ink-2">{vehicleLabel(b)}</p>
      <p className="tnum text-sm text-ink-2">{times}</p>
      <div className="hidden @2xl:flex flex-wrap gap-1.5 justify-end">
        <Chip tone={tone}>{t(`status.stage_${stage}` as const)}</Chip>
        <Chip tone={b.source === "OFFLINE" ? "muted" : "info"}>{b.source === "OFFLINE" ? t("common.walkin") : t("common.online")}</Chip>
        {deposit && <DepositChip status={deposit} />}
      </div>
      <div className="mt-1 empty:hidden @2xl:mt-0">
        <NextStep b={b} stage={stage} onHandover={actions.onHandover} onReturn={actions.onReturn} className="w-full whitespace-nowrap" />
      </div>
    </li>
  );
}

export function DepositChip({ status }: { status: string }) {
  const { tMaybe } = useT();
  const label = tMaybe(`status.deposit_${status}`);
  return label ? <Chip tone={DEPOSIT_TONE[status] ?? "muted"}>{label}</Chip> : null;
}
