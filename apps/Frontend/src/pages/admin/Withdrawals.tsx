import { useState } from "react";
import { AdminLayout } from "./Layout";
import { usePortalQuery, usePortalSession, portalFetch, PortalApiError, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";
import { ErrorBox, SubmitButton, TextField } from "../../components/AuthFormBits";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { dateLabel, rupees } from "../../lib/format";

// Merchants' wallet withdrawals (Routes/admin/Withdrawals). Pay one through
// Cashfree Payouts, or record money already sent offline -- bank transfer,
// UPI or cash -- with its reference. Rejecting returns the money to the wallet.

const STATUSES = ["REQUESTED", "PROCESSING", "PAID", "FAILED", "REJECTED", ""] as const;
const METHODS = [
  ["CASHFREE_PAYOUT", "Cashfree Payouts (to their verified bank account)"],
  ["BANK_TRANSFER", "Bank transfer (sent outside the platform)"],
  ["UPI", "UPI (sent outside the platform)"],
  ["CASH", "Cash"],
  ["OTHER", "Other"],
] as const;

function WithdrawalsBody() {
  const { session } = usePortalSession("admin");
  const token = session?.accessToken;
  const [status, setStatus] = useState<string>("REQUESTED");
  const [reloadKey, setReloadKey] = useState(0);
  const [settling, setSettling] = useState<Row | null>(null);
  const query = new URLSearchParams({ r: String(reloadKey) });
  if (status) query.set("status", status);
  const { data, error } = usePortalQuery<{ withdrawals: Row[] }>("admin", token ? `/withdrawals?${query}` : null, token);
  const reload = () => {
    setSettling(null);
    setReloadKey((k) => k + 1);
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1">Withdrawals</h1>
      <p className="text-sm text-ink-3 mb-5">
        Shops ask to withdraw from their wallet. A request already holds the money, so the shop can't ask for it twice.
      </p>

      <div className="flex flex-wrap gap-2 mb-5">
        {STATUSES.map((s) => (
          <button
            key={s || "all"}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${status === s ? "border-ink bg-ink text-surface" : "border-line text-ink-2 hover:border-ink"}`}
          >
            {s ? s.charAt(0) + s.slice(1).toLowerCase() : "All"}
          </button>
        ))}
      </div>

      {settling && <SettleForm withdrawal={settling} token={token!} onDone={reload} onCancel={() => setSettling(null)} />}

      {error && <ErrorBox text={error} />}
      {!error && data === null && <p className="text-sm text-ink-3">Loading…</p>}
      {!error && data && (
        <DataTable
          rows={data.withdrawals}
          emptyLabel="Nothing here."
          columns={[
            { key: "created_at", label: "Asked", render: (r) => dateLabel(r.created_at) },
            { key: "shop_name", label: "Shop", render: (r) => <span className="text-ink font-medium">{String(r.shop_name)}</span> },
            { key: "amount", label: "Amount", render: (r) => <span className="tabular-nums">{rupees(Number(r.amount))}</span> },
            {
              key: "pay_to",
              label: "Pay to",
              render: (r) => (
                <span className="text-xs">
                  {r.pay_to ? String(r.pay_to) : null}
                  {r.account_last4 ? (
                    <span className="block text-ink-3">
                      Bank •••• {String(r.account_last4)} · {String(r.ifsc ?? "")} ({String(r.payout_account_status ?? "")})
                    </span>
                  ) : null}
                </span>
              ),
            },
            { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            {
              key: "reference",
              label: "Paid via",
              render: (r) =>
                r.method ? (
                  <span className="text-xs">
                    {String(r.method)}
                    {r.reference ? ` · ${String(r.reference)}` : ""}
                    {r.last_error ? <span className="block text-danger">{String(r.last_error)}</span> : null}
                  </span>
                ) : null,
            },
            {
              key: "__actions",
              label: "",
              render: (r) =>
                r.status === "REQUESTED" ? (
                  <button type="button" onClick={() => setSettling(r)} className="text-xs font-medium text-ink hover:underline">
                    Pay or reject
                  </button>
                ) : null,
            },
          ]}
        />
      )}
    </div>
  );
}

function SettleForm({ withdrawal: w, token, onDone, onCancel }: { withdrawal: Row; token: string; onDone: () => void; onCancel: () => void }) {
  const [method, setMethod] = useState<string>(w.payout_account_status === "VERIFIED" ? "CASHFREE_PAYOUT" : "UPI");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offline = method !== "CASHFREE_PAYOUT";

  async function post(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("admin", `/withdrawals/${w.id}/${path}`, { method: "POST", token, body });
      onDone();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't save that.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-panel border border-line p-5 mb-5 max-w-md">
      <p className="text-sm text-ink mb-4">
        <span className="font-semibold">{rupees(Number(w.amount))}</span> to {String(w.shop_name)}
      </p>
      {error && <ErrorBox text={error} />}
      <label className="flex flex-col gap-1.5 mb-4">
        <span className="text-xs font-medium text-ink-3">How it's paid</span>
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METHODS.map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      {offline && <TextField label="Reference (UTR, UPI ref or receipt no.)" value={reference} onChange={setReference} />}
      <TextField label="Note (optional)" value={note} onChange={setNote} />
      <div className="flex items-center gap-3 mb-6">
        <SubmitButton
          busy={busy}
          disabled={offline && reference.trim().length < 3}
          onClick={() => post("pay", { method, ...(offline ? { reference: reference.trim() } : {}), ...(note.trim() ? { note: note.trim() } : {}) })}
        >
          {offline ? "Record as paid" : "Send through Cashfree"}
        </SubmitButton>
        <button type="button" onClick={onCancel} className="text-sm text-ink-3 hover:text-ink">Cancel</button>
      </div>
      <TextField label="Or reject, with a reason the shop will see" value={reason} onChange={setReason} />
      <button
        type="button"
        disabled={busy || reason.trim().length < 3}
        onClick={() => post("reject", { reason: reason.trim() })}
        className="text-sm text-danger font-medium hover:underline disabled:opacity-40"
      >
        Reject and return the money to the wallet
      </button>
    </div>
  );
}

export function AdminWithdrawals() {
  return (
    <AdminLayout>
      <WithdrawalsBody />
    </AdminLayout>
  );
}
