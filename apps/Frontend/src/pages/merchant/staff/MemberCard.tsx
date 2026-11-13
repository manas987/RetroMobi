import { useState } from "react";
import type { Row } from "../../../lib/portal";
import { portalFetch } from "../../../lib/portal";
import { useT } from "../../../i18n";
import { errorText, useInvalidateMerchant } from "../query";
import { Button, Chip, ConfirmSheet, Select } from "../ui/ui";
import { ROLES, type Role } from "./RoleCards";

export function Avatar({ name }: { name: string }) {
  return (
    <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber/30 text-base font-semibold text-ink">
      {(name.trim().replace(/^\+/, "")[0] ?? "?").toUpperCase()}
    </span>
  );
}

export function MemberCard({
  member: m,
  token,
  shopId,
  isSelf,
  canManage,
}: {
  member: Row;
  token: string;
  shopId: string;
  isSelf: boolean;
  canManage: boolean;
}) {
  const { t, lang, date } = useT();
  const invalidate = useInvalidateMerchant();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const phone = String(m.phone ?? "");
  const name = String(m.name ?? "") || phone;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await invalidate();
      setConfirmRemove(false);
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-card">
      <div className="flex items-start gap-3">
        <Avatar name={name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-ink">{name}</p>
          {phone && (
            <a href={`tel:${phone}`} className="tnum text-sm text-ink-2 underline underline-offset-2">
              {phone}
            </a>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="muted">{t(`common.role_${m.role as Role}`)}</Chip>
        {isSelf && <Chip tone="info">{t("common.you")}</Chip>}
        <span className="text-xs text-ink-3">{t("staff.joined", { date: date(m.created_at, { day: "numeric", month: "short", year: "numeric" }) })}</span>
      </div>
      {canManage && !isSelf && (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            compact
            ariaLabel={t("staff.changeRole", { name })}
            className="w-auto flex-1"
            value={m.role as Role}
            disabled={busy}
            onChange={(role) => run(() => portalFetch("merchant", `/shops/${shopId}/members/${m.id}`, { method: "PATCH", token, body: { role } }))}
            options={ROLES.map((r) => ({ value: r, label: t(`common.role_${r}`) }))}
          />
          <Button variant="ghost" className="text-danger" disabled={busy} onClick={() => setConfirmRemove(true)}>
            {t("common.remove")}
          </Button>
        </div>
      )}
      {error && !confirmRemove && <p role="alert" className="text-xs text-danger">{error}</p>}
      <ConfirmSheet
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title={t("staff.removeTitle", { name })}
        body={t("staff.removeBody", { name })}
        confirmLabel={t("staff.removeConfirm")}
        danger
        busy={busy}
        error={error}
        onConfirm={() => run(() => portalFetch("merchant", `/shops/${shopId}/members/${m.id}`, { method: "DELETE", token }))}
      />
    </div>
  );
}
