import { useState } from "react";
import { Plus, TicketPercent } from "lucide-react";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { portalFetch, type Row } from "../../lib/portal";
import { rupees } from "../../lib/format";
import { useT } from "../../i18n";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "./query";
import { Button, Card, Chip, EmptyState, ErrorNote, Field, INPUT, LoadingRows, PageHeader, Sheet } from "./ui/ui";

// The shop's own coupons (Routes/merchant/Coupons). Always SHOP-funded: the
// discount comes off this shop's earnings for the booking that uses it.

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const paise = (rupeesText: string) => Math.round(Number(rupeesText) * 100);
const int = (text: string) => (text.trim() ? Number(text) : undefined);

function NewCouponSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token, shopId } = useMerchantShop();
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const [f, setF] = useState({
    code: "", description: "", type: "PERCENT" as "PERCENT" | "FLAT", value: "", maxDiscount: "", minOrder: "",
    validFrom: today(), validUntil: inDays(30), maxUses: "", perUser: "1",
    firstBookingOnly: false, minRentals: "", minDays: "", minAge: "", maxAge: "", birthday: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });

  async function create() {
    setBusy(true);
    setError(null);
    const conditions = Object.fromEntries(
      Object.entries({
        firstBookingOnly: f.firstBookingOnly || undefined,
        minCompletedRentals: int(f.minRentals),
        minRentalDays: int(f.minDays),
        minRiderAge: int(f.minAge),
        maxRiderAge: int(f.maxAge),
        birthdayWindowDays: int(f.birthday),
      }).filter(([, v]) => v !== undefined),
    );
    try {
      await portalFetch("merchant", `/shops/${shopId}/coupons`, {
        method: "POST",
        token,
        body: {
          code: f.code.trim(),
          ...(f.description.trim() ? { description: f.description.trim() } : {}),
          type: f.type,
          value: f.type === "PERCENT" ? Number(f.value) : paise(f.value),
          ...(f.maxDiscount ? { maxDiscount: paise(f.maxDiscount) } : {}),
          ...(f.minOrder ? { minOrderAmount: paise(f.minOrder) } : {}),
          validFrom: new Date(`${f.validFrom}T00:00:00+05:30`).toISOString(),
          validUntil: new Date(`${f.validUntil}T23:59:59+05:30`).toISOString(),
          ...(int(f.maxUses) ? { maxUses: int(f.maxUses) } : {}),
          ...(int(f.perUser) ? { perUserLimit: int(f.perUser) } : {}),
          conditions,
        },
      });
      await invalidate();
      onClose();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("wallet.newCoupon")}>
      <Field label={t("wallet.code")}><input className={INPUT} value={f.code} maxLength={32} onChange={set("code")} /></Field>
      <Field label={t("wallet.description")}><input className={INPUT} value={f.description} maxLength={200} onChange={set("description")} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("wallet.value")}>
          <select className={INPUT} value={f.type} onChange={set("type")}>
            <option value="PERCENT">{t("wallet.typePercent")}</option>
            <option value="FLAT">{t("wallet.typeFlat")}</option>
          </select>
        </Field>
        <Field label={f.type === "PERCENT" ? "%" : "₹"}><input className={INPUT} inputMode="decimal" value={f.value} onChange={set("value")} /></Field>
      </div>
      {f.type === "PERCENT" && <Field label={t("wallet.maxDiscount")}><input className={INPUT} inputMode="decimal" value={f.maxDiscount} onChange={set("maxDiscount")} /></Field>}
      <Field label={t("wallet.minOrder")}><input className={INPUT} inputMode="decimal" value={f.minOrder} onChange={set("minOrder")} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("wallet.validFrom")}><input type="date" className={INPUT} value={f.validFrom} onChange={set("validFrom")} /></Field>
        <Field label={t("wallet.validUntil")}><input type="date" className={INPUT} value={f.validUntil} onChange={set("validUntil")} /></Field>
        <Field label={t("wallet.maxUses")}><input className={INPUT} inputMode="numeric" value={f.maxUses} onChange={set("maxUses")} /></Field>
        <Field label={t("wallet.perUser")}><input className={INPUT} inputMode="numeric" value={f.perUser} onChange={set("perUser")} /></Field>
      </div>
      <label className="mb-4 flex items-center gap-3 text-base text-ink">
        <input type="checkbox" className="h-5 w-5" checked={f.firstBookingOnly} onChange={set("firstBookingOnly")} />
        {t("wallet.firstBookingOnly")}
      </label>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("wallet.minRentals")}><input className={INPUT} inputMode="numeric" value={f.minRentals} onChange={set("minRentals")} /></Field>
        <Field label={t("wallet.minDays")}><input className={INPUT} inputMode="numeric" value={f.minDays} onChange={set("minDays")} /></Field>
        <Field label={t("wallet.minAge")}><input className={INPUT} inputMode="numeric" value={f.minAge} onChange={set("minAge")} /></Field>
        <Field label={t("wallet.maxAge")}><input className={INPUT} inputMode="numeric" value={f.maxAge} onChange={set("maxAge")} /></Field>
      </div>
      <Field label={t("wallet.birthday")}><input className={INPUT} inputMode="numeric" value={f.birthday} onChange={set("birthday")} /></Field>
      {error && <p className="mb-3 text-sm text-danger" role="alert">{error}</p>}
      <Button variant="primary" disabled={busy || !f.code.trim() || !f.value} onClick={create}>{t("wallet.create")}</Button>
    </Sheet>
  );
}

