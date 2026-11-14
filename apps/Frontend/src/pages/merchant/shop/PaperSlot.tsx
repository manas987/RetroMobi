import { useRef, useState } from "react";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { portalFetch, PortalApiError, type Row } from "../../../lib/portal";
import { uploadFile, UploadFailedError } from "../../../lib/upload";
import type { Tone } from "../../../lib/bookingStage";
import { useT } from "../../../i18n";
import { useMerchantShop } from "../Layout";
import { errorText, useInvalidateMerchant } from "../query";
import { DocUpload } from "../setup/DocUpload";
import { Button, Chip, ConfirmSheet, DateInput, Field, INPUT } from "../ui/ui";

export const STATUS_TONE: Record<string, Tone> = { ACTIVE: "good", VERIFIED: "good", PENDING: "info", REJECTED: "bad", EXPIRED: "bad" };

/**
 * One named paper: an empty slot with its own small form, or the uploaded
 * record with status, view, replace and remove. The type is fixed by the slot,
 * so there is no "which paper?" picker to get wrong.
 */
export function PaperSlot(p: {
  title: string;
  hint?: string;
  required: boolean;
  /** The newest record of this type, if any. */
  row?: Row;
  /** "/merchant-documents" or `/shops/${shopId}/documents`. */
  base: string;
  type: string;
  canWrite: boolean;
  needsExpiry?: boolean;
  /** Admin's reason, when the paper was sent back. */
  note?: string | null;
}) {
  const { token } = useMerchantShop();
  const { t, lang, date, tMaybe } = useT();
  const invalidate = useInvalidateMerchant();
  const [number, setNumber] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replace = useRef<HTMLInputElement>(null);
  const r = p.row;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setRemoving(false);
    } catch (err) {
      setError(err instanceof UploadFailedError ? t("fleet.uploadFailed")
        : err instanceof PortalApiError && err.status === 404 ? t("shop.fileMissing") : errorText(lang, err));
    } finally {
      // The record exists once the POST returned, so refresh either way.
      await invalidate();
      setBusy(false);
    }
  }
  const upload = (id: unknown, f: File) =>
    uploadFile({ portal: "merchant", token, file: f, presignPath: `${p.base}/${id}/upload`, confirmPath: `${p.base}/${id}/confirm` });
  const create = () => run(async () => {
    const doc = await portalFetch<Row>("merchant", p.base, {
      method: "POST", token, body: { type: p.type, documentNumber: number.trim() || undefined, expiresAt: expiresAt || undefined },
    });
    await upload(doc.id, file!);
  });
  const chip = <Chip tone={p.required ? "attention" : "muted"}>{p.required ? t("shop.neededToList") : t("common.optional")}</Chip>;

  if (!r) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border-2 border-dashed border-line p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink"><FileText className="h-4 w-4 text-ink-3" aria-hidden />{p.title}</span>
          {chip}
        </div>
        {p.hint && <p className="text-xs text-ink-3">{p.hint}</p>}
        {p.canWrite && (
          <div className="mt-1">
            <Field label={`${t("shop.paperNumber")} (${t("common.optional")})`}><input className={INPUT} value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
            {p.needsExpiry && <Field label={`${t("setup.licenceExpiry")} (${t("common.optional")})`}><DateInput clearable value={expiresAt} onChange={setExpiresAt} /></Field>}
            <DocUpload label={t("shop.paperFile")} accept="image/*,application/pdf" busy={busy} onFiles={(f) => setFile(f[0] ?? null)} />
            {error && <p role="alert" className="mb-2 text-xs text-danger">{error}</p>}
            <Button disabled={busy || !file} onClick={create}>{busy ? t("common.saving") : t("common.save")}</Button>
          </div>
        )}
      </div>
    );
  }

  const status = String(r.status ?? "");
  const expired = r.expires_at != null && String(r.expires_at).slice(0, 10) < new Date().toISOString().slice(0, 10);
  const shown = expired ? "EXPIRED" : status;
  const hasFile = r.storage_key != null;
  const path = `${p.base}/${r.id}`;
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink"><FileText className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />{p.title}</span>
        {hasFile ? <Chip tone={STATUS_TONE[shown] ?? "muted"}>{tMaybe(`shop.status_${shown}`) ?? t("shop.status_OTHER")}</Chip> : <Chip tone="muted">{t("fleet.noFile")}</Chip>}
        {chip}
      </div>
      <p className="text-xs text-ink-3">
        {r.document_number ? `${String(r.document_number)} · ` : ""}
        {r.expires_at ? t("shop.validTill", { date: date(String(r.expires_at).slice(0, 10) + "T12:00:00+05:30", { day: "numeric", month: "short", year: "numeric" }) }) : t("shop.noExpiry")}
      </p>
      {status === "REJECTED" && p.note && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{p.note}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {hasFile && <Button icon={Download} disabled={busy} onClick={() => run(async () => window.open((await portalFetch<{ downloadUrl: string }>("merchant", `${path}/download`, { token })).downloadUrl, "_blank", "noopener"))}>{t("common.view")}</Button>}
        {p.canWrite && <Button icon={Upload} disabled={busy} onClick={() => replace.current?.click()}>{hasFile ? t("fleet.replaceFile") : t("common.uploadFile")}</Button>}
        {p.canWrite && <button type="button" disabled={busy} onClick={() => setRemoving(true)} aria-label={t("common.remove")} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl text-danger hover:bg-danger-soft"><Trash2 className="h-5 w-5" aria-hidden /></button>}
      </div>
      <input ref={replace} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) run(() => upload(r.id, f));
      }} />
      <ConfirmSheet open={removing} onClose={() => setRemoving(false)} title={t("shop.removePaperTitle", { name: p.title })} body={t("shop.removePaperBody")}
        confirmLabel={t("common.remove")} danger busy={busy} error={error} onConfirm={() => run(() => portalFetch("merchant", path, { method: "DELETE", token }))} />
    </div>
  );
}

/** Newest record of each type: lists come back newest first. */
export const newestByType = (rows: Row[] | undefined) => {
  const out = new Map<string, Row>();
  for (const r of rows ?? []) if (!out.has(String(r.type))) out.set(String(r.type), r);
  return out;
};
