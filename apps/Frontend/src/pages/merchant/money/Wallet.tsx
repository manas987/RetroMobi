import { useState } from "react";
import { Link } from "wouter";
import { ArrowDownToLine, Hourglass, ReceiptText } from "lucide-react";
import { useMerchantShop } from "../Layout";
import { portalFetch, type Row } from "../../../lib/portal";
import { rupees } from "../../../lib/format";
import { useT, type TKey } from "../../../i18n";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "../query";
import type { Tone } from "../../../lib/bookingStage";
import { Button, Card, Chip, EmptyState, ErrorNote, Field, INPUT, LoadingRows } from "../ui/ui";

/** GET /shops/:shopId/wallet (lib/wallet.ts getWallet). Amounts are paise. */
export interface WalletData {
  credited: number;
  paidOut: number;
  inFlight: number;
  available: number;
  minWithdrawal: number;
  credits: Row[];
  withdrawals: Row[];
  adjustments: Row[];
}

export function useWallet() {
  const { token, shopId, can } = useMerchantShop();
  return useMerchantQuery<WalletData>(shopId && can("payouts:read") ? `/shops/${shopId}/wallet` : null, token);
}

const STATUS_TONE: Record<string, Tone> = {
  REQUESTED: "info",
  PROCESSING: "info",
  PAID: "good",
  REJECTED: "bad",
  FAILED: "bad",
};

const STAGE: Record<string, TKey> = {
  UPFRONT: "money.stageUPFRONT",
  BALANCE: "money.stageBALANCE",
  CANCELLATION: "money.stageCANCELLATION",
};

export function WithdrawCard() {
  const { token, shopId, can } = useMerchantShop();
  const { t, lang } = useT();
  const q = useWallet();
  const invalidate = useInvalidateMerchant();
  const [amount, setAmount] = useState("");
  const [payTo, setPayTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const w = q.data;
  const paise = Math.round(Number(amount) * 100);
  const problem = !w || !amount ? null
    : paise < w.minWithdrawal ? t("wallet.belowMin", { min: rupees(w.minWithdrawal) })
    : paise > w.available ? t("wallet.overBalance")
    : null;

  async function submit() {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await portalFetch("merchant", `/shops/${shopId}/wallet/withdrawals`, {
        method: "POST",
        token,
        body: { amount: paise, ...(payTo.trim() ? { payTo: payTo.trim() } : {}) },
      });
      setAmount("");
      setPayTo("");
      setDone(true);
      await invalidate();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t("wallet.withdrawTitle")} icon={ArrowDownToLine}>
      {q.isPending ? <LoadingRows rows={1} /> : q.isError ? <ErrorNote onRetry={() => q.refetch()} /> : (
        <>
          <p className="tnum text-3xl font-semibold text-ink">{rupees(w!.available)}</p>
          <p className="mb-4 text-sm text-ink-3">
            {t("wallet.availableCaption", { min: rupees(w!.minWithdrawal) })}
            {w!.inFlight > 0 && <> · {t("wallet.inFlight", { amount: rupees(w!.inFlight) })}</>}
          </p>
          {can("payouts:write") && (
            <>
              <Field label={t("wallet.amountLabel")} error={problem ?? error ?? undefined}>
                <input className={INPUT} inputMode="decimal" value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
              </Field>
              <Field label={t("wallet.payToLabel")} hint={t("wallet.payToHint")}>
                <input className={INPUT} value={payTo} maxLength={200} onChange={(e) => setPayTo(e.target.value)} />
              </Field>
              <Button variant="primary" disabled={busy || !amount || !!problem} onClick={submit}>
                {t("wallet.request")}
              </Button>
              {done && <p className="mt-3 text-sm text-ink-2" role="status">{t("wallet.requested")}</p>}
            </>
          )}
        </>
      )}
    </Card>
  );
}

export function WithdrawalHistory() {
  const { t, date } = useT();
  const q = useWallet();
  const rows = q.data?.withdrawals ?? [];
  return (
    <Card title={t("wallet.historyTitle")} icon={Hourglass}>
      {q.isPending ? <LoadingRows /> : q.isError ? <ErrorNote onRetry={() => q.refetch()} /> : rows.length === 0 ? (
        <EmptyState icon={Hourglass} text={t("wallet.historyEmpty")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((w) => (
            <li key={String(w.id)} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-surface-2 p-3">
              <span className="text-sm text-ink-2">{date(w.created_at)}</span>
              <span className="tnum text-base font-semibold text-ink">{rupees(Number(w.amount))}</span>
              <Chip tone={STATUS_TONE[String(w.status)] ?? "muted"}>{t(`wallet.status_${String(w.status)}` as TKey)}</Chip>
              {!!w.method && <span className="text-sm text-ink-2">{t(`wallet.method_${String(w.method)}` as TKey)}</span>}
              {!!w.reference && <span className="text-sm text-ink-3">{t("wallet.reference", { ref: String(w.reference) })}</span>}
              {w.status === "REJECTED" && !!w.note && <p className="w-full text-xs text-danger">{String(w.note)}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function CreditList() {
  const { t, date } = useT();
  const q = useWallet();
  const rows = q.data?.credits ?? [];
  const adjustments = q.data?.adjustments ?? [];
  return (
    <Card title={t("wallet.creditsTitle")} icon={ReceiptText}>
      {adjustments.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2">
          {adjustments.map((a) => (
            <li key={String(a.id)} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-surface-2 p-3">
              <span className="text-sm text-ink-2">{date(a.created_at)}</span>
              <span className="text-sm text-ink">{t("wallet.adjustment", { reason: String(a.reason) })}</span>
              <span className="tnum ml-auto text-base font-semibold text-ink">
                {Number(a.amount) > 0 ? "+" : "−"}{rupees(Math.abs(Number(a.amount)))}
              </span>
            </li>
          ))}
        </ul>
      )}
      {q.isPending ? <LoadingRows /> : q.isError ? <ErrorNote onRetry={() => q.refetch()} /> : rows.length === 0 ? (
        <EmptyState icon={ReceiptText} text={t("wallet.creditsEmpty")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((c) => (
            <li key={String(c.id)} className="rounded-2xl bg-surface-2 p-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-sm text-ink-2">{date(c.created_at)}</span>
                <Link href={`/merchant/bookings?booking=${c.booking_id}`} className="tnum text-sm font-medium text-ink underline underline-offset-2">
                  #{String(c.booking_id).slice(0, 8).toUpperCase()}
                </Link>
                <span className="text-sm text-ink">{STAGE[String(c.stage)] ? t(STAGE[String(c.stage)]!) : String(c.stage)}</span>
                <span className="tnum ml-auto text-base font-semibold text-ink">+{rupees(Number(c.amount))}</span>
              </div>
              {Number(c.platform_coupon_amount) > 0 && (
                <p className="mt-1 text-xs text-ink-3">{t("wallet.platformCoupon", { amount: rupees(Number(c.platform_coupon_amount)) })}</p>
              )}
              {c.coupon_funded_by === "SHOP" && c.stage === "UPFRONT" && (
                <p className="mt-1 text-xs text-ink-3">{t("wallet.shopCoupon", { code: String(c.coupon_code) })}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
