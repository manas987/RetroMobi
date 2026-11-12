import { useRef, useState } from "react";
import { Camera, Download, FileText, Plus, Trash2, Upload } from "lucide-react";
import { portalFetch, type Row } from "../../../../lib/portal";
import { uploadFile, UploadFailedError } from "../../../../lib/upload";
import { istDay } from "../../../../lib/format";
import { useT, type TKey } from "../../../../i18n";
import type { Tone } from "../../../../lib/bookingStage";
import { useMerchantShop } from "../../Layout";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "../../query";
import { Button, Card, Chip, ErrorNote, Field, INPUT, LoadingRows, Sheet } from "../../ui/ui";
import { DOC_LABEL, useSetup } from "../SetupBoard";

const TYPES = ["RC", "INSURANCE", "PUC", "FITNESS", "PERMIT", "TAX"] as const;
const REQUIRED = ["RC", "INSURANCE", "PUC"];

const STATUS: Record<string, { tone: Tone; label: TKey }> = {
  PENDING: { tone: "info", label: "fleet.docPending" },
  VERIFIED: { tone: "good", label: "fleet.docVerified" },
  REJECTED: { tone: "bad", label: "fleet.docRejected" },
  EXPIRED: { tone: "bad", label: "fleet.docExpiredChip" },
};

