import { useState } from "react";
import { portalFetch } from "../../../lib/portal";
import { useT } from "../../../i18n";
import { errorText, useInvalidateMerchant } from "../query";
import { Button, ErrorNote, Field, PHONE, Sheet, TONE } from "../ui/ui";
import { E164Input } from "../../../components/PhoneInput";
import { validPhone } from "../../../lib/countries";
import { ROLES, ROLE_META, type Role } from "./RoleCards";

export function AddStaffSheet({ open, onClose, token, shopId }: { open: boolean; onClose: () => void; token: string; shopId: string }) {
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("STAFF");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/shops/${shopId}/invites`, { method: "POST", token, body: { phone, role } });
      await invalidate();
      setPhone("");
      setRole("STAFF");
      onClose();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("staff.addTitle")}>
      <Field label={t("staff.phone")} hint={t("staff.addHelper")}>
        <E164Input value={phone} onChange={setPhone} className={PHONE} placeholder="" />
      </Field>
      <fieldset className="mb-6">
        <legend className="mb-2 text-sm font-medium text-ink">{t("staff.role")}</legend>
        <div className="flex flex-col gap-2">
          {ROLES.map((r) => {
            const { icon: Icon, desc } = ROLE_META[r];
            return (
              <label
                key={r}
                className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border-2 p-3 ${role === r ? "border-ink bg-surface-2" : "border-line"}`}
              >
                <input type="radio" name="role" className="sr-only" checked={role === r} onChange={() => setRole(r)} />
                <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${TONE.muted.icon}`}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-semibold text-ink">{t(`common.role_${r}`)}</span>
                  <span className="block text-sm text-ink-2">{t(desc)}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {error && <div className="mb-4"><ErrorNote text={error} /></div>}
      <Button variant="primary" size="lg" className="w-full" disabled={busy || !validPhone(phone)} onClick={submit}>
        {t("staff.sendInvite")}
      </Button>
    </Sheet>
  );
}
