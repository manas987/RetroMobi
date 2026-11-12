import { useState } from "react";
import { HardHat, Plus, Trash2 } from "lucide-react";
import { portalFetch, type Row } from "../../../../lib/portal";
import { useT } from "../../../../i18n";
import { Toggle } from "../../../../components/Toggle";
import { useMerchantShop } from "../../Layout";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "../../query";
import { Button, Card, Chip, EmptyState, ErrorNote, Field, INPUT, LoadingRows, Sheet } from "../../ui/ui";

export function AccessoriesTab({ id }: { id: string }) {
  const { token, can } = useMerchantShop();
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const q = useMerchantQuery<{ accessories: Row[] }>(`/vehicles/${id}/accessories`, token);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const write = can("fleet:write");
  const list = q.data?.accessories ?? [];
  const add = write ? <Button icon={Plus} onClick={() => setOpen(true)}>{t("common.add")}</Button> : undefined;

  async function remove(aid: unknown) {
    setError(null);
    try {
      await portalFetch("merchant", `/vehicles/${id}/accessories/${aid}`, { method: "DELETE", token });
      await invalidate();
    } catch (err) {
      setError(errorText(lang, err));
    }
  }

  return (
    <Card title={t("fleet.accTitle")} action={list.length > 0 ? add : undefined}>
      <p className="mb-4 text-sm text-ink-3">{t("fleet.accHint")}</p>
      {error && <div className="mb-3"><ErrorNote text={error} /></div>}
      {q.isPending && <LoadingRows rows={2} />}
      {q.isError && <ErrorNote onRetry={() => q.refetch()} />}
      {q.data && list.length === 0 && <EmptyState icon={HardHat} text={t("fleet.accEmpty")} action={add} />}
      <ul className="grid gap-2 sm:grid-cols-2">
        {list.map((a) => (
          <li key={String(a.id)} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
            <span className="min-w-0 text-sm font-semibold text-ink">{String(a.type)} <span className="font-normal text-ink-3">× {String(a.quantity)}</span></span>
            <span className="flex shrink-0 items-center gap-2">
              <Chip tone={a.status === "AVAILABLE" ? "good" : "muted"}>{t(a.status === "AVAILABLE" ? "fleet.accAvailable" : "fleet.accUnavailable")}</Chip>
              {write && (
                <button type="button" onClick={() => remove(a.id)} aria-label={t("common.remove")} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl text-danger hover:bg-danger-soft">
                  <Trash2 className="h-5 w-5" aria-hidden />
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("fleet.accAdd")}>
        {open && <AddAccessory id={id} existing={list.map((a) => String(a.type).trim().toLowerCase())} onDone={() => setOpen(false)} />}
      </Sheet>
    </Card>
  );
}

function AddAccessory({ id, existing, onDone }: { id: string; existing: string[]; onDone: () => void }) {
  const { token } = useMerchantShop();
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const [type, setType] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The API always inserts, so a second "Helmet" would silently become a second row.
  const duplicate = type.trim() !== "" && existing.includes(type.trim().toLowerCase());

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/vehicles/${id}/accessories`, {
        method: "POST", token,
        body: { type: type.trim(), quantity: Number(quantity), status: available ? "AVAILABLE" : "UNAVAILABLE" },
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
      <Field label={t("fleet.accName")} error={duplicate ? t("fleet.accDuplicate") : undefined}><input className={INPUT} value={type} onChange={(e) => setType(e.target.value)} /></Field>
      <Field label={t("fleet.accQty")}><input className={INPUT} type="number" inputMode="numeric" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
      <div className="mb-5 flex items-center gap-3 text-sm text-ink">
        <Toggle checked={available} onChange={setAvailable} label={t("fleet.accAvailableToRiders")} />
        {t("fleet.accAvailableToRiders")}
      </div>
      <Button variant="primary" size="lg" className="w-full" disabled={busy || !type.trim() || Number(quantity) < 1 || duplicate} onClick={save}>{busy ? t("common.saving") : t("common.save")}</Button>
    </div>
  );
}
