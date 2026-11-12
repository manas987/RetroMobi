import { useState } from "react";
import { portalFetch } from "../../../lib/portal";
import { useT } from "../../../i18n";
import { useMerchantShop } from "../Layout";
import { errorText, useInvalidateMerchant } from "../query";
import { ConfirmSheet } from "../ui/ui";

/** Turns every READY vehicle on, one after another, stopping at the first error. */
export function ShowAllReady({ open, onClose, ids }: { open: boolean; onClose: () => void; ids: string[] }) {
  const { token } = useMerchantShop();
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = done !== null;

  async function run() {
    setError(null);
    setDone(0);
    try {
      for (const id of ids) {
        await portalFetch("merchant", `/vehicles/${id}`, { method: "PATCH", token, body: { status: "ACTIVE" } });
        setDone((d) => (d ?? 0) + 1);
      }
      onClose();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setDone(null);
      await invalidate();
    }
  }

  return (
    <ConfirmSheet
      open={open}
      onClose={onClose}
      title={t("fleet.showAll")}
      body={busy ? t("fleet.turningOn", { i: (done ?? 0) + 1, n: ids.length }) : t("fleet.showAllBody", { n: ids.length })}
      confirmLabel={t("fleet.yesShow")}
      busy={busy}
      error={error}
      onConfirm={run}
    />
  );
}
