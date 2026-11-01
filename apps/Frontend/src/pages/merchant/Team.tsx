import { useState } from "react";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { usePortalQuery, portalFetch, decodeJwtSubject, PortalApiError, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";
import { ErrorBox, SubmitButton, TextField } from "../../components/AuthFormBits";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { ROLE_LABEL } from "../../lib/permissions";
import { dateLabel } from "../../lib/format";

const ROLES = ["OWNER", "MANAGER", "STAFF"] as const;

function TeamBody() {
  const { token, shopId, can } = useMerchantShop();
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  // Which member row is the signed-in user, so the UI can mark it and refuse
  // to let them demote or remove themselves by accident.
  const myId = decodeJwtSubject(token);

  const canManage = can("members:write");
  const canRead = can("members:read");

  const { data: myInvites, error: myInvitesError } = usePortalQuery<{ invites: Row[] }>(
    "merchant",
    `/invites?r=${reloadKey}`,
    token,
  );
  const { data: members, error: membersError } = usePortalQuery<{ members: Row[] }>(
    "merchant",
    canRead && shopId ? `/shops/${shopId}/members?r=${reloadKey}` : null,
    token,
  );
  const { data: invites, error: invitesError } = usePortalQuery<{ invites: Row[] }>(
    "merchant",
    canRead && shopId ? `/shops/${shopId}/invites?r=${reloadKey}` : null,
    token,
  );

  const pendingMyInvites = (myInvites?.invites ?? []).filter((i) => i.status === "PENDING");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1">Team</h1>
      <p className="text-sm text-ink-3 mb-5">Who can manage this shop, and at what level.</p>

      {myInvitesError && <ErrorBox text={myInvitesError} />}

      {pendingMyInvites.length > 0 && (
        <div className="rounded-panel border border-line p-4 mb-5">
          <p className="text-sm font-medium text-ink mb-2">Invites waiting on you</p>
          <div className="flex flex-col gap-2">
            {pendingMyInvites.map((i) => (
              <MyInviteRow key={String(i.id)} invite={i} token={token} onChanged={reload} />
            ))}
          </div>
        </div>
      )}

      {canManage && shopId && <InviteForm token={token} shopId={shopId} onInvited={reload} />}

      {!canRead ? (
        <p className="text-sm text-ink-3 bg-surface-2 rounded-panel px-4 py-3 mt-6">
          Your role can't view this shop's team.
        </p>
      ) : (
        <>
          <h2 className="text-sm font-medium text-ink-3 mb-2 mt-6">Members</h2>
          {membersError && <ErrorBox text={membersError} />}
          {!membersError && members === null && <p className="text-sm text-ink-3">Loading…</p>}
          {!membersError && members && (
            <DataTable
              rows={members.members}
              emptyLabel="No members yet."
              columns={[
                {
                  key: "name",
                  label: "Member",
                  // The server already returns name/phone/email — this column
                  // used to show an 8-character slice of the UUID instead.
                  render: (r) => (
                    <span>
                      <span className="text-ink font-medium">
                        {String(r.name ?? "Unnamed")}
                        {r.merchant_user_id === myId && <span className="text-ink-3 font-normal"> · you</span>}
                      </span>
                      <span className="block text-xs text-ink-3">{String(r.phone ?? "")}</span>
                    </span>
                  ),
                },
                { key: "role", label: "Role", render: (r) => <StatusPill value={r.role} /> },
                { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
                {
                  key: "__actions",
                  label: "",
                  render: (r) =>
                    canManage && shopId ? (
                      <MemberRowActions
                        member={r}
                        token={token}
                        shopId={shopId}
                        isSelf={r.merchant_user_id === myId}
                        onChanged={reload}
                      />
                    ) : null,
                },
              ]}
            />
          )}

          <h2 className="text-sm font-medium text-ink-3 mb-2 mt-6">Pending invites</h2>
          {invitesError && <ErrorBox text={invitesError} />}
          {!invitesError && invites === null && <p className="text-sm text-ink-3">Loading…</p>}
          {!invitesError && invites && (
            <DataTable
              rows={invites.invites.filter((i) => i.status === "PENDING")}
              emptyLabel="No invites pending."
              columns={[
                { key: "requested_to", label: "Phone" },
                { key: "role", label: "Role", render: (r) => <StatusPill value={r.role} /> },
                { key: "created_at", label: "Sent", render: (r) => dateLabel(r.created_at) },
              ]}
            />
          )}
        </>
      )}
    </div>
  );
}

function InviteForm({ token, shopId, onInvited }: { token: string; shopId: string; onInvited: () => void }) {
  const [phone, setPhone] = useState("+91");
  const [role, setRole] = useState<(typeof ROLES)[number]>("STAFF");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/shops/${shopId}/invites`, { method: "POST", token, body: { phone, role } });
      setPhone("+91");
      onInvited();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't send that invite.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-panel border border-line p-4 flex items-end gap-3 flex-wrap">
      {error && (
        <div className="w-full">
          <ErrorBox text={error} />
        </div>
      )}
      <TextField label="Invite by phone" value={phone} onChange={setPhone} />
      <label className="flex flex-col gap-1.5 mb-4">
        <span className="text-xs font-medium text-ink-3">Role</span>
        <Select value={role} onValueChange={(v) => setRole(v as (typeof ROLES)[number])}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <button
        type="button"
        disabled={busy || phone.length < 10}
        onClick={submit}
        className="h-10 px-4 rounded-row bg-ink text-surface font-medium text-sm disabled:opacity-40 hover:bg-ink-2 transition-colors mb-4"
      >
        {busy ? "Sending…" : "Send invite"}
      </button>
    </div>
  );
}

function MemberRowActions({
  member: m,
  token,
  shopId,
  isSelf,
  onChanged,
}: {
  member: Row;
  token: string;
  shopId: string;
  isSelf: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSelf, setConfirmSelf] = useState<(typeof ROLES)[number] | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function setRole(role: (typeof ROLES)[number]) {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/shops/${shopId}/members/${m.id}`, { method: "PATCH", token, body: { role } });
      setConfirmSelf(null);
      onChanged();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't update that.");
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/shops/${shopId}/members/${m.id}`, { method: "DELETE", token });
      onChanged();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't remove that member.");
      setBusy(false);
      setConfirmRemove(false);
    }
  }

  // Changing your own role can take away the permission you are using, and
  // removing yourself locks you out of the shop — both are one click away, so
  // both ask first.
  if (confirmSelf) {
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <span className="text-xs text-ink-2">
          Change your own role to {ROLE_LABEL[confirmSelf]}? You may lose access to this page.
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => setRole(confirmSelf)}
          className="text-xs text-danger font-medium hover:underline disabled:opacity-40"
        >
          Confirm
        </button>
        <button type="button" onClick={() => setConfirmSelf(null)} className="text-xs text-ink-3 hover:text-ink">
          Cancel
        </button>
      </span>
    );
  }

  if (confirmRemove) {
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <span className="text-xs text-ink-2">
          {isSelf ? "Remove yourself from this shop? You will lose access." : `Remove ${String(m.name ?? "this member")}?`}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={remove}
          className="text-xs text-danger font-medium hover:underline disabled:opacity-40"
        >
          Confirm
        </button>
        <button type="button" onClick={() => setConfirmRemove(false)} className="text-xs text-ink-3 hover:text-ink">
          Cancel
        </button>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      {error && <span className="text-xs text-danger">{error}</span>}
      <Select
        value={String(m.role)}
        onValueChange={(v) => {
          const next = v as (typeof ROLES)[number];
          if (next === String(m.role)) return;
          if (isSelf) setConfirmSelf(next);
          else setRole(next);
        }}
      >
        <SelectTrigger disabled={busy} className="h-7 px-2 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => (
            <SelectItem key={r} value={r}>
              {ROLE_LABEL[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        type="button"
        disabled={busy}
        onClick={() => setConfirmRemove(true)}
        className="text-xs text-danger font-medium hover:underline disabled:opacity-40"
      >
        Remove
      </button>
    </div>
  );
}

function MyInviteRow({ invite: i, token, onChanged }: { invite: Row; token: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function respond(accept: boolean) {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/invites/${i.id}/respond`, { method: "POST", token, body: { accept } });
      onChanged();
    } catch (err) {
      // Without this the failure was a silent no-op plus an unhandled rejection.
      setError(err instanceof PortalApiError ? err.message : "Couldn't respond to that invite.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-ink">
        Join <span className="font-medium">{String(i.shop_name ?? "a shop")}</span> as{" "}
        <span className="font-medium">{ROLE_LABEL[String(i.role)] ?? String(i.role)}</span>
        {error && <span className="block text-xs text-danger">{error}</span>}
      </span>
      <span className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => respond(true)}
          className="text-verified font-medium hover:underline disabled:opacity-40"
        >
          Accept
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => respond(false)}
          className="text-danger font-medium hover:underline disabled:opacity-40"
        >
          Decline
        </button>
      </span>
    </div>
  );
}

export function MerchantTeam() {
  return (
    <MerchantLayout>
      <TeamBody />
    </MerchantLayout>
  );
}
