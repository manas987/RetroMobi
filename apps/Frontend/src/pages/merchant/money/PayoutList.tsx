import { Link } from "wouter";
import { Hourglass } from "lucide-react";
import type { Row } from "../../../lib/portal";
import { rupees } from "../../../lib/format";
import { useT, type TKey } from "../../../i18n";
import { useMerchantShop } from "../Layout";
import { useMerchantQuery, useUrlParam } from "../query";
import { Chip, EmptyState, ErrorNote, LoadingRows, Tabs } from "../ui/ui";

const STATUS = ["all", "PENDING", "PAID", "FAILED"] as const;
const STAGE: Record<string, TKey> = {
  UPFRONT: "money.stageUPFRONT",
  BALANCE: "money.stageBALANCE",
  CANCELLATION: "money.stageCANCELLATION",
};

export function PayoutList({ from, to }: { from: string; to: string }) {
  const { token, shopId } = useMerchantShop();
  const { t, date } = useT();
  const [status, setStatus] = useUrlParam("status", STATUS, "all");

  const qs = new URLSearchParams({
    from: new Date(`${from}T00:00:00+05:30`).toISOString(),
    to: new Date(`${to}T23:59:59+05:30`).toISOString(),
  });
  if (status !== "all") qs.set("status", status);
  const q = useMerchantQuery<{ payouts: Row[] }>(shopId ? `/shops/${shopId}/payouts?${qs}` : null, token);
  const rows = q.data?.payouts ?? [];

  const tabs = STATUS.map((s) => ({
    key: s,
    label: t(s === "all" ? "common.all" : (`money.tab${s}` as TKey)),
  }));

  return (
    <div className="@container">
      <Tabs tabs={tabs} value={status} onChange={(k) => setStatus(k === "all" ? null : k)} />
      {q.isPending ? <LoadingRows /> : q.isError ? <ErrorNote onRetry={() => q.refetch()} /> : rows.length === 0 ? (
        <EmptyState icon={Hourglass} text={t("money.payoutsEmpty")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((p) => {
            const failedBank = /beneficiar|account/i.test(String(p.last_error ?? ""));
            const code = p.booking_id ? (
              <Link href={`/merchant/bookings?booking=${p.booking_id}`} className="tnum font-medium text-ink underline underline-offset-2">
                #{String(p.booking_id).slice(0, 8).toUpperCase()}
              </Link>
            ) : null;
            const stage = STAGE[String(p.stage)] ? t(STAGE[String(p.stage)]!) : "";
            const amount = <span className="tnum text-base font-semibold text-ink">{rupees(Number(p.amount))}</span>;
            const chip =
              p.status === "PAID" ? <Chip tone="good">{p.paid_at ? t("money.paidOn", { date: date(p.paid_at) }) : t("money.tabPAID")}</Chip>
              : p.status === "FAILED" ? <Chip tone="bad">{t("money.problem")}</Chip>
              : <Chip tone="info">{t("money.onTheWay")}</Chip>;
            return (
              <li key={String(p.id)} className="rounded-2xl bg-surface-2 p-3">
                {/* Phone: what it was and when on the left, amount and status on the right. */}
                <div className="flex items-start justify-between gap-3 @2xl:hidden">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{stage}</p>
                    <p className="mt-0.5 text-xs text-ink-3">{date(p.created_at)}{code && <> · {code}</>}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">{amount}{chip}</div>
                </div>
                <div className="hidden @2xl:grid @2xl:grid-cols-[6rem_8rem_1fr_8rem_9rem] @2xl:items-center @2xl:gap-3">
                  <span className="text-sm text-ink-2">{date(p.created_at)}</span>
                  <span className="text-sm">{code}</span>
                  <span className="text-sm text-ink">{stage}</span>
                  <span className="text-right">{amount}</span>
                  <span className="justify-self-end">{chip}</span>
                </div>
                {p.status === "FAILED" && <p className="mt-1 text-xs text-danger">{t(failedBank ? "money.failedBank" : "money.failedRetry")}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