export function PapersTab({ id }: { id: string }) {
  const { token, can } = useMerchantShop();
  const { t, lang, date } = useT();
  const invalidate = useInvalidateMerchant();
  const q = useMerchantQuery<{ documents: Row[] }>(`/vehicles/${id}/documents`, token);
  const setup = useSetup().data?.vehicles.find((v) => v.id === id);
  const [adding, setAdding] = useState<string | null>(null); // doc type being added
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replaceFor = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const write = can("fleet:write");
  const today = istDay(new Date());
  const docs = q.data?.documents ?? [];

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await invalidate();
    } catch (err) {
      setError(err instanceof UploadFailedError ? t("fleet.uploadFailed") : errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  const base = `/vehicles/${id}/documents`;
  const upload = (docId: string, file: File) =>
    uploadFile({ portal: "merchant", token, file, presignPath: `${base}/${docId}/upload`, confirmPath: `${base}/${docId}/confirm` });
  const remove = (docId: string) => run(() => portalFetch("merchant", `${base}/${docId}`, { method: "DELETE", token }));
  const view = (docId: string) =>
    run(async () => {
      const r = await portalFetch<{ downloadUrl: string }>("merchant", `${base}/${docId}/download`, { token });
      window.open(r.downloadUrl, "_blank", "noreferrer");
    });

  // Required papers that have no row yet still get a visible slot.
  const empty = REQUIRED.filter((type) => !docs.some((d) => d.type === type));

  return (
    <Card title={t("fleet.papersTitle")} action={write ? <Button icon={Plus} onClick={() => setAdding("INSURANCE")}>{t("fleet.addPaper")}</Button> : undefined}>
      <p className="mb-4 text-sm text-ink-3">{t("fleet.papersHint")}</p>
      {error && <div className="mb-4"><ErrorNote text={error} /></div>}
      {q.isPending && <LoadingRows rows={3} />}
      {q.isError && <ErrorNote onRetry={() => q.refetch()} />}

      {q.data && (
        <ul className="grid gap-3 md:grid-cols-2">
          {docs.map((d) => {
            const type = String(d.type);
            const expired = d.expires_at != null && String(d.expires_at).slice(0, 10) < today;
            const st = STATUS[expired ? "EXPIRED" : String(d.status)] ?? STATUS.PENDING!;
            const note = setup?.docs[type]?.state === "REJECTED" ? setup.docs[type]!.note : null;
            return (
              <li key={String(d.id)} className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink"><FileText className="h-4 w-4 text-ink-3" aria-hidden />{DOC_LABEL[type] ? t(DOC_LABEL[type]) : type}</span>
                  {d.storage_key ? <Chip tone={st.tone}>{t(st.label)}</Chip> : <Chip tone="muted">{t("fleet.noFile")}</Chip>}
                  {REQUIRED.includes(type) && <Chip tone="muted">{t("fleet.neededChip")}</Chip>}
                </div>
                <p className="text-xs text-ink-3">
                  {d.document_number ? `${String(d.document_number)} · ` : ""}
                  {d.expires_at ? t(expired ? "fleet.expiredOn" : "fleet.validTo", { date: date(String(d.expires_at).slice(0, 10) + "T12:00:00+05:30", { day: "numeric", month: "short", year: "numeric" }) }) : t("fleet.noExpiry")}
                </p>
                {note && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{note}</p>}
                <div className="flex flex-wrap gap-2">
                  {d.storage_key != null && <Button icon={Download} disabled={busy} onClick={() => view(String(d.id))}>{t("common.view")}</Button>}
                  {write && <Button icon={Upload} disabled={busy} onClick={() => { replaceFor.current = String(d.id); fileInput.current?.click(); }}>{d.storage_key ? t("fleet.replaceFile") : t("common.uploadFile")}</Button>}
                  {write && <button type="button" disabled={busy} onClick={() => remove(String(d.id))} aria-label={t("common.remove")} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl text-danger hover:bg-danger-soft"><Trash2 className="h-5 w-5" aria-hidden /></button>}
                </div>
              </li>
            );
          })}
          {empty.map((type) => (
            <li key={type} className="flex flex-col items-start gap-2 rounded-2xl border-2 border-dashed border-line p-4">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink"><FileText className="h-4 w-4 text-ink-3" aria-hidden />{t(DOC_LABEL[type]!)}</span>
              <Chip tone="muted">{t("fleet.neededChip")}</Chip>
              {write && <Button icon={Camera} onClick={() => setAdding(type)}>{t("fleet.addThisPaper")}</Button>}
            </li>
          ))}
        </ul>
      )}

      <input ref={fileInput} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => {
        const file = e.target.files?.[0];
        const docId = replaceFor.current;
        e.target.value = "";
        if (file && docId) run(() => upload(docId, file));
      }} />

      <Sheet open={adding != null} onClose={() => setAdding(null)} title={t("fleet.addPaper")}>
        {adding != null && <AddPaper id={id} initialType={adding} onDone={() => setAdding(null)} />}
      </Sheet>
    </Card>
  );
}

function AddPaper({ id, initialType, onDone }: { id: string; initialType: string; onDone: () => void }) {
  const { token } = useMerchantShop();
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const [type, setType] = useState(initialType);
  const [number, setNumber] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const doc = await portalFetch<Row>("merchant", `/vehicles/${id}/documents`, {
        method: "POST", token,
        body: { type, documentNumber: number.trim() || undefined, expiresAt: expiresAt || undefined },
      });
      if (file) {
        await uploadFile({ portal: "merchant", token, file,
          presignPath: `/vehicles/${id}/documents/${doc.id}/upload`, confirmPath: `/vehicles/${id}/documents/${doc.id}/confirm` });
      }
      await invalidate();
      onDone();
    } catch (err) {
      await invalidate();
      setError(err instanceof UploadFailedError ? t("fleet.uploadFailed") : errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <div className="mb-4"><ErrorNote text={error} /></div>}
      <Field label={t("fleet.fPaperType")}>
        <select className={INPUT} value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map((k) => <option key={k} value={k}>{t(DOC_LABEL[k]!)}</option>)}
        </select>
      </Field>
      <Field label={`${t("fleet.fPaperNumber")} (${t("common.optional")})`}><input className={INPUT} value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
      <Field label={`${t("fleet.fExpires")}${type === "RC" ? ` (${t("common.optional")})` : ""}`}><input className={INPUT} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></Field>
      <Field label={t("common.takePhoto")} hint={file?.name}>
        <input className="text-sm" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>
      <Button variant="primary" size="lg" className="w-full" disabled={busy} onClick={save}>{busy ? t("common.saving") : t("common.save")}</Button>
    </div>
  );
}
