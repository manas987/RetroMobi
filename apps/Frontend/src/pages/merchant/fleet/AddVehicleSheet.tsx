import { useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { portalFetch, type Row } from "../../../lib/portal";
import { enumLabel } from "../../../lib/format";
import { useT } from "../../../i18n";
import { useMerchantShop } from "../Layout";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "../query";
import { Button, ErrorNote, Field, INPUT, Select, Sheet } from "../ui/ui";

export function AddVehicleSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("fleet.addTitle")}>
      {open && <AddForm onClose={onClose} />}
    </Sheet>
  );
}

const paise = (rupees: string) => Math.round(Number(rupees) * 100);

function AddForm({ onClose }: { onClose: () => void }) {
  const { token, shopId } = useMerchantShop();
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const models = useMerchantQuery<{ models: Row[] }>("/models", token);
  const [modelId, setModelId] = useState("");
  const [plate, setPlate] = useState("");
  const [color, setColor] = useState("");
  const [amount, setAmount] = useState("");
  const [deposit, setDeposit] = useState("");
  const [lateFee, setLateFee] = useState("50");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const byMake = new Map<string, Row[]>();
  for (const m of models.data?.models ?? []) byMake.set(String(m.make), [...(byMake.get(String(m.make)) ?? []), m]);

  const depositTooHigh = Number(deposit) > 10_000;
  const hasPrice = amount !== "";
  const valid = modelId && plate.trim() && !depositTooHigh && (!hasPrice || Number(amount) > 0);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const vehicle = await portalFetch<Row>("merchant", `/shops/${shopId}/vehicles`, {
        method: "POST",
        token,
        body: { modelId, registrationNumber: plate.trim(), color: color.trim() || undefined },
      });
      // The vehicle exists from here on, so show success even if the price call fails below.
      setCreatedId(String(vehicle.id));
      if (hasPrice) {
        await portalFetch("merchant", `/vehicles/${vehicle.id}/pricing`, {
          method: "PUT",
          token,
          body: {
            amount: paise(amount),
            weekendAmount: paise(amount),
            securityDepositAmount: paise(deposit || "0"),
            lateFeeAmount: paise(lateFee || "0"),
          },
        });
      }
      await invalidate();
    } catch (err) {
      setError(errorText(lang, err));
      await invalidate();
    } finally {
      setBusy(false);
    }
  }

  if (createdId) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <CheckCircle2 className="h-12 w-12 text-verified" aria-hidden />
        <p className="text-lg font-semibold text-ink">{t("fleet.added")}</p>
        {error && <ErrorNote text={error} />}
        <div className="flex w-full flex-col gap-2">
          <Link href={`/merchant/setup?vehicle=${createdId}`} className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-amber px-6 text-base font-semibold text-on-amber hover:bg-amber-edge">
            {t("fleet.addPhotosPapers")}
          </Link>
          <Button variant="ghost" size="lg" onClick={onClose}>{t("common.done")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && <div className="mb-4"><ErrorNote text={error} /></div>}
      <Field label={t("fleet.fModel")}>
        <Select
          value={modelId}
          onChange={setModelId}
          placeholder={t("fleet.pickModel")}
          options={[...byMake].flatMap(([make, list]) =>
            list.map((m) => ({ value: String(m.id), label: `${String(m.model)} (${enumLabel(m.fuel_type)})`, group: make })),
          )}
        />
      </Field>
      <Field label={t("fleet.fPlate")}>
        <input className={INPUT} value={plate} autoCapitalize="characters" onChange={(e) => setPlate(e.target.value.toUpperCase())} />
      </Field>
      <Field label={`${t("fleet.fColor")} (${t("common.optional")})`}>
        <input className={INPUT} value={color} onChange={(e) => setColor(e.target.value)} />
      </Field>

      <details className="group mb-5 rounded-2xl bg-surface-2 p-4">
        <summary className="flex min-h-6 cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
          {t("fleet.priceLater")}
          <ChevronDown className="h-5 w-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-4">
          <Field label={t("fleet.fPerDay")}>
            <input className={INPUT} type="number" inputMode="numeric" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label={t("fleet.fDeposit")} error={depositTooHigh ? t("fleet.depositMax") : undefined}>
            <input className={INPUT} type="number" inputMode="numeric" min="0" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          </Field>
          <Field label={t("fleet.fLateFee")}>
            <input className={INPUT} type="number" inputMode="numeric" min="0" value={lateFee} onChange={(e) => setLateFee(e.target.value)} />
          </Field>
        </div>
      </details>

      <Button variant="primary" size="lg" className="w-full" disabled={busy || !valid} onClick={submit}>
        {busy ? t("common.saving") : t("fleet.addVehicle")}
      </Button>
    </div>
  );
}
