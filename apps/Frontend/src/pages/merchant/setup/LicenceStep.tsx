import { useRef, useState } from "react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { Row } from "../../../lib/portal";
import { portalFetch } from "../../../lib/portal";
import { uploadFile } from "../../../lib/upload";
import { useT } from "../../../i18n";
import { errorText, useInvalidateMerchant } from "../query";
import { DateInput, Field, INPUT } from "../ui/ui";
import { DocUpload } from "./DocUpload";
import { StepCard } from "./Stepper";
import type { SetupData } from "./GetListedChip";
import type { StepProps } from "./ShopStep";

/**
 * Number + expiry + photo, then link the licence to this shop. Shared by the
 * wizard and the "Add licence" sheet. If the licence row was created but the
 * photo failed, a retry reuses that row instead of making a second licence.
 */
export function useLicenceForm(token: string, shopId: string, onDone: () => void) {
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const [number, setNumber] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const created = useRef<string | null>(null);

  const valid = number.trim() !== "" && expiresAt !== "" && file != null;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (!created.current) {
        const l = await portalFetch<Row>("merchant", "/licences", { method: "POST", token, body: { licenceNumber: number.trim(), expiresAt } });
        created.current = String(l.id);
      }
      const id = created.current;
      await uploadFile({ portal: "merchant", token, file: file!, presignPath: `/licences/${id}/upload`, confirmPath: `/licences/${id}/confirm` });
      await portalFetch("merchant", `/licences/${id}/shops`, { method: "POST", token, body: { shopId } });
      created.current = null;
      await invalidate();
      onDone();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  const form = (
    <>
      <Field label={t("setup.licenceNumber")}><input className={INPUT} value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
      <Field label={t("setup.licenceExpiry")}><DateInput value={expiresAt} onChange={setExpiresAt} /></Field>
      <DocUpload label={t("setup.licencePhoto")} accept="image/*,application/pdf" busy={busy} onFiles={(f) => setFile(f[0] ?? null)} />
    </>
  );
  return { form, submit, busy, error, valid };
}

export function LicenceStep(p: StepProps & { setup: SetupData }) {
  const { t, date } = useT();
  const { licence } = p.setup;
  const f = useLicenceForm(p.token, p.shopId, p.advance);
  const showForm = licence.status === "NONE" || licence.status === "REJECTED" || licence.status === "EXPIRED";
  const box =
    licence.status === "ACTIVE" ? { Icon: CheckCircle2, cls: "bg-verified-soft text-verified", text: t("setup.licenceActive", { date: date(licence.expiresAt, { day: "numeric", month: "short", year: "numeric" }) }) }
    : licence.status === "PENDING" ? { Icon: Clock, cls: "bg-info-soft text-info", text: t("setup.licenceChecking") }
    : showForm && licence.status !== "NONE" ? { Icon: XCircle, cls: "bg-danger-soft text-danger", text: licence.rejectionNote ?? t("setup.licenceExpired") }
    : null;
  return (
    <StepCard
      step="licence"
      title={t("setup.licenceTitle")}
      why={t("setup.licenceWhy")}
      gated={!p.can}
      onBack={p.back}
      onNext={p.next}
      onSave={showForm ? f.submit : p.next}
      saveLabel={showForm ? undefined : t("common.continue")}
      busy={f.busy}
      disabled={showForm && !f.valid}
      error={f.error}
    >
      {box && (
        <p className={`mb-4 flex items-center gap-2 rounded-2xl p-3 text-sm font-semibold ${box.cls}`}>
          <box.Icon className="h-5 w-5 shrink-0" aria-hidden />
          {box.text}
        </p>
      )}
      {showForm && f.form}
    </StepCard>
  );
}
