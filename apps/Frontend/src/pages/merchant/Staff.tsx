import { useState } from "react";
import { Link } from "wouter";
import { History, UserPlus, Users } from "lucide-react";
import { decodeJwtSubject, portalFetch, type Row } from "../../lib/portal";
import { useT } from "../../i18n";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "./query";
import { Button, Card, Chip, ErrorNote, LoadingRows, PageHeader } from "./ui/ui";
import { AddStaffSheet } from "./staff/AddStaffSheet";
import { MemberCard } from "./staff/MemberCard";
import { ROLES, RoleCards, type Role } from "./staff/RoleCards";
import { phoneLabel } from "../../lib/format";
import { InvitesForYou } from "./staff/InvitesForYou";

export function MerchantStaff() {
  return (
    <MerchantLayout>
      <StaffBody />
    </MerchantLayout>
  );
}

function StaffBody() {
  const { token, shopId, can, reloadShops } = useMerchantShop();
  const { t, lang, date } = useT();
  const invalidate = useInvalidateMerchant();
  const [adding, setAdding] = useState(false);
  const myId = decodeJwtSubject(token);
  const canRead = can("members:read");
  const canManage = can("members:write");

  const members = useMerchantQuery<{ members: Row[] }>(canRead && shopId ? `/shops/${shopId}/members` : null, token);
  const invites = useMerchantQuery<{ invites: Row[] }>(canRead && shopId ? `/shops/${shopId}/invites` : null, token);

  const list = members.data?.members ?? [];
  const counts = Object.fromEntries(ROLES.map((r) => [r, list.filter((m) => m.role === r).length])) as Record<Role, number>;
  const addButton = canManage && (
    <Button variant="primary" icon={UserPlus} onClick={() => setAdding(true)}>
      {t("staff.addStaff")}
    </Button>
  );

  return (
    <div className="@container">
      <PageHeader title={t("staff.title")} subtitle={t("staff.subtitle")} actions={addButton} />

      <InvitesForYou token={token} onAccepted={reloadShops} />

      {!canRead ? (
        <Card><p className="text-base text-ink-2">{t("staff.noAccess")}</p></Card>
      ) : members.isPending ? (
        <LoadingRows />
      ) : members.isError ? (
        <ErrorNote onRetry={() => void members.refetch()} />
      ) : (
        <>
          <RoleCards counts={counts} />
          <div className="grid gap-4 grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3">
            {list.map((m) => (
              <MemberCard key={String(m.id)} member={m} token={token} shopId={shopId!} isSelf={m.merchant_user_id === myId} canManage={canManage} />
            ))}
          </div>

          {/* Waits for the invites so it never flashes in; once one is sent it
              fades and folds away (grid 1fr -> 0fr) instead of snapping out. */}
          {list.length === 1 && invites.isSuccess && (() => {
            const show = invites.data.invites.length === 0;
            return (
              <div
                aria-hidden={!show}
                inert={!show}
                className={`grid transition-[grid-template-rows,opacity] delay-150 duration-500 ease-out motion-reduce:transition-none ${show ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
              >
                {/* Clip only while folding, so the card's shadow isn't cut when shown. */}
                <div className={`min-h-0 ${show ? "" : "overflow-hidden"}`}>
                  <Card className="mt-4 @xl:flex-row @xl:items-center @xl:gap-4">
                    <span className="mb-3 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-3 text-ink-3 @xl:mb-0">
                      <Users className="h-6 w-6" aria-hidden />
                    </span>
                    <p className="mb-3 flex-1 text-base text-ink-2 @xl:mb-0">{t("staff.onlyYou")}</p>
                    {addButton}
                  </Card>
                </div>
              </div>
            );
          })()}

          {(invites.data?.invites.length ?? 0) > 0 && (
            <Card title={t("staff.waiting")} icon={UserPlus} className="mt-6">
              <div className="flex flex-col gap-3">
                {invites.data!.invites.map((i) => (
                  <InviteRow key={String(i.id)} invite={i} token={token} shopId={shopId!} canManage={canManage}
                    onCancel={async () => { await portalFetch("merchant", `/shops/${shopId}/invites/${i.id}`, { method: "DELETE", token }); await invalidate(); }}
                    errorOf={(err) => errorText(lang, err)} date={date} />
                ))}
              </div>
            </Card>
          )}

          <Link href="/merchant/activity" className="mt-6 inline-flex min-h-11 items-center gap-2 text-base font-medium text-ink underline underline-offset-4">
            <History className="h-5 w-5" aria-hidden />
            {t("staff.seeActivity")}
          </Link>
        </>
      )}
      {shopId && <AddStaffSheet open={adding} onClose={() => setAdding(false)} token={token} shopId={shopId} />}
    </div>
  );
}

function InviteRow({ invite: i, canManage, onCancel, errorOf, date }: {
  invite: Row; token: string; shopId: string; canManage: boolean;
  onCancel: () => Promise<void>; errorOf: (e: unknown) => string; date: (iso: unknown, o?: Intl.DateTimeFormatOptions) => string;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-surface-2 p-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-base font-semibold text-ink">
          <span className="tnum">{phoneLabel(String(i.requested_to))}</span>
          <Chip tone="muted">{t(`common.role_${i.role as Role}`)}</Chip>
        </p>
        <p className="text-xs text-ink-3">{t("staff.invitedOn", { date: date(i.created_at) })}</p>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </div>
      {canManage && (
        <Button variant="ghost" disabled={busy} onClick={async () => {
          setBusy(true); setError(null);
          try { await onCancel(); } catch (err) { setError(errorOf(err)); setBusy(false); }
        }}>
          {t("staff.cancelInvite")}
        </Button>
      )}
    </div>
  );
}

