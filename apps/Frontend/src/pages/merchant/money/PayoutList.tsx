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
            return (
              <li key={String(p.id)} className="rounded-2xl bg-surface-2 p-3 @2xl:grid @2xl:grid-cols-[6rem_8rem_1fr_8rem_9rem] @2xl:items-center @2xl:gap-3">
                <span className="text-sm text-ink-2">{date(p.created_at)}</span>
                {p.booking_id ? (
                  <Link href={`/merchant/bookings?booking=${p.booking_id}`} className="tnum text-sm font-medium text-ink underline underline-offset-2">
                    #{String(p.booking_id).slice(0, 8).toUpperCase()}
                  </Link>
                ) : <span />}
                <span className="text-sm text-ink">{STAGE[String(p.stage)] ? t(STAGE[String(p.stage)]!) : ""}</span>
                <span className="tnum text-base font-semibold text-ink @2xl:text-right">{rupees(Number(p.amount))}</span>
                <span className="mt-1 inline-block @2xl:mt-0 @2xl:justify-self-end">
                  {p.status === "PAID" ? <Chip tone="good">{t("money.paidOn", { date: date(p.paid_at) })}</Chip>
                    : p.status === "FAILED" ? <Chip tone="bad">{t("money.problem")}</Chip>
                    : <Chip tone="info">{t("money.onTheWay")}</Chip>}
                </span>
                {p.status === "FAILED" && (
                  <p className="mt-1 text-xs text-danger @2xl:col-span-5">{t(failedBank ? "money.failedBank" : "money.failedRetry")}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
