import { useState } from "react";
import { UserPlus } from "lucide-react";
import { portalFetch, type Row } from "../../../lib/portal";
import { useT } from "../../../i18n";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "../query";
import { Button, Card } from "../ui/ui";
import type { Role } from "./RoleCards";

/**
 * Shop invites waiting for the signed-in merchant. Shown on the Staff page and,
 * crucially, on the no-shop screen: someone invited as counter staff has no
 * shop yet, and without this they'd only see "Add your shop".
 */
export function InvitesForYou({ token, onAccepted, className = "mb-6" }: { token: string; onAccepted: () => void; className?: string }) {
  const { t } = useT();
  const mine = useMerchantQuery<{ invites: Row[] }>("/invites", token);
  if (!mine.data?.invites.length) return null;
  return (
    <Card title={t("staff.invitesForYou")} icon={UserPlus} className={className}>
      <div className="flex flex-col gap-3">
        {mine.data.invites.map((i) => (
          <MyInvite key={String(i.id)} invite={i} token={token} onAccepted={onAccepted} />
        ))}
      </div>
    </Card>
  );
}

function MyInvite({ invite: i, token, onAccepted }: { invite: Row; token: string; onAccepted: () => void }) {
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function respond(accept: boolean) {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/invites/${i.id}/respond`, { method: "POST", token, body: { accept } });
      await invalidate();
      if (accept) onAccepted();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-base text-ink">{t("staff.inviteJoin", { shop: String(i.shop_name ?? ""), role: t(`common.role_${i.role as Role}`) })}</p>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </div>
      <div className="flex gap-2">
        <Button variant="primary" disabled={busy} onClick={() => respond(true)}>{t("staff.accept")}</Button>
        <Button variant="ghost" disabled={busy} onClick={() => respond(false)}>{t("staff.decline")}</Button>
      </div>
    </div>
  );
}
