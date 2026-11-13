import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { portalFetch, PortalApiError, type Row } from "../../../../lib/portal";
import { rupees } from "../../../../lib/format";
import { useT } from "../../../../i18n";
import { useMerchantShop } from "../../Layout";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "../../query";
import { Button, Card, ErrorNote, DateInput, Field, INPUT, LoadingRows, Sheet } from "../../ui/ui";

const toPaise = (rupeeValue: string) => Math.round(Number(rupeeValue) * 100);
const fromPaise = (paise: unknown) => (paise == null ? "" : String(Number(paise) / 100));

export function PriceTab({ id }: { id: string }) {
  const { token } = useMerchantShop();
  const { t } = useT();
  const q = useMerchantQuery<Row>(`/vehicles/${id}/pricing`, token);
  // A vehicle whose price call failed on creation has no row: 404 means "empty form", not an error.
  const none = q.error instanceof PortalApiError && q.error.status === 404;

  if (q.isPending) return <LoadingRows rows={3} />;
  if (q.isError && !none) return <ErrorNote onRetry={() => q.refetch()} />;
  return (
    <div className="flex flex-col gap-4">
      {none && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{t("fleet.noPriceWarn")}</p>}
      <BaseRates key={none ? "new" : "set"} id={id} pricing={none ? {} : q.data!} />
      <Specials id={id} />
    </div>
  );
}

function BaseRates({ id, pricing }: { id: string; pricing: Row }) {
  const { token, can } = useMerchantShop();
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const [amount, setAmount] = useState(fromPaise(pricing.amount));
  const [weekend, setWeekend] = useState(fromPaise(pricing.weekend_amount));
  const [deposit, setDeposit] = useState(fromPaise(pricing.security_deposit_amount));
  const [lateFee, setLateFee] = useState(fromPaise(pricing.late_fee_amount) || "50");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooHigh = toPaise(deposit) > 1_000_000;
  const valid = Number(amount) > 0 && deposit !== "" && !tooHigh;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await portalFetch("merchant", `/vehicles/${id}/pricing`, {
        method: "PUT",
        token,
        body: {
          amount: toPaise(amount),
          weekendAmount: toPaise(weekend || amount),
          securityDepositAmount: toPaise(deposit),
          lateFeeAmount: toPaise(lateFee || "0"),
        },
      });
      await invalidate();
      setSaved(true);
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  const num = (v: string, set: (s: string) => void) => (
    <input className={INPUT} type="number" inputMode="numeric" min="0" value={v} disabled={!can("pricing:write")}
      onChange={(e) => { set(e.target.value); setSaved(false); }} />
  );

  return (
    <Card title={t("fleet.priceTitle")}>
      <p className="mb-4 text-sm text-ink-3">{t("fleet.priceHint")}</p>
      {error && <div className="mb-4"><ErrorNote text={error} /></div>}
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label={t("fleet.fPerDay")}>{num(amount, setAmount)}</Field>
        <Field label={t("fleet.fWeekend")} hint={t("fleet.weekendHint")}>{num(weekend, setWeekend)}</Field>
        <Field label={t("fleet.fDeposit")} error={tooHigh ? t("fleet.depositMax") : undefined}>{num(deposit, setDeposit)}</Field>
        <Field label={t("fleet.fLateFee")}>{num(lateFee, setLateFee)}</Field>
      </div>
      {can("pricing:write") && (
        <div className="flex items-center gap-3">
          <Button variant="primary" disabled={busy || !valid} onClick={save}>{busy ? t("common.saving") : t("common.save")}</Button>
          {saved && <span className="text-sm font-medium text-verified">{t("common.saved")}</span>}
        </div>
      )}
    </Card>
  );
}

function Specials({ id }: { id: string }) {
  const { token, can } = useMerchantShop();
  const { t, lang, date } = useT();
  const invalidate = useInvalidateMerchant();
  const q = useMerchantQuery<{ specials: Row[] }>(`/vehicles/${id}/pricing/specials`, token);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const write = can("pricing:write");

  async function remove(sid: unknown) {
    setError(null);
    try {
      await portalFetch("merchant", `/vehicles/${id}/pricing/specials/${sid}`, { method: "DELETE", token });
      await invalidate();
    } catch (err) {
      setError(errorText(lang, err));
    }
  }

  const specials = q.data?.specials ?? [];
  const day = (iso: unknown) => date(String(iso).slice(0, 10) + "T12:00:00+05:30", { day: "numeric", month: "short" });

  return (
    <Card title={t("fleet.specialsTitle")}
      action={write ? <Button icon={Plus} onClick={() => setOpen(true)}>{t("common.add")}</Button> : undefined}>
      {error && <div className="mb-3"><ErrorNote text={error} /></div>}
      {q.isPending && <LoadingRows rows={1} />}
      {q.isError && <ErrorNote onRetry={() => q.refetch()} />}
      {q.data && specials.length === 0 && <p className="text-sm text-ink-3">{t("fleet.specialsEmpty")}</p>}
      <ul className="flex flex-col gap-2">
        {specials.map((sp) => (
          <li key={String(sp.id)} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
            <span className="min-w-0 text-sm">
              <span className="block font-semibold text-ink">{String(sp.name)}</span>
              <span className="tnum block text-ink-2">{t("common.perDay", { amount: rupees(Number(sp.amount)) })} · {day(sp.effective_from)} – {day(sp.effective_until)}</span>
            </span>
            {write && (
              <button type="button" onClick={() => remove(sp.id)} aria-label={t("common.remove")}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-danger hover:bg-danger-soft">
                <Trash2 className="h-5 w-5" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("fleet.specialsAdd")}>
        {open && <SpecialForm id={id} onDone={() => setOpen(false)} />}
      </Sheet>
    </Card>
  );
}

function SpecialForm({ id, onDone }: { id: string; onDone: () => void }) {
  const { token } = useMerchantShop();
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [weekend, setWeekend] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const badRange = from !== "" && until !== "" && until < from;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/vehicles/${id}/pricing/specials`, {
        method: "POST",
        token,
        body: { name: name.trim(), amount: toPaise(amount), weekendAmount: toPaise(weekend || amount), effectiveFrom: from, effectiveUntil: until },
      });
      await invalidate();
      onDone();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <div className="mb-4"><ErrorNote text={error} /></div>}
      <Field label={t("fleet.specialName")}><input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label={t("fleet.fPerDay")}><input className={INPUT} type="number" inputMode="numeric" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label={`${t("fleet.fWeekend")} (${t("common.optional")})`}><input className={INPUT} type="number" inputMode="numeric" min="0" value={weekend} onChange={(e) => setWeekend(e.target.value)} /></Field>
      <Field label={t("common.from")}><DateInput value={from} onChange={setFrom} /></Field>
      <Field label={t("common.to")} error={badRange ? t("fleet.badRange") : undefined}><DateInput value={until} min={from || undefined} onChange={setUntil} /></Field>
      <Button variant="primary" size="lg" className="w-full" disabled={busy || !name.trim() || Number(amount) <= 0 || !from || !until || badRange} onClick={save}>
        {busy ? t("common.saving") : t("common.save")}
      </Button>
    </div>
  );
}
