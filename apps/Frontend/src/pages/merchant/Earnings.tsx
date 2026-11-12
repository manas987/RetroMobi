import { Clock, IndianRupee, Wallet } from "lucide-react";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { rupees } from "../../lib/format";
import { useT } from "../../i18n";
import { useMerchantQuery, useUrlParam } from "./query";
import { Card, ErrorNote, PageHeader, StatCard } from "./ui/ui";
import { PayoutAccountSection } from "./money/PayoutAccount";
import { PayoutList } from "./money/PayoutList";
import { RangeChips, rangeDates } from "./money/RangeChips";

const RANGES = ["month", "last", "3m"] as const;

interface Summary { money?: { paid: number; pending: number; walkinCash: number } }

function EarningsBody() {
  const { token, shopId, can } = useMerchantShop();
  const { t } = useT();
  const [range, setRange] = useUrlParam("range", RANGES, "month");
  const { from, to } = rangeDates(range);
  const q = useMerchantQuery<Summary>(shopId && can("payouts:read") ? `/shops/${shopId}/summary?from=${from}&to=${to}` : null, token);

  if (!can("payouts:read")) {
    return (
      <>
        <PageHeader title={t("money.earningsTitle")} />
        <Card><p className="text-base text-ink-2">{t("money.ownerOnly")}</p></Card>
      </>
    );
  }
  const m = q.data?.money;
  const failed = q.isError;
  return (
    <>
      <PageHeader title={t("money.earningsTitle")} subtitle={t("money.earningsSubtitle")} />
      <RangeChips options={RANGES} value={range} onChange={(k) => setRange(k === "month" ? null : k)} />
      {failed && <div className="mb-4"><ErrorNote onRetry={() => q.refetch()} /></div>}
      <div className="@container mb-5">
        <div className="grid gap-4 @md:grid-cols-3">
          <StatCard icon={IndianRupee} tone="good" label={t("money.paid")} value={m ? rupees(m.paid) : null} failed={failed} />
          <StatCard icon={Clock} tone="info" label={t("money.pending")} value={m ? rupees(m.pending) : null} caption={t("money.pendingCaption")} failed={failed} />
          <StatCard icon={Wallet} tone="muted" label={t("money.walkinCash")} value={m ? rupees(m.walkinCash) : null} caption={t("money.walkinCashCaption")} failed={failed} />
        </div>
      </div>
      <div className="mb-5"><PayoutAccountSection /></div>
      <Card title={t("money.payoutsTitle")} icon={IndianRupee}>
        <PayoutList from={from} to={to} />
      </Card>
    </>
  );
}

export function MerchantEarnings() {
  return <MerchantLayout><EarningsBody /></MerchantLayout>;
}
