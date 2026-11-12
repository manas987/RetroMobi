import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { portalFetch, type Row } from "../../../../lib/portal";
import { useT, type TKey } from "../../../../i18n";
import { useMerchantShop } from "../../Layout";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "../../query";
import { Button, Card, EmptyState, ErrorNote, Field, INPUT, LoadingRows, Sheet } from "../../ui/ui";

/** What the RC carries. Only the registration number is required. */
const FIELDS: { key: string; label: TKey; numeric?: boolean }[] = [
  { key: "registeringAuthority", label: "fleet.reg_registeringAuthority" },
  { key: "engineNumber", label: "fleet.reg_engineNumber" },
  { key: "chassisNumber", label: "fleet.reg_chassisNumber" },
  { key: "manufacturer", label: "fleet.reg_manufacturer" },
  { key: "financer", label: "fleet.reg_financer" },
  { key: "cubicCapacity", label: "fleet.reg_cubicCapacity", numeric: true },
  { key: "seatingCapacity", label: "fleet.reg_seatingCapacity", numeric: true },
];

const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

export function RegistrationTab({ id }: { id: string }) {
  const { token, can } = useMerchantShop();
  const { t, date } = useT();
  const q = useMerchantQuery<{ record: Row | null }>(`/vehicles/${id}/registration`, token);
  const [open, setOpen] = useState(false);
  const record = q.data?.record ?? null;
  const edit = can("fleet:write") ? (
    <Button icon={record ? Pencil : Plus} onClick={() => setOpen(true)}>{record ? t("fleet.regUpdate") : t("fleet.regAdd")}</Button>
  ) : undefined;

  const rows: [TKey, unknown][] = record
    ? [
        ["fleet.reg_number", record.registration_number],
        ...FIELDS.map((f): [TKey, unknown] => [f.label, record[snake(f.key)]]),
        ["fleet.reg_taxValidUntil", record.tax_valid_until ? date(String(record.tax_valid_until).slice(0, 10) + "T12:00:00+05:30", { day: "numeric", month: "short", year: "numeric" }) : null],
      ]
    : [];

  return (
    <Card title={t("fleet.regTitle")} action={record ? edit : undefined}>
      <p className="mb-4 text-sm text-ink-3">{t("fleet.regHint")}</p>
      {q.isPending && <LoadingRows rows={3} />}
      {q.isError && <ErrorNote onRetry={() => q.refetch()} />}
      {q.data && !record && <EmptyState icon={Plus} text={t("fleet.regEmpty")} action={edit} />}
      {record && (
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
              <dt className="text-ink-3">{t(label)}</dt>
              <dd className="text-right font-medium text-ink">{value == null || value === "" ? "—" : String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={record ? t("fleet.regUpdate") : t("fleet.regAdd")}>
        {open && <RegistrationForm id={id} record={record} onDone={() => setOpen(false)} />}
      </Sheet>
    </Card>
  );
}

function RegistrationForm({ id, record, onDone }: { id: string; record: Row | null; onDone: () => void }) {
  const { token } = useMerchantShop();
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const [number, setNumber] = useState(String(record?.registration_number ?? ""));
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, String(record?.[snake(f.key)] ?? "")])),
  );
  const [tax, setTax] = useState(String(record?.tax_valid_until ?? "").slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const badNumber = FIELDS.some((f) => f.numeric && fields[f.key]!.trim() !== "" && !Number.isFinite(Number(fields[f.key])));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      // Blank fields are left out: an empty string is not the same as unknown.
      const body: Record<string, unknown> = { registrationNumber: number.trim() };
      for (const f of FIELDS) {
        const raw = fields[f.key]!.trim();
        if (raw) body[f.key] = f.numeric ? Number(raw) : raw;
      }
      if (tax) body.taxValidUntil = tax;
      await portalFetch("merchant", `/vehicles/${id}/registration`, { method: "PUT", token, body });
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
      <Field label={t("fleet.reg_number")}><input className={INPUT} value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} /></Field>
      {FIELDS.map((f) => (
        <Field key={f.key} label={t(f.label)}>
          <input className={INPUT} type={f.numeric ? "number" : "text"} inputMode={f.numeric ? "numeric" : undefined} value={fields[f.key]} onChange={(e) => setFields((p) => ({ ...p, [f.key]: e.target.value }))} />
        </Field>
      ))}
      <Field label={t("fleet.reg_taxValidUntil")}><input className={INPUT} type="date" value={tax} onChange={(e) => setTax(e.target.value)} /></Field>
      <Button variant="primary" size="lg" className="w-full" disabled={busy || !number.trim() || badNumber} onClick={save}>{busy ? t("common.saving") : t("common.save")}</Button>
    </div>
  );
}
