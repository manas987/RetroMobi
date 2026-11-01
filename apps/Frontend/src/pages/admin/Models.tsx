import { useState } from "react";
import { AdminLayout } from "./Layout";
import { usePortalQuery, usePortalSession, portalFetch, PortalApiError, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";
import { ErrorBox, SubmitButton, TextField } from "../../components/AuthFormBits";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { enumLabel } from "../../lib/format";
import { uploadFile, UploadFailedError } from "../../lib/upload";

function ModelsBody() {
  const { session } = usePortalSession("admin");
  const token = session?.accessToken;
  const [reloadKey, setReloadKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [q, setQ] = useState("");
  // "" = all. The server now takes a strict "true"/"false", so an empty
  // string has to be left out of the query rather than sent through.
  const [isActive, setIsActive] = useState("");

  const query = new URLSearchParams({ r: String(reloadKey) });
  if (q.trim()) query.set("q", q.trim());
  if (isActive) query.set("isActive", isActive);

  const { data, error } = usePortalQuery<{ models: Row[] }>(
    "admin",
    token ? `/models?${query.toString()}` : null,
    token,
  );
  const reload = () => setReloadKey((k) => k + 1);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-semibold text-ink">Vehicle models</h1>
        {!adding && !editing && (
          <button type="button" onClick={() => setAdding(true)} className="text-sm text-ink font-medium hover:underline shrink-0">
            + Add model
          </button>
        )}
      </div>
      <p className="text-sm text-ink-3 mb-5">The shared catalog every merchant picks from when adding a vehicle.</p>

      {adding && (
        <ModelForm
          token={token!}
          onDone={() => {
            setAdding(false);
            reload();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {editing && (
        <ModelForm
          token={token!}
          model={editing}
          onDone={() => {
            setEditing(null);
            reload();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div className="w-64">
          <TextField label="Search make or model" value={q} onChange={setQ} />
        </div>
        <div className="flex gap-1.5 mb-4">
          {[
            { value: "", label: "All" },
            { value: "true", label: "Active" },
            { value: "false", label: "Deactivated" },
          ].map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setIsActive(f.value)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                isActive === f.value ? "bg-ink text-surface" : "bg-surface border border-line-strong text-ink-2"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorBox text={error} />}
      {!error && data === null && <p className="text-sm text-ink-3">Loading…</p>}
      {!error && data && (
        <DataTable
          rows={data.models}
          emptyLabel="No models match."
          columns={[
            { key: "make", label: "Make" },
            { key: "model", label: "Model" },
            { key: "class", label: "Class", render: (r) => (r.class ? enumLabel(r.class) : "—") },
            { key: "fuel_type", label: "Fuel", render: (r) => enumLabel(r.fuel_type) },
            { key: "body_type", label: "Body", render: (r) => enumLabel(r.body_type) },
            { key: "engine_cc", label: "Engine", render: (r) => (r.engine_cc ? `${String(r.engine_cc)} cc` : "—") },
            { key: "seating_capacity", label: "Seats" },
            { key: "is_active", label: "Active", render: (r) => <StatusPill value={r.is_active ? "ACTIVE" : "INACTIVE"} /> },
            {
              key: "__actions",
              label: "",
              render: (r) => (
                <ModelRowActions model={r} token={token!} onChanged={reload} onEdit={() => setEditing(r)} />
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

function ModelRowActions({
  model: m,
  token,
  onChanged,
  onEdit,
}: {
  model: Row;
  token: string;
  onChanged: () => void;
  onEdit: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = Boolean(m.is_active);

  /** DELETE is a deactivate, not a delete — `vehicles.model_id` is ON DELETE
   *  RESTRICT, so a model in use can never actually be removed. */
  async function setActive(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (next) {
        await portalFetch("admin", `/models/${m.id}`, { method: "PATCH", token, body: { isActive: true } });
      } else {
        await portalFetch("admin", `/models/${m.id}`, { method: "DELETE", token });
      }
      onChanged();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't update that model.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file: File) {
    setBusy(true);
    setError(null);
    try {
      await uploadFile({
        portal: "admin",
        token,
        file,
        presignPath: `/models/${m.id}/image/upload`,
        confirmPath: `/models/${m.id}/image/confirm`,
      });
      onChanged();
    } catch (err) {
      if (err instanceof UploadFailedError || err instanceof PortalApiError) setError(err.message);
      else setError("Couldn't upload that photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      {error && <span className="text-xs text-danger">{error}</span>}
      <button type="button" disabled={busy} onClick={onEdit} className="text-xs font-medium text-ink hover:underline disabled:opacity-40">
        Edit
      </button>
      <label className="text-xs font-medium text-ink hover:underline cursor-pointer">
        {m.image_key ? "Replace photo" : "Add photo"}
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
      {active ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => setActive(false)}
          className="text-xs text-danger font-medium hover:underline disabled:opacity-40"
        >
          Deactivate
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => setActive(true)}
          className="text-xs text-verified font-medium hover:underline disabled:opacity-40"
        >
          Reactivate
        </button>
      )}
    </div>
  );
}

const BODY_TYPES = ["SCOOTER", "MOTORCYCLE"];

/** One form for both create and edit — the field set is identical, only the
 *  verb differs, so a second near-identical form would be the only thing a
 *  separate edit component added. */
function ModelForm({
  token,
  model,
  onDone,
  onCancel,
}: {
  token: string;
  model?: Row;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [make, setMake] = useState(String(model?.make ?? ""));
  const [modelName, setModelName] = useState(String(model?.model ?? ""));
  const [fuelType, setFuelType] = useState<"PETROL" | "ELECTRIC">(
    (model?.fuel_type as "PETROL" | "ELECTRIC") ?? "PETROL",
  );
  const [bodyType, setBodyType] = useState(String(model?.body_type ?? "SCOOTER"));
  const [vehicleClass, setVehicleClass] = useState(String(model?.class ?? ""));
  const [engineCc, setEngineCc] = useState(model?.engine_cc != null ? String(model.engine_cc) : "");
  const [seatingCapacity, setSeatingCapacity] = useState(
    model?.seating_capacity != null ? String(model.seating_capacity) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editing = model != null;
  // An electric model has no engine capacity, so the field is meaningless
  // there rather than merely blank.
  const electric = fuelType === "ELECTRIC";

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      // Optional fields are omitted when blank rather than sent as "" — the
      // schema wants a number or nothing, and "" is neither.
      const body: Record<string, unknown> = { make: make.trim(), model: modelName.trim(), fuelType, bodyType };
      if (vehicleClass.trim()) body.class = vehicleClass.trim();
      if (!electric && engineCc.trim()) body.engineCc = Number(engineCc);
      if (seatingCapacity.trim()) body.seatingCapacity = Number(seatingCapacity);

      await portalFetch("admin", editing ? `/models/${model.id}` : "/models", {
        method: editing ? "PATCH" : "POST",
        token,
        body,
      });
      onDone();
    } catch (err) {
      if (err instanceof PortalApiError && err.status === 409) {
        setError(`A model called "${make.trim()} ${modelName.trim()}" already exists.`);
      } else {
        setError(err instanceof PortalApiError ? err.message : "Couldn't save that model.");
      }
    } finally {
      setBusy(false);
    }
  }

  const numericInvalid =
    (engineCc.trim() !== "" && !(Number(engineCc) > 0)) ||
    (seatingCapacity.trim() !== "" && !(Number(seatingCapacity) > 0));

  return (
    <div className="rounded-panel border border-line p-5 mb-5 max-w-md">
      <h2 className="font-semibold text-ink text-sm mb-3">{editing ? "Edit model" : "New model"}</h2>
      {error && <ErrorBox text={error} />}
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Make" value={make} onChange={setMake} autoFocus />
        <TextField label="Model" value={modelName} onChange={setModelName} />
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-3">Fuel type</span>
          <Select value={fuelType} onValueChange={(v) => setFuelType(v as "PETROL" | "ELECTRIC")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PETROL">Petrol</SelectItem>
              <SelectItem value="ELECTRIC">Electric</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-3">Body type</span>
          <Select value={bodyType} onValueChange={setBodyType}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BODY_TYPES.map((b) => (
                <SelectItem key={b} value={b}>
                  {enumLabel(b)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
      <TextField label="Class (optional)" value={vehicleClass} onChange={setVehicleClass} />
      <div className="grid grid-cols-2 gap-3">
        {!electric && (
          <TextField label="Engine (cc, optional)" type="number" value={engineCc} onChange={setEngineCc} />
        )}
        <TextField label="Seats (optional)" type="number" value={seatingCapacity} onChange={setSeatingCapacity} />
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton busy={busy} disabled={!make.trim() || !modelName.trim() || numericInvalid} onClick={submit}>
          {editing ? "Save changes" : "Add model"}
        </SubmitButton>
        <button type="button" onClick={onCancel} className="text-sm text-ink-3 hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function AdminModels() {
  return (
    <AdminLayout>
      <ModelsBody />
    </AdminLayout>
  );
}
