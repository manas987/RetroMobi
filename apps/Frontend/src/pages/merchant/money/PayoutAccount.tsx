import { useState } from "react";
import { Landmark } from "lucide-react";
import { useMerchantShop } from "../Layout";
import { portalFetch, type Row } from "../../../lib/portal";
import { useT } from "../../../i18n";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "../query";
import { Button, Card, Chip, ErrorNote, Field, INPUT, LoadingRows, Sheet } from "../ui/ui";

/**
 * The bank account payouts go to. Shared by Earnings and the "Get listed"
 * wizard, so keep this export's props stable.
 */
export function PayoutAccountSection({ onChanged }: { onChanged?: () => void }) {
  const { token } = useMerchantShop();
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  // `GET /payout-account` answers literal null when there is none.
  const q = useMerchantQuery<Row | null>("/payout-account", token);
  const [editing, setEditing] = useState(false);
  const [holderName, setHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const account = q.data ?? null;
  const complete = holderName.trim().length >= 3 && accountNumber.trim() && ifsc.trim().length === 11;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      // Sent once to register the beneficiary; the server keeps only the last four digits.
      await portalFetch("merchant", "/payout-account", {
        method: "PUT",
        token,
        body: { holderName: holderName.trim(), accountNumber: accountNumber.trim(), ifsc: ifsc.trim().toUpperCase() },
      });
      setEditing(false);
      setHolderName("");
      setAccountNumber("");
      setIfsc("");
      await invalidate();
      onChanged?.();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  const last4 = account ? String(account.account_last4 ?? "") : "";
  const masked = last4 ? `•••• ${last4}${account?.ifsc ? ` · ${String(account.ifsc)}` : ""}` : "—";

  return (
    <Card
      title={t("money.bankTitle")}
      icon={Landmark}
      action={q.isSuccess && (
        <Button variant={account ? "secondary" : "primary"} onClick={() => setEditing(true)}>
          {account ? t("common.change") : t("money.addAccount")}
        </Button>
      )}
    >
      {q.isPending ? <LoadingRows rows={1} /> : q.isError ? <ErrorNote onRetry={() => q.refetch()} /> : account ? (
        <>
          <p className="flex flex-wrap items-center gap-3 text-base text-ink">
            <span className="tnum font-medium">{masked}</span>
            {account.status === "VERIFIED" ? <Chip tone="good">{t("money.bankVerified")}</Chip>
              : account.status === "PENDING" ? <Chip tone="info">{t("money.bankPending")}</Chip>
              : <Chip tone="bad">{t("money.bankRejected")}</Chip>}
          </p>
          {account.status === "PENDING" && <p className="mt-2 text-sm text-ink-2">{t("money.bankPendingNote")}</p>}
          {account.status !== "PENDING" && account.status !== "VERIFIED" && <p className="mt-2 text-sm text-ink-2">{t("money.bankRejectedNote")}</p>}
        </>
      ) : (
        <p className="text-sm text-ink-2">{t("money.bankNone")}</p>
      )}

      <Sheet open={editing} onClose={() => setEditing(false)} title={t(account ? "money.bankReplaceTitle" : "money.bankAddTitle")}>
        {error && <div className="mb-4"><ErrorNote text={error} /></div>}
        <Field label={t("money.holderName")}>
          <input className={INPUT} value={holderName} onChange={(e) => setHolderName(e.target.value)} autoComplete="name" />
        </Field>
        <Field label={t("money.accountNumber")}>
          <input className={INPUT} inputMode="numeric" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
        </Field>
        <Field label={t("money.ifsc")} hint={t("money.ifscHint")}>
          <input className={INPUT} value={ifsc} maxLength={11} onChange={(e) => setIfsc(e.target.value.toUpperCase())} />
        </Field>
        <p className="text-xs text-ink-3 mb-5">{t("money.bankPrivacy")}</p>
        <Button variant="primary" size="lg" className="w-full" disabled={busy || !complete} onClick={save}>
          {t(busy ? "common.saving" : "common.save")}
        </Button>
      </Sheet>
    </Card>
  );
}
