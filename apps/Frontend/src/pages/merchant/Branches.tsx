import { useEffect, useState } from "react";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { usePortalQuery, portalFetch, PortalApiError, type Row } from "../../lib/portal";
import { StatusPill } from "../../components/DataTable";
import { ErrorBox, SubmitButton, TextField } from "../../components/AuthFormBits";
import { Toggle } from "../../components/Toggle";
import { LocationPicker } from "../../components/LocationPicker";
import { Modal } from "../../components/Modal";
import { can, ROLE_LABEL } from "../../lib/permissions";

function BranchesBody() {
  const { token, shops, reloadShops } = useMerchantShop();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countErrors, setCountErrors] = useState<Record<string, true>>({});
  const [adding, setAdding] = useState(false);

  // ponytail: one request per branch. Fine at launch scale (a merchant has a
  // handful of branches); if that changes, the fix is a count on the shops
  // list server-side, not a cleverer client.
  useEffect(() => {
    let cancelled = false;
    for (const s of shops) {
      const id = String(s.id);
      portalFetch<{ vehicles: Row[] }>("merchant", `/shops/${id}/vehicles`, { token })
        .then((r) => {
          if (!cancelled) setCounts((c) => ({ ...c, [id]: r.vehicles.length }));
        })
        .catch(() => {
          // Was dropped entirely, so a failure showed "…" forever as if it
          // were still loading.
          if (!cancelled) setCountErrors((e) => ({ ...e, [id]: true }));
        });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shops, token]);

  // Licences are merchant-wide, so they load once here rather than per card.
  // The key refetches them after a branch link changes — each licence row
  // carries its covered branches, so the list is the source of truth for
  // which licence covers which card.
  const [licencesKey, setLicencesKey] = useState(0);
  const { data: licencesRes, error: licencesError } = usePortalQuery<{ licences: Row[] }>(
    "merchant",
    `/licences?r=${licencesKey}`,
    token,
  );

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-semibold text-ink">Branches</h1>
        <button type="button" onClick={() => setAdding(true)} className="text-sm text-ink font-medium hover:underline shrink-0">
          + Add branch
        </button>
      </div>
      <p className="text-sm text-ink-3 mb-6">Every shop this account is an active member of.</p>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add branch">
        <AddBranchForm
          token={token}
          onCreated={() => {
            setAdding(false);
            reloadShops();
          }}
          onCancel={() => setAdding(false)}
        />
      </Modal>

      {shops.length === 0 ? (
        <p className="text-sm text-ink-3 py-10 text-center bg-surface-2 rounded-panel">
          No branches yet. Add one to start listing vehicles.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {shops.map((s) => (
            <BranchCard
              key={String(s.id)}
              shop={s}
              token={token}
              vehicleCount={counts[String(s.id)]}
              countFailed={Boolean(countErrors[String(s.id)])}
              licences={licencesRes?.licences ?? []}
              licencesError={licencesError}
              onChanged={reloadShops}
              onLicencesChanged={() => setLicencesKey((k) => k + 1)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AddBranchForm({ token, onCreated, onCancel }: { token: string; onCreated: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("Uttarakhand");
  const [pincode, setPincode] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", "/shops", {
        method: "POST",
        token,
        body: { name, addressLine1, city, state, pincode, latitude: latitude ?? undefined, longitude: longitude ?? undefined },
      });
      onCreated();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't create that branch.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <ErrorBox text={error} />}
      <TextField label="Shop name" value={name} onChange={setName} autoFocus />
      <TextField label="Address" value={addressLine1} onChange={setAddressLine1} />
      <TextField label="City" value={city} onChange={setCity} />
      <TextField label="State" value={state} onChange={setState} />
      <TextField label="Pincode" value={pincode} onChange={setPincode} />
      <LocationPicker
        latitude={latitude}
        longitude={longitude}
        onChange={(lat, lng) => {
          setLatitude(lat);
          setLongitude(lng);
        }}
      />
      <div className="flex items-center gap-3">
        <SubmitButton busy={busy} disabled={!name || !addressLine1 || !city || !state || pincode.length !== 6} onClick={submit}>
          Create branch
        </SubmitButton>
        <button type="button" onClick={onCancel} className="text-sm text-ink-3 hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}

function BranchCard({
  shop: s,
  token,
  vehicleCount,
  countFailed,
  licences,
  licencesError,
  onChanged,
  onLicencesChanged,
}: {
  shop: Row;
  token: string;
  vehicleCount: number | undefined;
  countFailed: boolean;
  licences: Row[];
  licencesError: string | null;
  onChanged: () => void;
  onLicencesChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(String(s.name ?? ""));
  const [phone, setPhone] = useState(String(s.phone ?? ""));
  const [addressLine1, setAddressLine1] = useState(String(s.address_line1 ?? ""));
  const [city, setCity] = useState(String(s.city ?? ""));
  const [state, setState] = useState(String(s.state ?? ""));
  const [pincode, setPincode] = useState(String(s.pincode ?? ""));
  const [latitude, setLatitude] = useState<number | null>(s.latitude != null ? Number(s.latitude) : null);
  const [longitude, setLongitude] = useState<number | null>(s.longitude != null ? Number(s.longitude) : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingHours, setEditingHours] = useState(false);
  const [editingLicences, setEditingLicences] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // This card is one of several branches, each with its own membership — so
  // the gate is this shop's role, not the selected shop's role from context.
  const role = String(s.role ?? "");
  const canWrite = can(role, "shop:write");
  const canDelete = can(role, "shop:delete");

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/shops/${s.id}`, {
        method: "PATCH",
        token,
        body: {
          name,
          phone: phone || undefined,
          addressLine1,
          city,
          state,
          pincode,
          latitude: latitude ?? undefined,
          longitude: longitude ?? undefined,
        },
      });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(open: boolean) {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/shops/${s.id}`, {
        method: "PATCH",
        token,
        body: { status: open ? "OPEN" : "CLOSED" },
      });
      onChanged();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't change that.");
    } finally {
      setBusy(false);
    }
  }

  async function submitVerification() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/shops/${s.id}/verification`, { method: "POST", token });
      onChanged();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't submit for verification.");
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/shops/${s.id}`, { method: "DELETE", token });
      setConfirmingDelete(false);
      onChanged();
    } catch (err) {
      setError(
        err instanceof PortalApiError
          ? err.status === 409
            ? "This branch has bookings on hold or confirmed. Finish or cancel them first."
            : err.message
          : "Couldn't delete that branch.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="bg-surface rounded-panel border border-line p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">{String(s.name)}</p>
          <p className="text-sm text-ink-3 mt-0.5">
            {String(s.address_line1)}, {String(s.city)}, {String(s.state)} {String(s.pincode)}
          </p>
        </div>
        <StatusPill value={s.status} />
      </div>

      {error && <div className="mt-3"><ErrorBox text={error} /></div>}

      <div className="mt-4 pt-4 border-t border-line flex items-center justify-between text-sm">
        <span className="text-ink-3">Your role</span>
        <span className="font-medium text-ink">{ROLE_LABEL[role] ?? role ?? "—"}</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="text-ink-3">Vehicles</span>
        <span className="tnum font-medium text-ink">
          {countFailed ? <span className="text-ink-4">unavailable</span> : (vehicleCount ?? "…")}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="text-ink-3">Verification</span>
        <StatusPill value={s.verification_status} />
      </div>

      {canWrite && (
        <div className="mt-3 pt-3 border-t border-line flex items-center justify-between text-sm">
          <span className="text-ink-3">
            Open for business
            <span className="block text-xs text-ink-4">Closed hides every vehicle at this branch.</span>
          </span>
          <Toggle
            checked={s.status === "OPEN"}
            disabled={busy}
            onChange={setStatus}
            label={`Keep ${String(s.name)} open for business`}
          />
        </div>
      )}

      {(canWrite || canDelete) && (
        <div className="mt-4 pt-4 border-t border-line flex items-center gap-4 text-sm flex-wrap">
          {canWrite && (
            <>
              <button type="button" onClick={() => setEditing(true)} className="text-ink font-medium hover:underline">
                Edit
              </button>
              <button type="button" onClick={() => setEditingHours(true)} className="text-ink font-medium hover:underline">
                Hours
              </button>
              <button type="button" onClick={() => setEditingLicences(true)} className="text-ink font-medium hover:underline">
                Licences
              </button>
              {s.verification_status === "UNVERIFIED" && (
                <button type="button" disabled={busy} onClick={submitVerification} className="text-ink font-medium hover:underline disabled:opacity-40">
                  Submit for verification
                </button>
              )}
            </>
          )}
          {canDelete && !confirmingDelete && (
            <button type="button" onClick={() => setConfirmingDelete(true)} className="text-danger font-medium hover:underline">
              Delete branch
            </button>
          )}
        </div>
      )}

      {confirmingDelete && (
        <div className="mt-4 pt-4 border-t border-line">
          <p className="text-sm text-ink">Delete {String(s.name)}?</p>
          <p className="text-xs text-danger mt-1 mb-3">
            This also removes <strong>every vehicle at this branch</strong> from RetroMobi. It cannot be undone
            from here.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="h-9 px-3 rounded-row bg-danger text-white font-medium text-sm disabled:opacity-40"
            >
              {busy ? "Deleting…" : "Delete branch and its vehicles"}
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)} className="text-sm text-ink-3 hover:text-ink">
              Keep it
            </button>
          </div>
        </div>
      )}

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit branch">
        {error && <ErrorBox text={error} />}
        <TextField label="Shop name" value={name} onChange={setName} />
        <TextField label="Phone" value={phone} onChange={setPhone} />
        <TextField label="Address" value={addressLine1} onChange={setAddressLine1} />
        <TextField label="City" value={city} onChange={setCity} />
        <TextField label="State" value={state} onChange={setState} />
        <TextField label="Pincode" value={pincode} onChange={setPincode} />
        <LocationPicker
          latitude={latitude}
          longitude={longitude}
          onChange={(lat, lng) => {
            setLatitude(lat);
            setLongitude(lng);
          }}
        />
        <div className="flex items-center gap-3">
          <SubmitButton busy={busy} disabled={pincode.length !== 6 || !name || !addressLine1 || !city || !state} onClick={save}>
            Save
          </SubmitButton>
          <button type="button" onClick={() => setEditing(false)} className="text-sm text-ink-3 hover:text-ink">
            Cancel
          </button>
        </div>
      </Modal>

      <Modal open={editingHours} onClose={() => setEditingHours(false)} title={`${String(s.name)} — hours`}>
        <ShopHoursEditor shopId={String(s.id)} token={token} onClose={() => setEditingHours(false)} />
      </Modal>

      <Modal open={editingLicences} onClose={() => setEditingLicences(false)} title={`Licences covering ${String(s.name)}`}>
        <BranchLicences
          shopId={String(s.id)}
          token={token}
          licences={licences}
          licencesError={licencesError}
          onChanged={onLicencesChanged}
        />
      </Modal>
    </div>
  );
}

/**
 * Attaches a Rent-a-Motorcycle licence to this branch — the link is what makes
 * the branch's vehicles lawfully rentable.
 *
 * `GET /licences` now returns each licence's covered branches, so the current
 * state is known and only the applicable action is offered. The POST is still
 * `on conflict do nothing`, so the list is refetched after a change rather
 * than inferred from the 204.
 */
function BranchLicences({
  shopId,
  token,
  licences,
  licencesError,
  onChanged,
}: {
  shopId: string;
  token: string;
  licences: Row[];
  licencesError: string | null;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function link(licenceId: string, attach: boolean) {
    setBusyId(licenceId);
    setError(null);
    try {
      await portalFetch(
        "merchant",
        attach ? `/licences/${licenceId}/shops` : `/licences/${licenceId}/shops/${shopId}`,
        attach
          ? { method: "POST", token, body: { shopId } }
          : { method: "DELETE", token },
      );
      onChanged();
    } catch (err) {
      setError(
        err instanceof PortalApiError
          ? err.status === 404
            ? "That licence or branch is no longer available."
            : err.message
          : "Couldn't change that link.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <p className="text-xs text-ink-3 mb-3">
        A vehicle may only be rented when its registration is named on a licence covering its branch.
      </p>

      {licencesError && <ErrorBox text={licencesError} />}
      {error && <ErrorBox text={error} />}

      {licences.length === 0 ? (
        <p className="text-sm text-ink-3">
          No licences on file. Add one under Compliance first.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {licences.map((l) => {
            const id = String(l.id);
            const covered = ((l.shops ?? []) as { id?: string }[]).some(
              (sh) => String(sh.id) === shopId,
            );
            return (
              <div key={id} className="flex items-center justify-between gap-3 text-sm rounded-row bg-surface-2 px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-ink">
                    {String(l.licence_number)}
                    {covered && <span className="text-verified text-xs font-medium"> · covers this branch</span>}
                  </span>
                  <span className="block text-xs text-ink-3">
                    {String(l.issuing_authority ?? "Issuing authority not recorded")}
                  </span>
                </span>
                <span className="flex items-center gap-3 shrink-0">
                  <StatusPill value={l.status} />
                  <button
                    type="button"
                    disabled={busyId === id}
                    onClick={() => link(id, !covered)}
                    className={`text-xs font-medium hover:underline disabled:opacity-40 ${
                      covered ? "text-danger" : "text-ink"
                    }`}
                  >
                    {covered ? "Detach" : "Attach"}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ShopHoursEditor({ shopId, token, onClose }: { shopId: string; token: string; onClose: () => void }) {
  const [hours, setHours] = useState<Record<number, { opensAt: string; closesAt: string } | null>>({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    portalFetch<Row>("merchant", `/shops/${shopId}`, { token })
      .then((shop) => {
        if (cancelled) return;
        const existing: Record<number, { opensAt: string; closesAt: string } | null> = {};
        const rows = Array.isArray(shop.hours) ? (shop.hours as Row[]) : [];
        for (const h of rows) {
          // The response is Postgres `time` ("09:00:00") but the request regex
          // demands "HH:MM", so this slice is what lets a reload round-trip.
          existing[Number(h.dayOfWeek)] = { opensAt: String(h.opensAt).slice(0, 5), closesAt: String(h.closesAt).slice(0, 5) };
        }
        setHours(existing);
        setLoaded(true);
      })
      .catch((err) => {
        // Had no catch at all, so a rejection left this on "Loading…" forever.
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Couldn't load these hours.");
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [shopId, token]);

  const invalid = Object.entries(hours).some(
    ([, h]) => h !== null && h !== undefined && h.closesAt <= h.opensAt,
  );

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload = Object.entries(hours)
        .filter((e): e is [string, { opensAt: string; closesAt: string }] => e[1] !== null && e[1] !== undefined)
        .map(([dayOfWeek, h]) => ({ dayOfWeek: Number(dayOfWeek), ...h }));
      await portalFetch("merchant", `/shops/${shopId}/hours`, { method: "PUT", token, body: { hours: payload } });
      onClose();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't save those hours.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {loadError && <ErrorBox text={loadError} />}
      {error && <ErrorBox text={error} />}
      {!loaded && <p className="text-sm text-ink-3">Loading…</p>}
      {loaded && !loadError && (
        <div className="flex flex-col gap-2 mb-4">
          {DAY_LABELS.map((label, day) => {
            const open = hours[day];
            return (
              <div key={day} className="flex items-center gap-3 text-sm">
                <label className="flex items-center gap-2 w-28 shrink-0">
                  <input
                    type="checkbox"
                    checked={Boolean(open)}
                    onChange={(e) => setHours((h) => ({ ...h, [day]: e.target.checked ? { opensAt: "09:00", closesAt: "18:00" } : null }))}
                  />
                  <span className="text-ink-2">{label}</span>
                </label>
                {open && (
                  <>
                    <input
                      type="time"
                      value={open.opensAt}
                      onChange={(e) => setHours((h) => ({ ...h, [day]: { ...open, opensAt: e.target.value } }))}
                      className="rounded-row border border-line-strong px-2 py-1 text-sm outline-none focus:border-ink"
                    />
                    <span className="text-ink-4">to</span>
                    <input
                      type="time"
                      value={open.closesAt}
                      onChange={(e) => setHours((h) => ({ ...h, [day]: { ...open, closesAt: e.target.value } }))}
                      className="rounded-row border border-line-strong px-2 py-1 text-sm outline-none focus:border-ink"
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* The server has no closes-after-opens check, so a reversed row would
          be stored and then read as a shop that is never open. */}
      {invalid && <p className="text-xs text-danger mb-3">Closing time must be after opening time.</p>}
      <div className="flex items-center gap-3">
        <SubmitButton busy={busy} disabled={Boolean(loadError) || invalid} onClick={save}>
          Save hours
        </SubmitButton>
        <button type="button" onClick={onClose} className="text-sm text-ink-3 hover:text-ink">
          Close
        </button>
      </div>
    </div>
  );
}

export function MerchantBranches() {
  return (
    <MerchantLayout>
      <BranchesBody />
    </MerchantLayout>
  );
}