function CouponsBody() {
  const { token, shopId, can } = useMerchantShop();
  const { t, lang, date } = useT();
  const invalidate = useInvalidateMerchant();
  const q = useMerchantQuery<{ coupons: Row[] }>(shopId ? `/shops/${shopId}/coupons` : null, token);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canWrite = can("pricing:write");

  async function act(id: string, method: "PATCH" | "DELETE", body?: Record<string, unknown>) {
    setError(null);
    try {
      await portalFetch("merchant", `/shops/${shopId}/coupons/${id}`, { method, token, ...(body ? { body } : {}) });
      await invalidate();
    } catch (err) {
      setError(errorText(lang, err));
    }
  }

  const rows = q.data?.coupons ?? [];
  return (
    <>
      <PageHeader title={t("wallet.couponsTitle")} subtitle={t("wallet.couponsSubtitle")}
        actions={canWrite && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>{t("wallet.newCoupon")}</Button>} />
      {error && <div className="mb-4"><ErrorNote text={error} /></div>}
      <Card>
        {q.isPending ? <LoadingRows /> : q.isError ? <ErrorNote onRetry={() => q.refetch()} /> : rows.length === 0 ? (
          <EmptyState icon={TicketPercent} text={t("wallet.couponsEmpty")} />
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((c) => (
              <li key={String(c.id)} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-surface-2 p-3">
                <span className="tnum font-semibold text-ink">{String(c.code)}</span>
                <span className="text-sm text-ink">
                  {c.type === "PERCENT" ? `${c.value}%` : rupees(Number(c.value))}
                </span>
                <span className="text-sm text-ink-3">{date(c.valid_from)} – {date(c.valid_until)}</span>
                <span className="text-sm text-ink-3">{t("wallet.used", { count: Number(c.used_count) })}</span>
                {c.status === "PAUSED" && <Chip tone="muted">{t("wallet.paused")}</Chip>}
                {canWrite && (
                  <span className="ml-auto flex gap-2">
                    <Button variant="ghost" onClick={() => act(String(c.id), "PATCH", { status: c.status === "PAUSED" ? "ACTIVE" : "PAUSED" })}>
                      {c.status === "PAUSED" ? t("wallet.resume") : t("wallet.pause")}
                    </Button>
                    <Button variant="ghost" onClick={() => act(String(c.id), "DELETE")}>{t("wallet.remove")}</Button>
                  </span>
                )}
                {!!c.description && <p className="w-full text-sm text-ink-2">{String(c.description)}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <NewCouponSheet open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

export function MerchantCoupons() {
  return <MerchantLayout><CouponsBody /></MerchantLayout>;
}
