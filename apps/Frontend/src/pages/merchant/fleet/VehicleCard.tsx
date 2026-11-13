import { Link } from "wouter";
import { Bike, ChevronRight } from "lucide-react";
import type { Row } from "../../../lib/portal";
import { istDay, rupees } from "../../../lib/format";
import { useT } from "../../../i18n";
import { useMerchantShop } from "../Layout";
import { Toggle } from "../../../components/Toggle";
import { Button, Chip, ErrorNote, TONE } from "../ui/ui";
import { AVAIL_TONE, vehicleNow, type Staged } from "./vehicleNow";
import { STAGE_TONE, useListingActions, type SetupVehicle } from "./SetupBoard";

/** Today's times as "7:00 pm", anything later as "Sat 15". */
export function useWhen() {
  const { date, time } = useT();
  const today = istDay(new Date());
  return (iso: unknown) => (istDay(new Date(String(iso))) === today ? time(iso) : date(iso, { weekday: "short", day: "numeric" }));
}

/** The availability chip: free, going out, with a customer, or late. */
export function AvailChip({ id, staged }: { id: unknown; staged: Staged[] }) {
  const { t } = useT();
  const when = useWhen();
  const { avail, out, goes, late, missed } = vehicleNow(id, staged);
  if (late) return <Chip tone="bad">{t("fleet.avail_LATE")}</Chip>;
  if (missed) return <Chip tone="bad">{t("status.stage_PICKUP_LATE")}</Chip>;
  if (avail === "OUT") return <Chip tone="info">{t("fleet.avail_OUT", { when: when(out!.b.scheduled_return_at) })}</Chip>;
  if (avail === "TODAY") return <Chip tone="attention">{t("fleet.avail_TODAY", { when: when(goes!.b.scheduled_pickup_at) })}</Chip>;
  return <Chip tone="good">{t("fleet.avail_FREE")}</Chip>;
}

export function VehicleCard({
  v,
  sv,
  staged,
  onBook,
}: {
  v: Row;
  sv?: SetupVehicle;
  staged: Staged[];
  onBook: (vehicleId: string) => void;
}) {
  const { can } = useMerchantShop();
  const { t } = useT();
  const act = useListingActions();
  const id = String(v.id);
  const { avail, late, missed } = vehicleNow(id, staged);
  const write = can("fleet:write");
  const hasPrice = v.amount != null;
  const fixHref = `/merchant/setup?vehicle=${id}`;
  const stage = sv?.stage;

  const listing = () => {
    if (!sv || !stage) return null;
    if (!write) return <Chip tone={STAGE_TONE[stage]}>{t(`fleet.stage_${stage}` as const)}</Chip>;
    if (stage === "SHOWING" || stage === "READY") {
      const on = stage === "SHOWING";
      return (
        <div className="flex items-center gap-3">
          <Toggle checked={on} disabled={act.busy} onChange={(next) => act.setActive(id, next)} label={t("fleet.toggleLabel", { vehicle: String(v.registration_number) })} />
          <span className={`text-sm ${on ? "font-medium text-verified" : "text-ink-2"}`}>{t(on ? "fleet.listingOn" : "fleet.listingReady")}</span>
        </div>
      );
    }
    if (stage === "CHECKING") return <Chip tone="info">{t("fleet.stage_CHECKING")}</Chip>;
    if (stage === "NEEDS_FIXING") {
      return (
        <div className="flex items-center gap-3">
          <Chip tone="bad">{t("fleet.stage_NEEDS_FIXING")}</Chip>
          <Link href={fixHref} className="text-sm font-semibold text-ink underline underline-offset-2">{t("fleet.fixLink")}</Link>
        </div>
      );
    }
    const n = sv.missing.length;
    return (
      <p className="flex flex-wrap items-center gap-x-3 text-sm text-ink-3">
        {t(n === 1 ? "fleet.notOn_one" : "fleet.notOn_other", { n })}
        <Link href={fixHref} className="font-semibold text-ink underline underline-offset-2">{t("fleet.finishSetup")}</Link>
      </p>
    );
  };

  return (
    <div className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${TONE[late || missed ? "bad" : AVAIL_TONE[avail]].icon}`}>
          <Bike className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-ink">{String(v.make ?? "")} {String(v.model ?? "")}</p>
          <p className="tnum truncate text-sm text-ink-3">{String(v.registration_number ?? "")}</p>
        </div>
        <AvailChip id={id} staged={staged} />
      </div>

      {hasPrice ? (
        <p className="tnum text-sm text-ink-2">
          {t("common.perDay", { amount: rupees(Number(v.amount)) })} · {t("fleet.depositShort", { amount: rupees(Number(v.security_deposit_amount ?? 0)) })}
        </p>
      ) : (
        <p className="flex items-center gap-3 text-sm">
          <span className="font-semibold text-danger">{t("fleet.noPrice")}</span>
          <Link href={`/merchant/fleet/${id}?tab=price`} className="font-semibold text-ink underline underline-offset-2">{t("fleet.addPrice")}</Link>
        </p>
      )}

      {listing()}
      {act.error && <ErrorNote text={act.error} />}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        {avail === "FREE" && hasPrice && can("bookings:write") ? (
          <Button onClick={() => onBook(id)}>{t("fleet.book")}</Button>
        ) : <span />}
        <Link href={`/merchant/fleet/${id}`} className="inline-flex min-h-11 items-center gap-1 rounded-2xl px-3 text-sm font-semibold text-ink-2 hover:bg-surface-3 hover:text-ink">
          {t("fleet.manage")}
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
