import { useState } from "react";
import { AdminLayout } from "./Layout";
import { usePortalSession, usePortalQuery, portalFetch, decodeJwtSubject, PortalApiError, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";
import { ErrorBox, SubmitButton, TextField } from "../../components/AuthFormBits";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { enumLabel } from "../../lib/format";

const ROLES = ["SUPPORT", "ADMIN", "SUPER_ADMIN"] as const;

function AdminsBody() {
  const { session } = usePortalSession("admin");
  const token = session?.accessToken;
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error } = usePortalQuery<{ admins: Row[] }>("admin", token ? `/admins?r=${reloadKey}` : null, token);
  const reload = () => setReloadKey((k) => k + 1);
  const myId = token ? decodeJwtSubject(token) : null;

  const [adding, setAdding] = useState(false);
  const [phone, setPhone] = useState("+91");
  const [name, setName] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("SUPPORT");
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function addAdmin() {
    setAddError(null);
    setBusy(true);
    try {
      await portalFetch("admin", "/admins", { method: "POST", token, body: { phone, name, role } });
      setPhone("+91");
      setName("");
      setRole("SUPPORT");
      setAdding(false);
      reload();
    } catch (err) {
      setAddError(err instanceof PortalApiError ? err.message : "Couldn't add that admin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-semibold text-ink">Admins</h1>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="text-sm text-ink font-medium hover:underline shrink-0">
            + Add admin
          </button>
        )}
      </div>
      <p className="text-sm text-ink-3 mb-5">
        SUPPORT handles tickets. ADMIN adds operational visibility and verification. SUPER_ADMIN adds money, logs and
        account management.
      </p>

      {error && <ErrorBox text={error} />}

      {adding && (
        <div className="rounded-panel border border-line p-5 mb-5 max-w-md">
          {addError && <ErrorBox text={addError} />}
          <TextField label="Phone" value={phone} onChange={setPhone} />
          <TextField label="Name" value={name} onChange={setName} />
          <label className="flex flex-col gap-1.5 mb-4">
            <span className="text-xs font-medium text-ink-3">Tier</span>
            <Select value={role} onValueChange={(v) => setRole(v as (typeof ROLES)[number])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {enumLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="flex items-center gap-3">
            <SubmitButton busy={busy} disabled={!name || phone.length < 10} onClick={addAdmin}>
              Add admin
            </SubmitButton>
            <button type="button" onClick={() => setAdding(false)} className="text-sm text-ink-3 hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      )}

      {!error && data === null && <p className="text-sm text-ink-3">Loading…</p>}
      {!error && data && (
        <DataTable
          rows={data.admins}
          emptyLabel="No admins yet."
          columns={[
            {
              key: "name",
              label: "Name",
              render: (r) => (
                <span className="text-ink">
                  {String(r.name ?? "—")}
                  {r.id === myId && <span className="text-ink-3 text-xs"> · you</span>}
                </span>
              ),
            },
            { key: "phone", label: "Phone" },
            { key: "role", label: "Tier", render: (r) => <StatusPill value={r.role} /> },
            { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            {
              key: "__actions",
              label: "",
              render: (r) => (
                <AdminRowActions admin={r} token={token!} onChanged={reload} isSelf={r.id === myId} />
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

function AdminRowActions({
  admin: a,
  token,
  onChanged,
  isSelf,
}: {
  admin: Row;
  token: string;
  onChanged: () => void;
  isSelf: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Either "remove", or a role being demoted to — both need a deliberate second click. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const suspended = a.status === "SUSPENDED";

  async function setStatus(status: "ACTIVE" | "SUSPENDED") {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("admin", `/admins/${a.id}`, { method: "PATCH", token, body: { status } });
      onChanged();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't update that admin.");
      setBusy(false);
    }
  }

  async function setRole(role: (typeof ROLES)[number]) {
    setBusy(true);
    setError(null);
    setConfirming(null);
    try {
      await portalFetch("admin", `/admins/${a.id}`, { method: "PATCH", token, body: { role } });
      onChanged();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't update that admin.");
      setBusy(false);
    }
  }

  /** Changing your own role can cost you the page you are standing on, and
   *  removing yourself certainly does — neither should be one click. */
  function requestRole(role: string) {
    if (role === String(a.role)) return;
    if (isSelf) setConfirming(role);
    else setRole(role as (typeof ROLES)[number]);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    setConfirming(null);
    try {
      await portalFetch("admin", `/admins/${a.id}`, { method: "DELETE", token });
      onChanged();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't remove that admin.");
      setBusy(false);
    }
  }

  if (confirming === "remove") {
    return (
      <ConfirmRow
        text={isSelf ? "Remove your own account? You will be signed out." : `Remove ${String(a.name ?? "this admin")}?`}
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirming(null)}
      />
    );
  }

  if (confirming) {
    return (
      <ConfirmRow
        text={`Change your own tier to ${enumLabel(confirming)}? You may lose access to this page.`}
        busy={busy}
        onConfirm={() => setRole(confirming as (typeof ROLES)[number])}
        onCancel={() => setConfirming(null)}
      />
    );
  }

  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      {error && <span className="text-xs text-danger">{error}</span>}
      <Select value={String(a.role)} onValueChange={(v) => requestRole(v)}>
        <SelectTrigger disabled={busy} className="h-7 px-2 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => (
            <SelectItem key={r} value={r}>
              {enumLabel(r)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        type="button"
        disabled={busy}
        onClick={() => setStatus(suspended ? "ACTIVE" : "SUSPENDED")}
        className="text-xs text-amber-edge font-medium hover:underline disabled:opacity-40"
      >
        {suspended ? "Reactivate" : "Suspend"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => setConfirming("remove")}
        className="text-xs text-danger font-medium hover:underline disabled:opacity-40"
      >
        Remove
      </button>
    </div>
  );
}

function ConfirmRow({
  text,
  busy,
  onConfirm,
  onCancel,
}: {
  text: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="text-ink-2">{text}</span>
      <button
        type="button"
        disabled={busy}
        onClick={onConfirm}
        className="text-danger font-medium hover:underline disabled:opacity-40"
      >
        Confirm
      </button>
      <button type="button" onClick={onCancel} className="text-ink-3 hover:text-ink">
        Cancel
      </button>
    </span>
  );
}

export function AdminAdmins() {
  return (
    <AdminLayout>
      <AdminsBody />
    </AdminLayout>
  );
}
