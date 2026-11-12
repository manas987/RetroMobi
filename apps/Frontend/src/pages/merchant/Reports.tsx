import { BarChart3, CalendarCheck, IndianRupee, Bike } from "lucide-react";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { rupees } from "../../lib/format";
import { useT, type TKey } from "../../i18n";
import { useMerchantQuery, useUrlParam } from "./query";
import { BarChart, Card, EmptyState, ErrorNote, LoadingRows, PageHeader, StatCard, Tabs } from "./ui/ui";
import { RangeChips, rangeDates } from "./money/RangeChips";
import { UtilisationList, type Util } from "./money/UtilisationList";

const RANGES = ["7d", "30d", "month", "last"] as const;
const TABS = ["money", "bookings", "vehicles"] as const;

interface Summary {
  days: { date: string; online: number; walkin: number; onlineEarnings?: number; walkinCash?: number }[];
  totals: { online: number; walkin: number };
  vehicles: Util[];
  rangeDays: number;
  money?: { paid: number; pending: number; walkinCash: number };
}

function ReportsBody() {
  const { token, shopId, can } = useMerchantShop();
  const { t } = useT();
  const [range, setRange] = useUrlParam("range", RANGES, "30d");
  const [tab, setTab] = useUrlParam("tab", TABS, "money");
  const { from, to } = rangeDates(range);
  const allowed = can("payouts:read");
  const q = useMerchantQuery<Summary>(shopId && allowed ? `/shops/${shopId}/summary?from=${from}&to=${to}` : null, token);

  if (!allowed) {
    return (
      <>
        <PageHeader title={t("money.reportsTitle")} />
        <Card><p className="text-base text-ink-2">{t("money.ownerOnly")}</p></Card>
      </>
    );
  }

  const s = q.data;
  const label = (d: string) => String(Number(d.slice(8)));
  const empty = s && s.totals.online + s.totals.walkin === 0 && s.days.every((d) => !d.onlineEarnings && !d.walkinCash);
  const onlineMoney = s?.days.reduce((a, d) => a + (d.onlineEarnings ?? 0), 0) ?? 0;
  const cash = s?.days.reduce((a, d) => a + (d.walkinCash ?? 0), 0) ?? 0;
  const tabs = TABS.map((k) => ({ key: k, label: t(`money.tab_${k}` as TKey) }));

  return (
    <>
      <PageHeader title={t("money.reportsTitle")} subtitle={t("money.reportsSubtitle")} />
      <RangeChips options={RANGES} value={range} onChange={(k) => setRange(k === "30d" ? null : k)} />
      <Tabs tabs={tabs} value={tab} onChange={(k) => setTab(k === "money" ? null : k)} />
      {q.isPending ? <LoadingRows /> : q.isError ? <ErrorNote onRetry={() => q.refetch()} /> : s && (
        <Card className="@container">
          {empty ? (
            <EmptyState icon={BarChart3} text={t("money.reportsEmpty")} />
          ) : tab === "money" ? (
            <>
              <div className="grid gap-4 @md:grid-cols-2 mb-5">
                <StatCard icon={IndianRupee} tone="info" label={t("money.fromOnline")} value={rupees(onlineMoney)} />
                <StatCard icon={IndianRupee} tone="muted" label={t("money.walkinCash")} value={rupees(cash)} />
              </div>
              <BarChart
                data={s.days.map((d) => ({ label: label(d.date), values: [d.onlineEarnings ?? 0, d.walkinCash ?? 0] }))}
                series={[t("money.fromOnline"), t("money.walkinCash")]}
                format={rupees}
                tableLabel={t("money.showNumbers")}
              />
              <p className="mt-4 text-xs text-ink-3">{t("money.moneyCaption")}</p>
            </>
          ) : tab === "bookings" ? (
            <>
              <div className="grid gap-4 @md:grid-cols-2 mb-5">
                <StatCard icon={CalendarCheck} tone="info" label={t("money.onlineBookings")} value={s.totals.online} />
                <StatCard icon={CalendarCheck} tone="muted" label={t("money.walkins")} value={s.totals.walkin} />
              </div>
              <BarChart
                data={s.days.map((d) => ({ label: label(d.date), values: [d.online, d.walkin] }))}
                series={[t("money.onlineBookings"), t("money.walkins")]}
                tableLabel={t("money.showNumbers")}
              />
              <p className="mt-4 text-xs text-ink-3">{t("money.bookingsCaption")}</p>
            </>
          ) : s.vehicles.length === 0 ? (
            <EmptyState icon={Bike} text={t("money.reportsEmpty")} />
          ) : (
            <UtilisationList vehicles={s.vehicles} rangeDays={s.rangeDays} />
          )}
        </Card>
      )}
    </>
  );
}

export function MerchantReports() {
  return <MerchantLayout><ReportsBody /></MerchantLayout>;
}
