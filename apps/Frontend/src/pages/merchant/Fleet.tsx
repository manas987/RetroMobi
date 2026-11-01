import { useState } from "react";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { usePortalQuery, portalFetch, PortalApiError, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";
import { ErrorBox, SubmitButton, TextField } from "../../components/AuthFormBits";
import { rupees } from "../../lib/format";
import { uploadFile, UploadFailedError } from "../../lib/upload";
import { Toggle } from "../../components/Toggle";
import { Modal } from "../../components/Modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Globe } from "lucide-react";
import { VehiclePanel } from "./VehiclePanel";

function FleetBody() {
  const { token, shopId, can } = useMerchantShop();
  const canWrite = can("fleet:write");
  const [reloadKey, setReloadKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const [panelVehicle, setPanelVehicle] = useState<Row | null>(null);
  const { data, error } = usePortalQuery<{ vehicles: Row[] }>(
    "merchant",
    shopId ? `/shops/${shopId}/vehicles?r=${reloadKey}` : null,
    token,
  );
  const reload = () => setReloadKey((k) => k + 1);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-semibold text-ink">Fleet</h1>
        {!adding && canWrite && (
          <button type="button" onClick={() => setAdding(true)} className="text-sm text-ink font-medium hover:underline shrink-0">
            + Add vehicle
          </button>
        )}
      </div>
      <p className="text-sm text-ink-3 mb-5">
        {canWrite
          ? "Vehicles at this shop, their listing status and verification."
          : "Vehicles at this shop. Your role can view the fleet but not change it."}
      </p>

      {data && data.vehicles.length > 0 && <ListingSummary vehicles={data.vehicles} />}

      {shopId && (
        <Modal open={adding} onClose={() => setAdding(false)} title="Add vehicle">
          <AddVehicleForm
            token={token}
            shopId={shopId}
            onCreated={() => {
              setAdding(false);
              reload();
            }}
            onCancel={() => setAdding(false)}
          />
        </Modal>
      )}

      {error && <ErrorBox text={error} />}
      {!error && data === null && <p className="text-sm text-ink-3">Loading…</p>}
      {!error && data && (
        <DataTable
          rows={data.vehicles}
          emptyLabel="No vehicles added to this shop yet."
          columns={[
            {
              key: "model",
              label: "Model",
              render: (r) => (
                <span className="text-ink font-medium">
                  {String(r.make ?? "")} {String(r.model ?? "")}
                </span>
              ),
            },
            { key: "registration_number", label: "Registration" },
            {
              key: "amount",
              label: "Per day",
              // A vehicle with no pricing row cannot be booked even while
              // listed, so an empty rate is worth showing loudly rather than
              // rendering as a dash.
              render: (r) =>
                r.amount == null ? (
                  <span className="text-danger text-xs font-medium">No rate set</span>
                ) : (
                  <span className="tabular-nums">{rupees(Number(r.amount))}</span>
                ),
            },
            {
              key: "status",
              label: "Listed",
              render: (r) =>
                canWrite ? (
                  <ListingToggle vehicle={r} token={token} onChanged={reload} />
                ) : (
                  <StatusPill value={r.status === "ACTIVE" ? "ACTIVE" : "INACTIVE"} />
                ),
            },
            { key: "verification_status", label: "Verification", render: (r) => <StatusPill value={r.verification_status} /> },
            {
              key: "__manage",
              label: "",
              render: (r) => (
                <button
                  type="button"
                  onClick={() => setPanelVehicle((prev) => (prev?.id === r.id ? null : r))}
                  className="text-xs font-medium text-ink hover:underline"
                >
                  Manage
                </button>
              ),
            },
            {
              key: "__actions",
              label: "",
              render: (r) =>
                canWrite ? <VehicleRowActions vehicle={r} token={token} onChanged={reload} /> : null,
            },
          ]}
        />
      )}

      {panelVehicle && (
        <VehiclePanel vehicle={panelVehicle} token={token} onClose={() => setPanelVehicle(null)} />
      )}
    </div>
  );
}

function VehicleRowActions({ vehicle: v, token, onChanged }: { vehicle: Row; token: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function uploadPhoto(file: File) {
    setBusy(true);
    setError(null);
    try {
      await uploadFile({
        portal: "merchant",
        token,
        file,
        presignPath: `/vehicles/${v.id}/media/upload`,
        confirmPath: `/vehicles/${v.id}/media/confirm`,
        confirmBody: { type: "IMAGE" },
      });
      onChanged();
    } catch (err) {
      setError(
        err instanceof UploadFailedError || err instanceof PortalApiError
          ? err.message
          : "Couldn't upload that photo.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/vehicles/${v.id}`, { method: "DELETE", token });
      onChanged();
    } catch (err) {
      // A vehicle physically out on rental must not vanish from the fleet it
      // is booked against, so the server refuses with a 409.
      setError(
        err instanceof PortalApiError && err.status === 409
          ? "This vehicle has a current or upcoming booking. Cancel or complete it first."
          : err instanceof PortalApiError
            ? err.message
            : "Couldn't remove that vehicle.",
      );
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <span className="text-xs text-ink-2">Remove {String(v.registration_number ?? "")}?</span>
        <button
          type="button"
          disabled={busy}
          onClick={remove}
          className="text-xs text-danger font-medium hover:underline disabled:opacity-40"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-xs text-ink-3 hover:text-ink"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      {error && <span className="text-xs text-danger">{error}</span>}
      <label className="text-xs font-medium text-ink hover:underline cursor-pointer">
        Add photo
        <input
          type="file"
          accept="image/*"
          disabled={busy}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadPhoto(file);
          }}
        />
      </label>
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

/**
 * `vehicles.status` is the marketplace toggle, not a service state — INACTIVE
 * is a vehicle the shop still manages here but customers never see. Stating
 * the count is the point: a merchant who added a vehicle and left it INACTIVE
 * has no way of knowing it is invisible.
 */
function ListingSummary({ vehicles }: { vehicles: Row[] }) {
  const listed = vehicles.filter((v) => v.status === "ACTIVE").length;
  const unlisted = vehicles.length - listed;

  return (
    <div className="rounded-panel border border-line bg-surface p-4 mb-5 flex items-start gap-3">
      <Globe className="h-4 w-4 text-ink-4 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink font-medium">
          {listed} of {vehicles.length} vehicle{vehicles.length === 1 ? "" : "s"} listed on RetroMobi
        </p>
        <p className="text-sm text-ink-3 mt-0.5">
          {unlisted > 0
            ? `${unlisted} ${unlisted === 1 ? "vehicle is" : "vehicles are"} managed here but hidden from riders searching your city. Listing costs nothing — you only pay the platform fee on a booking that completes.`
            : "Every vehicle is visible to riders searching your city. You only pay the platform fee on a booking that completes."}
        </p>
      </div>
    </div>
  );
}

function ListingToggle({ vehicle: v, token, onChanged }: { vehicle: Row; token: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listed = v.status === "ACTIVE";

  async function toggle(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/vehicles/${v.id}`, {
        method: "PATCH",
        token,
        body: { status: next ? "ACTIVE" : "INACTIVE" },
      });
      onChanged();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't update that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <Toggle
        checked={listed}
        disabled={busy}
        onChange={toggle}
        label={`List ${String(v.make ?? "")} ${String(v.registration_number ?? "")} on RetroMobi`}
      />
      <span className={`text-xs ${listed ? "text-verified font-medium" : "text-ink-3"}`}>
        {listed ? "Live" : "Hidden"}
      </span>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

function AddVehicleForm({ token, shopId, onCreated, onCancel }: { token: string; shopId: string; onCreated: () => void; onCancel: () => void }) {
  const { data: modelsRes } = usePortalQuery<{ models: Row[] }>("merchant", "/models", token);
  const [modelId, setModelId] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [color, setColor] = useState("");
  const [amount, setAmount] = useState("");
  const [weekendAmount, setWeekendAmount] = useState("");
  const [deposit, setDeposit] = useState("");
  // Was hardcoded to ₹50/hour on every vehicle ever added, with no way to
  // see or change it afterwards. It is a real charge, so it gets asked for.
  const [lateFee, setLateFee] = useState("50");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const vehicle = await portalFetch<Row>("merchant", `/shops/${shopId}/vehicles`, {
        method: "POST",
        token,
        body: { modelId, registrationNumber, color: color || undefined },
      });
      await portalFetch("merchant", `/vehicles/${vehicle.id}/pricing`, {
        method: "PUT",
        token,
        body: {
          amount: Math.round(Number(amount) * 100),
          weekendAmount: Math.round(Number(weekendAmount || amount) * 100),
          securityDepositAmount: Math.round(Number(deposit) * 100),
          lateFeeAmount: Math.round(Number(lateFee) * 100),
        },
      });
      onCreated();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't add that vehicle.");
    } finally {
      setBusy(false);
    }
  }

  const models = modelsRes?.models ?? [];
  // ₹10,000 is the UPI block limit the rider pays the deposit through, so the
  // server rejects more — say it here instead.
  const depositTooHigh = Number(deposit) > 10_000;
  const valid =
    modelId &&
    registrationNumber &&
    Number(amount) > 0 &&
    Number(deposit) >= 0 &&
    !depositTooHigh &&
    Number(lateFee) >= 0;

  return (
    <div>
      {error && <ErrorBox text={error} />}
      <label className="flex flex-col gap-1.5 mb-4">
        <span className="text-xs font-medium text-ink-3">Model</span>
        <Select value={modelId} onValueChange={setModelId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a model…" />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={String(m.id)} value={String(m.id)}>
                {String(m.make)} {String(m.model)} ({String(m.fuel_type)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <TextField label="Registration number" value={registrationNumber} onChange={setRegistrationNumber} />
      <TextField label="Colour (optional)" value={color} onChange={setColor} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Price / day (₹)" type="number" value={amount} onChange={setAmount} />
        <TextField label="Weekend price / day (₹, optional)" type="number" value={weekendAmount} onChange={setWeekendAmount} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Refundable deposit (₹)" type="number" value={deposit} onChange={setDeposit} />
        <TextField label="Late fee / hour (₹)" type="number" value={lateFee} onChange={setLateFee} />
      </div>
      {depositTooHigh && (
        <p className="text-xs text-danger -mt-2 mb-4">The deposit cannot exceed ₹10,000.</p>
      )}
      {amount && deposit && (
        <p className="text-xs text-ink-3 -mt-2 mb-4">{rupees(Math.round(Number(amount) * 100))} / day, {rupees(Math.round(Number(deposit) * 100))} deposit</p>
      )}
      <div className="flex items-center gap-3">
        <SubmitButton busy={busy} disabled={!valid} onClick={submit}>
          Add vehicle
        </SubmitButton>
        <button type="button" onClick={onCancel} className="text-sm text-ink-3 hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function MerchantFleet() {
  return (
    <MerchantLayout>
      <FleetBody />
    </MerchantLayout>
  );
}
