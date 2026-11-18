import { IndianRupee, Wallet } from "lucide-react";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { rupees } from "../../lib/format";
import { useT } from "../../i18n";
import { useMerchantQuery, useUrlParam } from "./query";
import { Card, ErrorNote, PageHeader, StatCard } from "./ui/ui";
import { PayoutAccountSection } from "./money/PayoutAccount";
import { RangeChips, rangeDates } from "./money/RangeChips";
import { CreditList, WithdrawCard, WithdrawalHistory, useWallet } from "./money/Wallet";

const RANGES = ["month", "last", "3m"] as const;

interface Summary { money?: { paid: number; pending: number; walkinCash: number } }

function EarningsBody() {
  const { token, shopId, can } = useMerchantShop();
  const { t } = useT();
  const [range, setRange] = useUrlParam("range", RANGES, "month");
  const { from, to } = rangeDates(range);
  const q = useMerchantQuery<Summary>(shopId && can("payouts:read") ? `/shops/${shopId}/summary?from=${from}&to=${to}` : null, token);
  const wallet = useWallet();

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
          {/* `paid` is everything credited to the wallet for the period (reportsService). */}
          <StatCard icon={IndianRupee} tone="good" label={t("wallet.earned")} value={m ? rupees(m.paid) : null} caption={t("wallet.earnedCaption")} failed={failed} />
          <StatCard icon={Wallet} tone="info" label={t("wallet.available")} value={wallet.data ? rupees(wallet.data.available) : null} failed={wallet.isError} />
          <StatCard icon={Wallet} tone="muted" label={t("money.walkinCash")} value={m ? rupees(m.walkinCash) : null} caption={t("money.walkinCashCaption")} failed={failed} />
        </div>
      </div>
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <WithdrawCard />
        <PayoutAccountSection />
      </div>
      <div className="mb-5"><WithdrawalHistory /></div>
      <CreditList />
    </>
  );
}

export function MerchantEarnings() {
  return <MerchantLayout><EarningsBody /></MerchantLayout>;
}
