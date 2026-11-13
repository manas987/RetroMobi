import { useState, type ReactNode } from "react";
import { Camera, CheckCircle2, ChevronDown, FileText, IndianRupee, type LucideIcon } from "lucide-react";
import { portalFetch, PortalApiError, type Row } from "../../../lib/portal";
import { uploadFile } from "../../../lib/upload";
import { useT, type TKey } from "../../../i18n";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "../query";
import { Button, Chip, ErrorNote, DateInput, Field, INPUT } from "../ui/ui";
import { DocUpload } from "./DocUpload";
import type { DocType, SetupVehicle } from "./GetListedChip";

const DOCS: DocType[] = ["RC", "INSURANCE", "PUC"];
const toPaise = (rupees: string) => Math.round(Number(rupees) * 100);
const fromPaise = (p: unknown) => (p == null ? "" : String(Number(p) / 100));

function Row_({ icon: Icon, title, done, open, onToggle, children }: { icon: LucideIcon; title: string; done: boolean; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-h-14 w-full items-center gap-3 px-4 text-left">
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${done ? "bg-verified-soft text-verified" : "bg-surface-3 text-ink-2"}`}>
          {done ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <Icon className="h-5 w-5" aria-hidden />}
        </span>
        <span className="flex-1 text-sm font-semibold text-ink">{title}</span>
        <ChevronDown className={`h-5 w-5 text-ink-3 transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && <div className="border-t border-line px-4 pb-2 pt-4">{children}</div>}
    </div>
  );
}

export function VehicleSetup({ vehicle: v, token }: { vehicle: SetupVehicle; token: string }) {
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const [open, setOpen] = useState<string | null>(v.missing[0]?.replace("doc:", "") ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = (k: string) => setOpen(open === k ? null : k);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/vehicles/${v.id}/verification`, { method: "POST", token });
      await invalidate();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Row_ icon={IndianRupee} title={t("setup.itemPrice")} done={!v.missing.includes("price")} open={open === "price"} onToggle={() => toggle("price")}>
        <PriceForm vehicleId={v.id} token={token} onSaved={() => setOpen(null)} />
      </Row_>
      <Row_ icon={Camera} title={t("setup.itemPhoto")} done={!v.missing.includes("photo")} open={open === "photo"} onToggle={() => toggle("photo")}>
        <PhotoForm vehicle={v} token={token} />
      </Row_>
      {DOCS.map((d) => (
        <Row_ key={d} icon={FileText} title={t(`setup.doc_${d}` as TKey)} done={!v.missing.includes(`doc:${d}`)} open={open === d} onToggle={() => toggle(d)}>
          <DocForm vehicleId={v.id} type={d} doc={v.docs[d]} token={token} />
        </Row_>
      ))}
      <div className="mt-2 border-t border-line pt-4">
        {error && <div className="mb-3"><ErrorNote text={error} /></div>}
        {v.canSubmit ? (
          <Button variant="primary" size="lg" className="w-full" disabled={busy} onClick={send}>{busy ? t("common.saving") : t("setup.sendVehicle")}</Button>
        ) : v.stage === "CHECKING" ? (
          <Chip tone="info">{t("setup.vehicleSent")}</Chip>
        ) : (
          <p className="text-sm text-ink-2">{t("setup.finishItems")}</p>
        )}
      </div>
    </div>
  );
}

function PriceForm({ vehicleId, token, onSaved }: { vehicleId: string; token: string; onSaved: () => void }) {
  const q = useMerchantQuery<Row>(`/vehicles/${vehicleId}/pricing`, token);
  if (q.isPending) return <p className="pb-2 text-sm text-ink-3">…</p>;
  // A 404 just means no price yet.
  if (q.isError && !(q.error instanceof PortalApiError && q.error.status === 404)) return <ErrorNote onRetry={() => q.refetch()} />;
  return <PriceFields vehicleId={vehicleId} token={token} price={q.data ?? null} onSaved={onSaved} />;
}

function PriceFields({ vehicleId, token, price, onSaved }: { vehicleId: string; token: string; price: Row | null; onSaved: () => void }) {
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const [amount, setAmount] = useState(fromPaise(price?.amount));
  const [weekend, setWeekend] = useState(price && price.weekend_amount !== price.amount ? fromPaise(price.weekend_amount) : "");
  const [deposit, setDeposit] = useState(fromPaise(price?.security_deposit_amount));
  const [lateFee, setLateFee] = useState(price ? fromPaise(price.late_fee_amount) : "50");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooHigh = toPaise(deposit) > 1_000_000;
  const valid = Number(amount) > 0 && deposit !== "" && lateFee !== "" && !tooHigh;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/vehicles/${vehicleId}/pricing`, {
        method: "PUT",
        token,
        body: { amount: toPaise(amount), weekendAmount: toPaise(weekend || amount), securityDepositAmount: toPaise(deposit), lateFeeAmount: toPaise(lateFee) },
      });
      await invalidate();
      onSaved();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }
  const num = (v: string, set: (s: string) => void) => ({ className: INPUT, type: "number", inputMode: "numeric" as const, min: 0, value: v, onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value) });
  return (
    <>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label={t("setup.priceDay")}><input {...num(amount, setAmount)} /></Field>
        <Field label={t("setup.priceWeekend")} hint={t("setup.priceWeekendHint")}><input {...num(weekend, setWeekend)} /></Field>
        <Field label={t("setup.deposit")} error={tooHigh ? t("setup.depositMax") : undefined}><input {...num(deposit, setDeposit)} /></Field>
        <Field label={t("setup.lateFee")}><input {...num(lateFee, setLateFee)} /></Field>
      </div>
      {error && <div className="mb-3"><ErrorNote text={error} /></div>}
      <Button className="mb-2" disabled={busy || !valid} onClick={save}>{busy ? t("common.saving") : t("common.save")}</Button>
    </>
  );
}

