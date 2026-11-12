import type { ReactNode } from "react";
import { Link } from "wouter";
import type { Row } from "../../../lib/portal";
import { rupees } from "../../../lib/format";
import { bookingStage, STAGE_TONE } from "../../../lib/bookingStage";
import { useT } from "../../../i18n";
import { renterName, vehicleLabel } from "../bookingActions";
import { useMerchantShop } from "../Layout";
import { useMerchantQuery } from "../query";
import { Chip, ErrorNote, LoadingRows, Sheet } from "../ui/ui";
import { DepositChip, NextStep, renterPhone, type RowActions } from "./BookingRow";

function Block({ children }: { children: ReactNode }) {
  return <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-2xl bg-surface-2 p-4 text-sm">{children}</dl>;
}
const Item = ({ label, children }: { label: string; children: ReactNode }) => (
  <>
    <dt className="text-ink-3">{label}</dt>
    <dd className="text-right font-medium text-ink min-w-0 break-words">{children}</dd>
  </>
);

/** One booking in full, opened by `?booking=<id>`. */
export function BookingSheet({ id, onClose, actions }: { id: string | null; onClose: () => void; actions: Pick<RowActions, "onHandover" | "onReturn"> }) {
  const { token, shopId } = useMerchantShop();
  const { t, date, time } = useT();
  const q = useMerchantQuery<Row>(id ? `/shops/${shopId}/bookings/${id}` : null, token);
  const b = q.data;
  const stage = b ? bookingStage(b) : null;
  const at = (v: unknown) => (v ? `${date(v, { weekday: "short", day: "numeric", month: "short" })}, ${time(v)}` : "—");
  const phone = b ? renterPhone(b) : null;
  const walkin = b?.source === "OFFLINE";

  return (
    <Sheet open={id != null} onClose={onClose} title={b ? renterName(b) : t("bookings.sheetTitle")}>
      {q.isPending ? <LoadingRows /> : q.isError ? <ErrorNote onRetry={() => q.refetch()} /> : b && stage && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Chip tone={STAGE_TONE[stage]}>{t(`status.stage_${stage}` as const)}</Chip>
            <Chip tone={walkin ? "muted" : "info"}>{walkin ? t("common.walkin") : t("common.online")}</Chip>
            <span className="tnum text-sm text-ink-3">{t("bookings.code", { code: String(b.id).slice(0, 8).toUpperCase() })}</span>
          </div>

          <Block>
            <Item label={t("actions.customer")}>{renterName(b)}</Item>
            {phone && <Item label={t("actions.phone")}><a href={`tel:${phone}`} className="tnum underline underline-offset-2">{phone}</a></Item>}
            {b.walkin_dl_number != null && <Item label={t("actions.licenceNumber")}><span className="tnum">{String(b.walkin_dl_number)}</span></Item>}
            <Item label={t("actions.vehicle")}>
              <Link href={`/merchant/fleet/${String(b.vehicle_id)}`} className="underline underline-offset-2">{vehicleLabel(b)}</Link>
            </Item>
          </Block>

          <Block>
            <Item label={t("bookings.plannedPickup")}>{at(b.scheduled_pickup_at)}</Item>
            {b.actual_pickup_at != null && <Item label={t("bookings.pickedUpAt")}>{at(b.actual_pickup_at)}</Item>}
            <Item label={t("bookings.plannedReturn")}>{at(b.scheduled_return_at)}</Item>
            {b.actual_return_at != null && <Item label={t("bookings.returnedAt")}>{at(b.actual_return_at)}</Item>}
          </Block>

          <Block>
            <Item label={t("actions.rent")}><span className="tnum">{rupees(Number(b.rental_amount ?? 0))}</span></Item>
            {b.deposit_amount != null && (
              <Item label={t("actions.deposit")}>
                <span className="inline-flex flex-wrap items-center justify-end gap-2">
                  <span className="tnum">{rupees(Number(b.deposit_amount))}</span>
                  {!walkin && b.deposit_status != null && <DepositChip status={String(b.deposit_status)} />}
                </span>
              </Item>
            )}
          </Block>
          {walkin && <p className="mb-3 text-sm text-ink-3">{t("bookings.cashNote")}</p>}

          <div className="mt-5 flex flex-col gap-2 empty:hidden">
            <NextStep b={b} stage={stage} className="w-full"
              onHandover={(x) => { onClose(); actions.onHandover(x); }}
              onReturn={(x) => { onClose(); actions.onReturn(x); }} />
          </div>
          <p className="mt-4 text-center">
            <Link href={`/merchant/support?booking=${String(b.id)}`} className="text-sm font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
              {t("bookings.help")}
            </Link>
          </p>
        </>
      )}
    </Sheet>
  );
}
