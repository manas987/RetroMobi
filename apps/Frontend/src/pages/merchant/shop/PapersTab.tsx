import { useState } from "react";
import { Briefcase, FileText, Plus, ScrollText, Store } from "lucide-react";
import { Link, useLocation } from "wouter";
import { portalFetch, PortalApiError, type Row } from "../../../lib/portal";
import { uploadFile } from "../../../lib/upload";
import type { Tone } from "../../../lib/bookingStage";
import { useT, type TKey } from "../../../i18n";
import { useMerchantShop } from "../Layout";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "../query";
import { Button, Card, Chip, ConfirmSheet, EmptyState, ErrorNote, DateInput, Field, INPUT, LoadingRows, Select, Sheet } from "../ui/ui";
import { newestByType, PaperSlot, STATUS_TONE } from "./PaperSlot";
import { useLicenceForm } from "../setup/LicenceStep";

/** Business-wide papers asked for by name. Other types (older uploads) stay listed under "Other papers". */
const BUSINESS = [
  { type: "BUSINESS_REG", required: true },
  { type: "PAN", required: true },
  { type: "GSTIN", required: false, hint: "shop.hint_GSTIN" },
  { type: "UDYAM", required: false, hint: "shop.hint_UDYAM" },
] as const;
const NAMED: string[] = BUSINESS.map((b) => b.type);

export function PapersTab() {
  const { token, shopId, shops, setShopId, can } = useMerchantShop();
  const { t } = useT();
  const [, navigate] = useLocation();
  const licences = useMerchantQuery<{ licences: Row[] }>("/licences", token);
  const docs = useMerchantQuery<{ documents: Row[] }>("/merchant-documents", token);
  const [sheet, setSheet] = useState<"licence" | null>(null);
  const write = can("shop:write");
  const newest = newestByType(docs.data?.documents);
  const others = (docs.data?.documents ?? []).filter((d) => !NAMED.includes(String(d.type)));

  return (
    <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2">
      <Card title={t("shop.licenceCard")} icon={ScrollText} action={write && <Button icon={Plus} onClick={() => setSheet("licence")}>{t("shop.addLicence")}</Button>}>
        <p className="mb-3 text-sm text-ink-3">{t("shop.licenceCardHint")}</p>
        <List q={licences} rows={licences.data?.licences} base="/licences" title={(r) => String(r.licence_number)} write={write} empty={t("shop.noLicences")} />
      </Card>
      <Card title={t("shop.businessCard")} icon={Briefcase}>
        <p className="mb-3 text-sm text-ink-3">{t("shop.businessCardHint")}</p>
        {docs.isPending ? <LoadingRows rows={2} /> : docs.isError ? <ErrorNote onRetry={() => docs.refetch()} /> : (
          <div className="flex flex-col gap-3">
            {BUSINESS.map((b) => (
              <PaperSlot key={b.type} type={b.type} base="/merchant-documents" title={t(`shop.paper_${b.type}` as TKey)}
                hint={"hint" in b ? t(b.hint) : undefined} required={b.required} row={newest.get(b.type)} canWrite={write} />
            ))}
            <p className="text-sm text-ink-3">{t("shop.bankHint")} <Link href="/merchant/earnings" className="font-semibold text-ink underline">{t("nav.earnings")}</Link></p>
          </div>
        )}
      </Card>
      <Card title={t("shop.eachShopCard")} icon={Store}>
        <p className="mb-3 text-sm text-ink-3">{t("shop.eachShopHint")}</p>
        <ul className="flex flex-col gap-2">
          {shops.map((s) => (
            <li key={String(s.id)} className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-2 p-3">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{String(s.name)}</span>
              <Button onClick={() => { setShopId(String(s.id)); navigate("/merchant/shop/papers"); }}>{t("shop.openPapers")}</Button>
            </li>
          ))}
        </ul>
      </Card>
      {others.length > 0 && (
        <Card title={t("shop.otherCard")} icon={FileText}>
          <List q={docs} rows={others} base="/merchant-documents" title={(r) => tMaybeLabel(t, r)} write={write} empty="" />
        </Card>
      )}
      <LicenceSheet open={sheet === "licence"} onClose={() => setSheet(null)} token={token} shopId={shopId} />
    </div>
  );
}

const tMaybeLabel = (t: ReturnType<typeof useT>["t"], r: Row) => t(`shop.paper_${String(r.type)}` as TKey);

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
