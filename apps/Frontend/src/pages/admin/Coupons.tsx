import { useState } from "react";
import { AdminLayout } from "./Layout";
import { usePortalQuery, usePortalSession, portalFetch, PortalApiError, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";
import { ErrorBox, SubmitButton, TextField } from "../../components/AuthFormBits";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { dateLabel, enumLabel, rupees } from "../../lib/format";

function CouponsBody() {
  const { session } = usePortalSession("admin");
  const token = session?.accessToken;
  const [reloadKey, setReloadKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const { data, error } = usePortalQuery<{ coupons: Row[] }>("admin", token ? `/coupons?r=${reloadKey}` : null, token);
  const reload = () => setReloadKey((k) => k + 1);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-semibold text-ink">Coupons</h1>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="text-sm text-ink font-medium hover:underline shrink-0">
            + New coupon
          </button>
        )}
      </div>
      <p className="text-sm text-ink-3 mb-5">
        Platform-wide discount codes applied at checkout. The expiry and use cap are fixed at creation — to change
        either, pause this code and create a replacement.
      </p>

      {adding && <AddCouponForm token={token!} onCreated={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} />}

      {error && <ErrorBox text={error} />}
      {!error && data === null && <p className="text-sm text-ink-3">Loading…</p>}
      {!error && data && (
        <DataTable
          rows={data.coupons}
          emptyLabel="No coupons yet."
          columns={[
            { key: "code", label: "Code", render: (r) => <span className="text-ink font-medium">{String(r.code)}</span> },
            { key: "type", label: "Type", render: (r) => enumLabel(r.type) },
            { key: "value", label: "Value", render: (r) => (r.type === "PERCENT" ? `${r.value}%` : rupees(Number(r.value))) },
            {
              key: "used_count",
              label: "Used",
              // `max_uses` was fetched and never shown, so "3" had no denominator.
              render: (r) => (
                <span className="tabular-nums">
                  {String(r.used_count ?? 0)}
                  {r.max_uses != null ? ` / ${String(r.max_uses)}` : " / ∞"}
                </span>
              ),
            },
            { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            // valid_until is a timestamptz but means a day, so the generic
            // formatter printed a time nobody set under a header reading
            // "Expires".
            { key: "valid_until", label: "Expires", render: (r) => dateLabel(r.valid_until) },
            {
              key: "__actions",
              label: "",
              render: (r) => <CouponRowActions coupon={r} token={token!} onChanged={reload} />,
            },
          ]}
        />
      )}
    </div>
  );
}

function CouponRowActions({ coupon: c, token, onChanged }: { coupon: Row; token: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const active = c.status === "ACTIVE";

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("admin", `/coupons/${c.id}`, { method: "PATCH", token, body: { status: active ? "PAUSED" : "ACTIVE" } });
      onChanged();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't update that.");
      setBusy(false);
    }
  }

  /**
   * Soft keeps the row, so the code stays taken against the unique index on
   * `coupons.code` and every booking that used it keeps its reference. Hard
   * frees the code, but `booking_groups.coupon_id` is ON DELETE SET NULL, so
   * those bookings silently lose which coupon they used — and the server only
   * permits it while `used_count` is 0.
   */
  async function remove(hard: boolean) {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("admin", `/coupons/${c.id}${hard ? "/hard" : ""}`, { method: "DELETE", token });
      onChanged();
    } catch (err) {
      if (err instanceof PortalApiError && err.status === 409) {
        setError("Already used by a booking — pause or soft-delete it instead.");
      } else {
        setError(err instanceof PortalApiError ? err.message : "Couldn't remove that.");
      }
      setBusy(false);
      setConfirming(false);
    }
  }

  const used = Number(c.used_count ?? 0) > 0;

  if (confirming) {
    return (
      <div className="flex flex-col gap-1.5 text-xs">
        {error && <span className="text-danger">{error}</span>}
        <button
          type="button"
          disabled={busy}
          onClick={() => remove(false)}
          className="text-left text-danger font-medium hover:underline disabled:opacity-40"
        >
          Hide it — keeps the history, code stays reserved
        </button>
        {used ? (
          <span className="text-ink-4">Can't purge: already used by a booking.</span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => remove(true)}
            className="text-left text-danger font-medium hover:underline disabled:opacity-40"
          >
            Purge it — frees the code to reuse, erases it from any booking
          </button>
        )}
        <button type="button" onClick={() => setConfirming(false)} className="text-left text-ink-3 hover:text-ink">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      {error && <span className="text-xs text-danger">{error}</span>}
      <button type="button" disabled={busy} onClick={toggle} className="text-xs font-medium text-ink hover:underline disabled:opacity-40">
        {active ? "Pause" : "Activate"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => setConfirming(true)}
        className="text-xs text-danger font-medium hover:underline disabled:opacity-40"
      >
        Remove
      </button>
    </div>
  );
}

function AddCouponForm({ token, onCreated, onCancel }: { token: string; onCreated: () => void; onCancel: () => void }) {
  const [code, setCode] = useState("");
  const [type, setType] = useState<"PERCENT" | "FLAT">("PERCENT");
  const [value, setValue] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("admin", "/coupons", {
        method: "POST",
        token,
        body: {
          code: code.toUpperCase(),
          type,
          value: type === "PERCENT" ? Number(value) : Math.round(Number(value) * 100),
          validFrom: new Date().toISOString(),
          validUntil: new Date(validUntil).toISOString(),
          maxUses: maxUses ? Number(maxUses) : undefined,
        },
      });
      onCreated();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't create that coupon.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-panel border border-line p-5 mb-5 max-w-md">
      {error && <ErrorBox text={error} />}
      <TextField label="Code" value={code} onChange={setCode} autoFocus />
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 mb-4">
          <span className="text-xs font-medium text-ink-3">Type</span>
          <Select value={type} onValueChange={(v) => setType(v as "PERCENT" | "FLAT")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PERCENT">Percent off</SelectItem>
              <SelectItem value="FLAT">Flat amount (₹)</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <TextField label={type === "PERCENT" ? "Percent (0-100)" : "Amount (₹)"} type="number" value={value} onChange={setValue} />
      </div>
      <TextField label="Valid until" type="date" value={validUntil} onChange={setValidUntil} />
      <TextField label="Max uses (optional)" type="number" value={maxUses} onChange={setMaxUses} />
      <div className="flex items-center gap-3">
        <SubmitButton busy={busy} disabled={!code || !value || !validUntil} onClick={submit}>
          Create coupon
        </SubmitButton>
        <button type="button" onClick={onCancel} className="text-sm text-ink-3 hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function AdminCoupons() {
  return (
    <AdminLayout>
      <CouponsBody />
    </AdminLayout>
  );
}
