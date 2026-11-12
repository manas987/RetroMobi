import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AdminLayout } from "./Layout";
import { usePortalSession, usePortalQuery, portalFetch, PortalApiError, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";
import { ErrorBox, SubmitButton, TextField } from "../../components/AuthFormBits";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { dateLabel } from "../../lib/format";

/**
 * Which vehicles a Rent-a-Motorcycle licence names. A vehicle may only
 * lawfully be rented when its registration number appears on the merchant's
 * licence, and this is the only surface that records that — the endpoints
 * existed with no UI at all.
 *
 * The link supplies the licence badge. An expired linked licence hides the
 * vehicle from public inventory and blocks online booking.
 */
function LicenceVehiclesBody() {
  const { session } = usePortalSession("admin");
  const token = session?.accessToken;
  const [selected, setSelected] = useState<Row | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const query = new URLSearchParams();
  if (q.trim()) query.set("q", q.trim());
  if (status) query.set("status", status);

  const { data, error } = usePortalQuery<{ licences: Row[] }>(
    "admin",
    token ? `/licences?${query.toString()}` : null,
    token,
  );

  if (selected && token) {
    return <LicenceDetail licence={selected} token={token} onBack={() => setSelected(null)} />;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1">Licensed vehicles</h1>
      <p className="text-sm text-ink-3 mb-5">
        A vehicle may only be rented when its registration number is named on the merchant's Rent-a-Motorcycle
        licence. Pick a licence to see and change what it covers.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div className="w-64">
          <TextField label="Search licence or holder" value={q} onChange={setQ} />
        </div>
        <div className="flex gap-1.5 mb-4">
          {["", "ACTIVE", "PENDING", "EXPIRED", "REJECTED"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                status === s ? "bg-ink text-surface" : "bg-surface border border-line-strong text-ink-2"
              }`}
            >
              {s === "" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorBox text={error} />}
      {!error && data === null && <p className="text-sm text-ink-3">Loading…</p>}
      {!error && data && (
        <DataTable
          rows={data.licences}
          emptyLabel="No licences on record."
          columns={[
            {
              key: "licence_number",
              label: "Licence",
              render: (r) => <span className="text-ink font-medium">{String(r.licence_number)}</span>,
            },
            { key: "merchant_name", label: "Holder" },
            { key: "issuing_authority", label: "Authority" },
            {
              key: "shops",
              label: "Branches",
              render: (r) => {
                const shops = (r.shops ?? []) as { name?: string }[];
                if (!Array.isArray(shops) || shops.length === 0) {
                  return <span className="text-ink-4">None linked</span>;
                }
                return shops.map((s) => s.name).join(", ");
              },
            },
            {
              key: "vehicle_count",
              label: "Vehicles",
              render: (r) => <span className="tabular-nums">{String(r.vehicle_count ?? 0)}</span>,
            },
            { key: "expires_at", label: "Expires", render: (r) => dateLabel(r.expires_at) },
            { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            {
              key: "__open",
              label: "",
              render: (r) => (
                <button
                  type="button"
                  onClick={() => setSelected(r)}
                  className="text-xs font-medium text-ink hover:underline"
                >
                  Manage vehicles
                </button>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

function LicenceDetail({ licence, token, onBack }: { licence: Row; token: string; onBack: () => void }) {
  const licenceId = String(licence.id);
  const [reloadKey, setReloadKey] = useState(0);
  // The envelope key here is literally `rows`, not `vehicles`.
  const { data, error } = usePortalQuery<{ rows: Row[] }>(
    "admin",
    `/licences/${licenceId}/vehicles?r=${reloadKey}`,
    token,
  );
  const [linking, setLinking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = () => setReloadKey((k) => k + 1);
  const linked = data?.rows ?? [];

  async function unlink(linkId: string) {
    setActionError(null);
    try {
      await portalFetch("admin", `/licence-vehicles/${linkId}`, { method: "DELETE", token });
      reload();
    } catch (err) {
      setActionError(err instanceof PortalApiError ? err.message : "Couldn't remove that vehicle.");
    }
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> All licences
      </button>

      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-xl font-semibold text-ink">{String(licence.licence_number)}</h1>
        <StatusPill value={licence.status} />
      </div>
      <p className="text-sm text-ink-3 mb-5">
        {String(licence.merchant_name ?? "Unknown holder")}
        {licence.issuing_authority ? ` · ${String(licence.issuing_authority)}` : ""}
        {licence.expires_at ? ` · valid to ${dateLabel(licence.expires_at)}` : ""}
      </p>

      {licence.status !== "ACTIVE" && (
        <p className="text-sm text-warning bg-warning-soft rounded-row px-3 py-2 mb-4">
          This licence is not active, so the vehicles below are not covered by a valid licence.
        </p>
      )}

      {actionError && <ErrorBox text={actionError} />}
      {error && <ErrorBox text={error} />}

      {!error && data === null && <p className="text-sm text-ink-3">Loading…</p>}
      {!error && data && (
        <DataTable
          rows={linked}
          emptyLabel="No vehicles named on this licence yet."
          columns={[
            {
              key: "registration_number",
              label: "Registration",
              render: (r) => <span className="text-ink font-medium">{String(r.registration_number)}</span>,
            },
            { key: "added_at", label: "Added", render: (r) => dateLabel(r.added_at) },
            {
              key: "__actions",
              label: "",
              render: (r) => (
                <button
                  type="button"
                  onClick={() => unlink(String(r.id))}
                  className="text-xs text-danger font-medium hover:underline"
                >
                  Remove
                </button>
              ),
            },
          ]}
        />
      )}

      <div className="mt-5">
        {linking ? (
          <LinkVehicleForm
            licenceId={licenceId}
            token={token}
            onDone={() => {
              setLinking(false);
              reload();
            }}
            onCancel={() => setLinking(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setLinking(true)}
            className="text-sm text-ink font-medium hover:underline"
          >
            + Name a vehicle on this licence
          </button>
        )}
      </div>
    </div>
  );
}

function LinkVehicleForm({
  licenceId,
  token,
  onDone,
  onCancel,
}: {
  licenceId: string;
  token: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  // The admin vehicle list has no make/model join, so a vehicle is identified
  // by its registration number here.
  const { data, error } = usePortalQuery<{ vehicles: Row[] }>("admin", "/vehicles?limit=100", token);
  const [vehicleId, setVehicleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const vehicles = data?.vehicles ?? [];
  const chosen = vehicles.find((v) => String(v.id) === vehicleId);

  async function link() {
    if (!chosen) return;
    setBusy(true);
    setLinkError(null);
    try {
      await portalFetch("admin", `/licences/${licenceId}/vehicles`, {
        method: "POST",
        token,
        // Sent from the vehicle row rather than typed: the server stores this
        // denormalised and never cross-checks it against the vehicle, so a
        // typo here would be recorded as fact on a legal record.
        body: { vehicleId, registrationNumber: String(chosen.registration_number) },
      });
      onDone();
    } catch (err) {
      if (err instanceof PortalApiError && err.status === 409) {
        setLinkError(
          "That vehicle is already named on a licence. A vehicle can be on only one licence at a time — remove the existing link first.",
        );
      } else {
        setLinkError(err instanceof PortalApiError ? err.message : "Couldn't add that vehicle.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-panel border border-line p-5 max-w-md">
      <h2 className="font-semibold text-ink text-sm mb-3">Name a vehicle on this licence</h2>

      {error && <ErrorBox text={error} />}
      {linkError && <ErrorBox text={linkError} />}

      <label className="flex flex-col gap-1.5 mb-4">
        <span className="text-xs font-medium text-ink-3">Vehicle</span>
        <Select value={vehicleId} onValueChange={setVehicleId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a vehicle…" />
          </SelectTrigger>
          <SelectContent>
            {vehicles.map((v) => (
              <SelectItem key={String(v.id)} value={String(v.id)}>
                {String(v.registration_number)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <div className="flex items-center gap-3">
        <SubmitButton busy={busy} disabled={!vehicleId} onClick={link}>
          Add to licence
        </SubmitButton>
        <button type="button" onClick={onCancel} className="text-sm text-ink-3 hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function AdminLicenceVehicles() {
  return (
    <AdminLayout>
      <LicenceVehiclesBody />
    </AdminLayout>
  );
}
