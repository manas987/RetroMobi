import { useState } from "react";
import { FileText, Plus, ScrollText } from "lucide-react";
import { portalFetch, PortalApiError, type Row } from "../../../lib/portal";
import { uploadFile } from "../../../lib/upload";
import type { Tone } from "../../../lib/bookingStage";
import { useT, type TKey } from "../../../i18n";
import { useMerchantShop } from "../Layout";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "../query";
import { Button, Card, Chip, ConfirmSheet, EmptyState, ErrorNote, DateInput, Field, INPUT, LoadingRows, Select, Sheet } from "../ui/ui";
import { DocUpload } from "../setup/DocUpload";
import { useLicenceForm } from "../setup/LicenceStep";

const DOC_TYPES = ["PAN", "GSTIN", "AADHAAR", "BANK_PROOF", "OTHER"] as const;
const STATUS_TONE: Record<string, Tone> = { ACTIVE: "good", VERIFIED: "good", PENDING: "info", REJECTED: "bad", EXPIRED: "bad" };

export function PapersTab() {
  const { token, shopId, can } = useMerchantShop();
  const { t } = useT();
  const licences = useMerchantQuery<{ licences: Row[] }>("/licences", token);
  const docs = useMerchantQuery<{ documents: Row[] }>("/merchant-documents", token);
  const [sheet, setSheet] = useState<"licence" | "doc" | null>(null);
  const write = can("shop:write");

  return (
    <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2">
      <Card title={t("shop.licenceCard")} icon={ScrollText} action={write && <Button icon={Plus} onClick={() => setSheet("licence")}>{t("shop.addLicence")}</Button>}>
        <List q={licences} rows={licences.data?.licences} base="/licences" title={(r) => String(r.licence_number)} write={write} empty={t("shop.noLicences")} />
      </Card>
      <Card title={t("shop.otherCard")} icon={FileText} action={write && <Button icon={Plus} onClick={() => setSheet("doc")}>{t("shop.addPaper")}</Button>}>
        <List q={docs} rows={docs.data?.documents} base="/merchant-documents" title={(r) => t(`shop.paper_${String(r.type)}` as TKey)} write={write} empty={t("shop.noPapers")} />
      </Card>
      <LicenceSheet open={sheet === "licence"} onClose={() => setSheet(null)} token={token} shopId={shopId} />
      <PaperSheet open={sheet === "doc"} onClose={() => setSheet(null)} token={token} />
    </div>
  );
}

function List({ q, rows, base, title, write, empty }: { q: { isPending: boolean; isError: boolean; refetch: () => unknown }; rows?: Row[]; base: string; title: (r: Row) => string; write: boolean; empty: string }) {
  if (q.isPending) return <LoadingRows rows={2} />;
  if (q.isError) return <ErrorNote onRetry={() => q.refetch()} />;
  if (!rows?.length) return <EmptyState icon={FileText} text={empty} />;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => <PaperRow key={String(r.id)} row={r} base={base} title={title(r)} write={write} />)}
    </ul>
  );
}

