import { useState } from "react";
import { Bike, CalendarCheck, CalendarClock, CheckCircle2, Plus, Search } from "lucide-react";
import type { Row } from "../../../lib/portal";
import { istDay } from "../../../lib/format";
import { useT } from "../../../i18n";
import { useMerchantShop } from "../Layout";
import { useMerchantQuery, useUrlParam } from "../query";
import { Button, Card, EmptyState, ErrorNote, LoadingRows, Tabs, TONE, DayHeading } from "../ui/ui";
import { BookingRow, type RowActions } from "./BookingRow";
import { groupByDay, hasFilters, pickupIso, returnIso, rowsForTab, TAB_KEYS, withFilters, type Filters, type Tab } from "./filters";

const DAY_MS = 86_400_000;
const GROUP_BY_RETURN: Tab[] = ["onride", "late", "finished"];

export function BookingList({ filters, actions, onNewWalkin, onClear }: {
  filters: Filters;
  actions: RowActions;
  onNewWalkin: () => void;
  onClear: () => void;
}) {
  const { token, shopId, can } = useMerchantShop();
  const { t } = useT();
  const [tab, setTab] = useUrlParam("tab", TAB_KEYS, "today");
  const [steps, setSteps] = useState(1);

  // With no filters the active path is the one Home uses, so it is already cached.
  const active = useMerchantQuery<{ bookings: Row[] }>(
    `/shops/${shopId}/bookings?${withFilters(new URLSearchParams({ status: "CONFIRMED" }), filters)}`,
    token,
    { refetchInterval: 30_000 },
  );
  // A day-aligned `from`, so the query key stays put between renders.
  const from = new Date(`${istDay(new Date(Date.now() - 90 * steps * DAY_MS))}T00:00:00+05:30`).toISOString();
  const finished = useMerchantQuery<{ bookings: Row[] }>(
    `/shops/${shopId}/bookings?${withFilters(new URLSearchParams({ status: "COMPLETED", from }), filters)}`,
    token,
  );

  const now = new Date();
  const seen = new Set<string>();
  const rows = [...(active.data?.bookings ?? []), ...(finished.data?.bookings ?? [])].filter((b) => {
    const id = String(b.id);
    return !seen.has(id) && seen.add(id);
  });
  const count = (k: Tab) => rowsForTab(rows, k, now).length;
  const items = rowsForTab(rows, tab, now);

  const labels: Record<Tab, string> = {
    today: t("bookings.tabToday"), upcoming: t("bookings.tabUpcoming"), onride: t("bookings.tabOnride"),
    late: t("bookings.tabLate"), finished: t("bookings.tabFinished"), all: t("bookings.tabAll"),
  };
  const needsFinished = tab === "finished" || tab === "all";
  const pending = active.isPending || (needsFinished && finished.isPending);
  const failed = active.isError || (needsFinished && finished.isError);
  const days = groupByDay(items, (x) => (GROUP_BY_RETURN.includes(tab) ? returnIso(x.b) : pickupIso(x.b)));

  return (
    <div>
      <Tabs tabs={TAB_KEYS.map((k) => ({ key: k, label: labels[k], count: pending ? undefined : count(k) }))} value={tab} onChange={setTab} />
      {pending ? (
        <LoadingRows />
      ) : failed ? (
        <ErrorNote onRetry={() => { active.refetch(); finished.refetch(); }} />
      ) : items.length === 0 ? (
        <Card>
          {hasFilters(filters) ? (
            <EmptyState icon={Search} text={t("bookings.emptyFiltered")} action={<Button onClick={onClear}>{t("bookings.clear")}</Button>} />
          ) : tab === "today" ? (
            <EmptyState icon={CalendarCheck} text={t("bookings.emptyToday")} action={<Button onClick={() => setTab("upcoming")}>{t("bookings.seeUpcoming")}</Button>} />
          ) : tab === "upcoming" || tab === "all" ? (
            <EmptyState icon={CalendarClock} text={t(tab === "all" ? "bookings.emptyAll" : "bookings.emptyUpcoming")}
              action={can("bookings:write") ? <Button variant="primary" icon={Plus} onClick={onNewWalkin}>{t("bookings.newWalkin")}</Button> : undefined} />
          ) : tab === "onride" ? (
            <EmptyState icon={Bike} text={t("bookings.emptyOnride")} />
          ) : tab === "late" ? (
            <div className="flex flex-col items-center text-center gap-3 py-8 px-4">
              <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${TONE.good.icon}`}><CheckCircle2 className="h-6 w-6" aria-hidden /></span>
              <p className="text-sm text-ink-2 max-w-xs">{t("bookings.emptyLate")}</p>
            </div>
          ) : (
            <EmptyState icon={CalendarCheck} text={t("bookings.emptyFinished")} />
          )}
        </Card>
      ) : (
        days.map((g) => (
          <section key={g.day} className="mt-5 first:mt-0">
            <DayHeading day={g.day} />
            <ul className="@container flex flex-col gap-3">
              {g.rows.map(({ b, stage }) => <BookingRow key={String(b.id)} b={b} stage={stage} actions={actions} />)}
            </ul>
          </section>
        ))
      )}
      {needsFinished && finished.isSuccess && (
        <div className="mt-5 flex justify-center">
          <Button variant="ghost" onClick={() => setSteps((s) => s + 1)}>{t("common.showOlder")}</Button>
        </div>
      )}
    </div>
  );
}