function PhotoForm({ vehicle: v, token }: { vehicle: SetupVehicle; token: string }) {
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: File[]) {
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        const media = await uploadFile<Row>({ portal: "merchant", token, file, presignPath: `/vehicles/${v.id}/media/upload`, confirmPath: `/vehicles/${v.id}/media/confirm`, confirmBody: { type: "IMAGE" } });
        await portalFetch("merchant", `/vehicles/${v.id}/media/${media.id}`, { method: "PATCH", token, body: { published: true } });
      }
      await invalidate();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="mb-3 text-sm text-ink-2">{t("setup.photoHelp")}</p>
      <DocUpload label={t("setup.addPhotos")} accept="image/*" capture multiple busy={busy} onFiles={upload} />
      {v.photoCount > 0 && <p className="mb-2 text-sm font-semibold text-verified">{t(v.photoCount === 1 ? "setup.photosAdded_one" : "setup.photosAdded_other", { n: v.photoCount })}</p>}
      {error && <div className="mb-3"><ErrorNote text={error} /></div>}
    </>
  );
}

function DocForm({ vehicleId, type, doc, token }: { vehicleId: string; type: DocType; doc: SetupVehicle["docs"][DocType]; token: string }) {
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsExpiry = type !== "RC";

  if (doc.state === "VERIFIED") return <p className="mb-2"><Chip tone="good" icon={CheckCircle2}>{t("setup.docApproved")}</Chip></p>;
  if (doc.state === "PENDING") return <p className="mb-2"><Chip tone="info">{t("setup.docChecking")}</Chip></p>;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const row = await portalFetch<Row>("merchant", `/vehicles/${vehicleId}/documents`, { method: "POST", token, body: { type, expiresAt: needsExpiry ? expiresAt : undefined } });
      await uploadFile({ portal: "merchant", token, file: file!, presignPath: `/vehicles/${vehicleId}/documents/${row.id}/upload`, confirmPath: `/vehicles/${vehicleId}/documents/${row.id}/confirm` });
      await invalidate();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {doc.state !== "MISSING" && <p className="mb-3 rounded-2xl bg-danger-soft px-3 py-2 text-sm text-danger">{doc.note ?? (doc.state === "EXPIRED" ? t("setup.docExpired") : t("setup.docRejected"))}</p>}
      {needsExpiry && <Field label={t("setup.docExpiry")}><DateInput value={expiresAt} onChange={setExpiresAt} /></Field>}
      <DocUpload label={t("setup.docFile")} accept="image/*,application/pdf" capture busy={busy} onFiles={(f) => setFile(f[0] ?? null)} />
      {error && <div className="mb-3"><ErrorNote text={error} /></div>}
      <Button className="mb-2" disabled={busy || !file || (needsExpiry && !expiresAt)} onClick={save}>{busy ? t("common.saving") : t("common.save")}</Button>
    </>
  );
}