function PaperRow({ row: r, base, title, write }: { row: Row; base: string; title: string; write: boolean }) {
  const { t, lang, date, tMaybe } = useT();
  const { token } = useMerchantShop();
  const invalidate = useInvalidateMerchant();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = String(r.status ?? "");
  const path = `${base}/${r.id}`;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await invalidate();
      setRemoving(false);
    } catch (err) {
      setError(err instanceof PortalApiError && err.status === 404 ? t("shop.fileMissing") : errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }
  const view = () => run(async () => window.open((await portalFetch<{ downloadUrl: string }>("merchant", `${path}/download`, { token })).downloadUrl, "_blank", "noopener"));

  return (
    <li className="rounded-2xl bg-surface-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{title}</span>
          <span className="block text-xs text-ink-3">{r.expires_at ? t("shop.validTill", { date: date(r.expires_at, { day: "numeric", month: "short", year: "numeric" }) }) : t("shop.noExpiry")}</span>
        </span>
        <Chip tone={STATUS_TONE[status] ?? "muted"}>{tMaybe(`shop.status_${status}`) ?? t("shop.status_OTHER")}</Chip>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {r.storage_key != null && <Button disabled={busy} onClick={view}>{t("common.view")}</Button>}
        {write && r.storage_key == null && (
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-2xl border border-line-strong bg-surface px-4 text-sm font-semibold text-ink">
            {t("shop.uploadFile")}
            <input type="file" accept="image/*,application/pdf" disabled={busy} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) run(() => uploadFile({ portal: "merchant", token, file: f, presignPath: `${path}/upload`, confirmPath: `${path}/confirm` })); }} />
          </label>
        )}
        {write && <Button variant="ghost" className="text-danger" onClick={() => setRemoving(true)}>{t("common.remove")}</Button>}
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <ConfirmSheet open={removing} onClose={() => setRemoving(false)} title={t("shop.removePaperTitle", { name: title })} body={t("shop.removePaperBody")} confirmLabel={t("common.remove")} danger busy={busy} error={error} onConfirm={() => run(() => portalFetch("merchant", path, { method: "DELETE", token }))} />
    </li>
  );
}

function LicenceSheet({ open, onClose, token, shopId }: { open: boolean; onClose: () => void; token: string; shopId: string | null }) {
  const { t } = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("shop.addLicence")}>
      {shopId && <LicenceFormBody token={token} shopId={shopId} onDone={onClose} />}
    </Sheet>
  );
}

function LicenceFormBody({ token, shopId, onDone }: { token: string; shopId: string; onDone: () => void }) {
  const { t } = useT();
  const f = useLicenceForm(token, shopId, onDone);
  return (
    <>
      {f.form}
      {f.error && <div className="mb-4"><ErrorNote text={f.error} /></div>}
      <Button variant="primary" size="lg" className="w-full" disabled={f.busy || !f.valid} onClick={f.submit}>{f.busy ? t("common.saving") : t("common.save")}</Button>
    </>
  );
}

function PaperSheet({ open, onClose, token }: { open: boolean; onClose: () => void; token: string }) {
  const { t } = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("shop.addPaper")}>
      <PaperForm token={token} onDone={onClose} />
    </Sheet>
  );
}

function PaperForm({ token, onDone }: { token: string; onDone: () => void }) {
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const [type, setType] = useState<string>(DOC_TYPES[0]);
  const [number, setNumber] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const doc = await portalFetch<Row>("merchant", "/merchant-documents", { method: "POST", token, body: { type, documentNumber: number.trim() || undefined, expiresAt: expiresAt || undefined } });
      if (file) await uploadFile({ portal: "merchant", token, file, presignPath: `/merchant-documents/${doc.id}/upload`, confirmPath: `/merchant-documents/${doc.id}/confirm` });
      await invalidate();
      onDone();
    } catch (err) {
      // The row exists once the POST returned, so refresh the list either way.
      await invalidate();
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Field label={t("shop.paperType")}>
        <Select value={type} onChange={setType} options={DOC_TYPES.map((d) => ({ value: d, label: t(`shop.paper_${d}` as TKey) }))} />
      </Field>
      <Field label={`${t("shop.paperNumber")} (${t("common.optional")})`}><input className={INPUT} value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
      <Field label={`${t("setup.licenceExpiry")} (${t("common.optional")})`}><DateInput clearable value={expiresAt} onChange={setExpiresAt} /></Field>
      <DocUpload label={t("shop.paperFile")} accept="image/*,application/pdf" busy={busy} onFiles={(f) => setFile(f[0] ?? null)} />
      {error && <div className="mb-4"><ErrorNote text={error} /></div>}
      <Button variant="primary" size="lg" className="w-full" disabled={busy} onClick={save}>{busy ? t("common.saving") : t("common.save")}</Button>
    </>
  );
}
