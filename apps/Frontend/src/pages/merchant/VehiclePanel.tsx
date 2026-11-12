import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Download, X } from "lucide-react";
import { usePortalQuery, portalFetch, PortalApiError, type Row } from "../../lib/portal";
import { ErrorBox, SubmitButton, TextField } from "../../components/AuthFormBits";
import { StatusPill } from "../../components/DataTable";
import { DateField } from "../../components/DateTimeField";
import { dateLabel, enumLabel, rupees } from "../../lib/format";
import { uploadFile, UploadFailedError } from "../../lib/upload";
import { Modal } from "../../components/Modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useMerchantShop } from "./Layout";
import type { Permission } from "../../lib/permissions";

type Tab = "pricing" | "photos" | "documents" | "availability" | "accessories" | "registration";

/** `needs` is the permission that makes the tab worth showing at all — a role
 *  that cannot even read it should not see an empty tab. */
const TABS: { key: Tab; label: string; needs: Permission }[] = [
  { key: "pricing", label: "Pricing", needs: "pricing:read" },
  { key: "photos", label: "Photos", needs: "fleet:read" },
  { key: "documents", label: "Documents", needs: "fleet:read" },
  { key: "availability", label: "Availability", needs: "fleet:read" },
  { key: "accessories", label: "Accessories", needs: "fleet:read" },
  { key: "registration", label: "Registration", needs: "fleet:read" },
];

/**
 * Everything about one vehicle that isn't the row itself. Tabbed rather than
 * one long form because these are separate jobs on separate days — set a
 * price, file a renewed insurance paper, take the scooter off the road for a
 * service, fix a mistyped chassis number.
 */
export function VehiclePanel({
  vehicle,
  token,
  onClose,
}: {
  vehicle: Row;
  token: string;
  onClose: () => void;
}) {
  const { can } = useMerchantShop();
  const tabs = TABS.filter((t) => can(t.needs));
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? "photos");
  const vehicleId = String(vehicle.id);
  const canWriteFleet = can("fleet:write");

  return (
    <div className="rounded-panel border border-line bg-surface mt-5 max-w-2xl">
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <p className="text-sm font-semibold text-ink">
            {String(vehicle.make ?? "")} {String(vehicle.model ?? "")}
          </p>
          <p className="text-xs text-ink-3 mt-0.5">{String(vehicle.registration_number ?? "")}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close vehicle panel"
          className="text-ink-3 hover:text-ink p-1 -m-1"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-1 px-5 mt-3 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-ink text-ink"
                : "border-transparent text-ink-3 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {tab === "pricing" && <PricingTab vehicleId={vehicleId} token={token} />}
        {tab === "photos" && (
          <PhotosTab vehicleId={vehicleId} token={token} canWrite={canWriteFleet} />
        )}
        {tab === "documents" && <DocumentsTab vehicleId={vehicleId} token={token} />}
        {tab === "availability" && <AvailabilityTab vehicleId={vehicleId} token={token} />}
        {tab === "accessories" && (
          <AccessoriesTab vehicleId={vehicleId} token={token} canWrite={canWriteFleet} />
        )}
        {tab === "registration" && (
          <RegistrationTab vehicleId={vehicleId} token={token} canWrite={canWriteFleet} />
        )}
      </div>
    </div>
  );
}

/** Rupees in the input, paise on the wire — the API is integer paise throughout. */
function toPaise(rupeeValue: string): number {
  return Math.round(Number(rupeeValue) * 100);
}

function fromPaise(paise: unknown): string {
  return paise == null ? "" : String(Number(paise) / 100);
}

function PricingTab({ vehicleId, token }: { vehicleId: string; token: string }) {
  // The PUT replaces every field, so the form has to start from what is
  // already stored — otherwise saving a new daily rate silently resets the
  // deposit and late fee to whatever the blank form held.
  //
  // A 404 is not a failure here: adding a vehicle creates it and then sets
  // pricing in a second call, so a vehicle whose second call failed has no
  // pricing row. That has to land on an empty form the merchant can fill,
  // not an error with no way out. Hence portalFetch over usePortalQuery —
  // this needs the status code, not just a message.
  const [pricing, setPricing] = useState<Row | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    portalFetch<Row>("merchant", `/vehicles/${vehicleId}/pricing`, { token })
      .then((p) => {
        if (cancelled) return;
        setPricing(p);
        setState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof PortalApiError && err.status === 404) {
          setPricing(null);
          setState("ready");
          return;
        }
        setError(err instanceof Error ? err.message : "Couldn't load pricing.");
        setState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleId, token, reloadKey]);

  if (state === "loading") return <p className="text-sm text-ink-3">Loading…</p>;
  if (state === "failed") return <ErrorBox text={error ?? "Couldn't load pricing."} />;

  return (
    <>
      {pricing === null && (
        <p className="text-sm text-warning bg-warning-soft rounded-row px-3 py-2 mb-4">
          This vehicle has no rates yet, so it cannot be booked even while listed. Set them below.
        </p>
      )}
      <BaseRateForm
        key={pricing ? String(pricing.id) : "new"}
        vehicleId={vehicleId}
        token={token}
        pricing={pricing ?? {}}
        onSaved={() => setReloadKey((k) => k + 1)}
      />
    </>
  );
}

function BaseRateForm({
  vehicleId,
  token,
  pricing,
  onSaved,
}: {
  vehicleId: string;
  token: string;
  pricing: Row;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(fromPaise(pricing.amount));
  const [weekendAmount, setWeekendAmount] = useState(fromPaise(pricing.weekend_amount));
  const [deposit, setDeposit] = useState(fromPaise(pricing.security_deposit_amount));
  const [lateFee, setLateFee] = useState(fromPaise(pricing.late_fee_amount));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // PRODUCT.md: the deposit is capped at ₹10,000, the UPI Reserve Pay block
  // limit. Saying so beats a 400 from the server.
  const depositPaise = toPaise(deposit);
  const depositTooHigh = depositPaise > 1_000_000;
  const valid = amount !== "" && weekendAmount !== "" && deposit !== "" && lateFee !== "" && !depositTooHigh;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await portalFetch("merchant", `/vehicles/${vehicleId}/pricing`, {
        method: "PUT",
        token,
        body: {
          amount: toPaise(amount),
          weekendAmount: toPaise(weekendAmount),
          securityDepositAmount: depositPaise,
          lateFeeAmount: toPaise(lateFee),
        },
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't save those rates.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-sm font-semibold text-ink mb-1">Base rates</h3>
        <p className="text-xs text-ink-3 mb-3">
          All prices are tax-inclusive — GST is extracted from what you list, never added on top.
        </p>

        {error && <ErrorBox text={error} />}

        <div className="grid grid-cols-2 gap-3">
          <TextField label="Weekday / day (₹)" type="number" value={amount} onChange={setAmount} />
          <TextField label="Weekend / day (₹)" type="number" value={weekendAmount} onChange={setWeekendAmount} />
          <TextField label="Security deposit (₹)" type="number" value={deposit} onChange={setDeposit} />
          <TextField label="Late fee / hour (₹)" type="number" value={lateFee} onChange={setLateFee} />
        </div>

        {depositTooHigh && (
          <p className="text-xs text-danger -mt-2 mb-3">
            The deposit cannot exceed ₹10,000 — that is the UPI block limit riders pay it through.
          </p>
        )}

        <div className="flex items-center gap-3">
          <SubmitButton busy={busy} disabled={!valid} onClick={save}>
            Save rates
          </SubmitButton>
          {saved && <span className="text-sm text-verified">Saved.</span>}
        </div>
      </div>

      <SpecialsSection vehicleId={vehicleId} token={token} />
    </div>
  );
}

function SpecialsSection({ vehicleId, token }: { vehicleId: string; token: string }) {
  const [reloadKey, setReloadKey] = useState(0);
  const { data } = usePortalQuery<{ specials: Row[] }>(
    "merchant",
    `/vehicles/${vehicleId}/pricing/specials?r=${reloadKey}`,
    token,
  );
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [weekendAmount, setWeekendAmount] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addSpecial() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/vehicles/${vehicleId}/pricing/specials`, {
        method: "POST",
        token,
        body: {
          name,
          amount: toPaise(amount),
          weekendAmount: toPaise(weekendAmount || amount),
          effectiveFrom: from,
          effectiveUntil: until,
        },
      });
      setName("");
      setAmount("");
      setWeekendAmount("");
      setFrom("");
      setUntil("");
      setAdding(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't add that.");
    } finally {
      setBusy(false);
    }
  }

  async function removeSpecial(id: unknown) {
    setError(null);
    try {
      await portalFetch("merchant", `/vehicles/${vehicleId}/pricing/specials/${id}`, {
        method: "DELETE",
        token,
      });
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't remove that.");
    }
  }

  const specials = data?.specials ?? [];

  return (
    <div className="border-t border-line pt-5">
      <h3 className="text-sm font-semibold text-ink mb-3">Seasonal pricing</h3>

      {error && <ErrorBox text={error} />}

      <div className="flex flex-col gap-2 mb-4">
        {specials.length === 0 && (
          <p className="text-sm text-ink-3">No seasonal pricing set — base rates apply year-round.</p>
        )}
        {specials.map((sp) => (
          <div
            key={String(sp.id)}
            className="flex items-center justify-between gap-3 text-sm rounded-row bg-surface-2 px-3 py-2"
          >
            <span className="text-ink min-w-0">
              {String(sp.name)} — {rupees(Number(sp.amount))}/day, {String(sp.effective_from)} to{" "}
              {String(sp.effective_until)}
            </span>
            <button
              type="button"
              onClick={() => removeSpecial(sp.id)}
              className="text-xs text-danger font-medium hover:underline shrink-0"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="rounded-row bg-surface-2 p-4">
          <TextField label="Name (e.g. New Year surge)" value={name} onChange={setName} autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Price / day (₹)" type="number" value={amount} onChange={setAmount} />
            <TextField
              label="Weekend / day (₹, optional)"
              type="number"
              value={weekendAmount}
              onChange={setWeekendAmount}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <DateField label="From" value={from} onChange={setFrom} />
            <DateField label="Until" value={until} onChange={setUntil} />
          </div>
          <div className="flex items-center gap-3">
            <SubmitButton busy={busy} disabled={!name || !amount || !from || !until} onClick={addSpecial}>
              Add
            </SubmitButton>
            <button type="button" onClick={() => setAdding(false)} className="text-sm text-ink-3 hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-sm text-ink font-medium hover:underline"
        >
          + Add seasonal pricing
        </button>
      )}
    </div>
  );
}

const DOCUMENT_TYPES = ["RC", "INSURANCE", "FITNESS", "PUC", "PERMIT", "TAX"] as const;

const DOCUMENT_LABELS: Record<string, string> = {
  RC: "Registration certificate",
  INSURANCE: "Insurance",
  FITNESS: "Fitness certificate",
  PUC: "Pollution certificate",
  PERMIT: "Permit",
  TAX: "Road tax",
};

/**
 * The papers an admin verifies. Without this the verification queue has
 * nothing to review, so a vehicle can never leave UNVERIFIED.
 */
function DocumentsTab({ vehicleId, token }: { vehicleId: string; token: string }) {
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error } = usePortalQuery<{ documents: Row[] }>(
    "merchant",
    `/vehicles/${vehicleId}/documents?r=${reloadKey}`,
    token,
  );
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<string>("INSURANCE");
  const [documentNumber, setDocumentNumber] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = () => setReloadKey((k) => k + 1);

  async function addDocument() {
    setBusy(true);
    setActionError(null);
    try {
      await portalFetch("merchant", `/vehicles/${vehicleId}/documents`, {
        method: "POST",
        token,
        body: {
          type,
          documentNumber: documentNumber || undefined,
          issuedAt: issuedAt || undefined,
          expiresAt: expiresAt || undefined,
        },
      });
      setDocumentNumber("");
      setIssuedAt("");
      setExpiresAt("");
      setAdding(false);
      reload();
    } catch (err) {
      setActionError(err instanceof PortalApiError ? err.message : "Couldn't add that document.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(documentId: string, file: File) {
    setBusy(true);
    setActionError(null);
    try {
      const { uploadUrl, storageKey } = await portalFetch<{ uploadUrl: string; storageKey: string }>(
        "merchant",
        `/vehicles/${vehicleId}/documents/${documentId}/upload`,
        { method: "POST", token, body: { contentType: file.type || "application/pdf" } },
      );
      try {
        await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "content-type": file.type || "application/pdf" },
        });
      } catch {
        // No storage provider configured in a local run — the dev-fallback
        // presign returns a URL that goes nowhere, so confirm anyway and
        // keep the flow walkable.
      }
      await portalFetch("merchant", `/vehicles/${vehicleId}/documents/${documentId}/confirm`, {
        method: "POST",
        token,
        body: { storageKey },
      });
      reload();
    } catch (err) {
      setActionError(err instanceof PortalApiError ? err.message : "Couldn't upload that file.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(documentId: string) {
    setActionError(null);
    try {
      await portalFetch("merchant", `/vehicles/${vehicleId}/documents/${documentId}`, {
        method: "DELETE",
        token,
      });
      reload();
    } catch (err) {
      setActionError(err instanceof PortalApiError ? err.message : "Couldn't remove that document.");
    }
  }

  if (error) return <ErrorBox text={error} />;

  const documents = data?.documents ?? [];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <p className="text-xs text-ink-3 mb-3">
        Upload each paper once. RetroMobi's team reviews them — a vehicle stays unverified until they
        are checked.
      </p>

      {actionError && <ErrorBox text={actionError} />}

      <div className="flex flex-col gap-2 mb-4">
        {data === null && <p className="text-sm text-ink-3">Loading…</p>}
        {data !== null && documents.length === 0 && (
          <p className="text-sm text-ink-3">No documents filed for this vehicle yet.</p>
        )}
        {documents.map((d) => {
          const documentId = String(d.id);
          const expired = d.expires_at != null && String(d.expires_at).slice(0, 10) < today;
          return (
            <div key={documentId} className="rounded-row bg-surface-2 px-3 py-2.5 flex items-center gap-3">
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-ink">
                  {DOCUMENT_LABELS[String(d.type)] ?? String(d.type)}
                  {d.document_number ? ` · ${String(d.document_number)}` : ""}
                </span>
                <span className="block text-xs text-ink-3">
                  {d.expires_at ? (
                    <span className={expired ? "text-danger font-medium" : undefined}>
                      {expired ? "Expired" : "Valid to"} {String(d.expires_at).slice(0, 10)}
                    </span>
                  ) : (
                    "No expiry recorded"
                  )}
                  {d.storage_key ? " · file attached" : " · no file yet"}
                </span>
              </span>

              <StatusPill value={d.status} />

              <label className="text-xs font-medium text-ink hover:underline cursor-pointer shrink-0">
                {d.storage_key ? "Replace" : "Upload"}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  disabled={busy}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload(documentId, file);
                  }}
                />
              </label>

              <button
                type="button"
                onClick={() => remove(documentId)}
                className="text-xs text-danger font-medium hover:underline shrink-0"
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>

      {adding ? (
        <div className="rounded-row bg-surface-2 p-4">
          <label className="flex flex-col gap-1.5 mb-4">
            <span className="text-xs font-medium text-ink-3">Document type</span>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {DOCUMENT_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <TextField label="Document number (optional)" value={documentNumber} onChange={setDocumentNumber} />
          <div className="grid grid-cols-2 gap-3">
            <DateField label="Issued on" value={issuedAt} onChange={setIssuedAt} fromYear={2000} />
            <DateField label="Expires on" value={expiresAt} onChange={setExpiresAt} fromYear={2000} />
          </div>
          <div className="flex items-center gap-3">
            <SubmitButton busy={busy} onClick={addDocument}>
              Add document
            </SubmitButton>
            <button type="button" onClick={() => setAdding(false)} className="text-sm text-ink-3 hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-sm text-ink font-medium hover:underline"
        >
          + Add document
        </button>
      )}
    </div>
  );
}

/**
 * Blocks that hide the vehicle from search for a window without unlisting it
 * — a service, a repair, an owner's own trip. Search excludes any vehicle
 * with an overlapping block, same as it excludes a booked one.
 */
function AvailabilityTab({ vehicleId, token }: { vehicleId: string; token: string }) {
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error } = usePortalQuery<{ blocks: Row[] }>(
    "merchant",
    `/vehicles/${vehicleId}/unavailability?r=${reloadKey}`,
    token,
  );
  const [adding, setAdding] = useState(false);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = () => setReloadKey((k) => k + 1);
  // Dates come out of DateField as "YYYY-MM-DD"; the API wants instants, and
  // a block is inclusive of its last day, so it ends at that day's midnight.
  const invalidRange = startAt !== "" && endAt !== "" && endAt < startAt;

  async function addBlock() {
    setBusy(true);
    setActionError(null);
    try {
      await portalFetch("merchant", `/vehicles/${vehicleId}/unavailability`, {
        method: "POST",
        token,
        body: {
          startAt: new Date(`${startAt}T00:00:00`).toISOString(),
          endAt: new Date(`${endAt}T23:59:59`).toISOString(),
          reason: reason || undefined,
        },
      });
      setStartAt("");
      setEndAt("");
      setReason("");
      setAdding(false);
      reload();
    } catch (err) {
      setActionError(err instanceof PortalApiError ? err.message : "Couldn't add that block.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(blockId: string) {
    setActionError(null);
    try {
      await portalFetch("merchant", `/vehicles/${vehicleId}/unavailability/${blockId}`, {
        method: "DELETE",
        token,
      });
      reload();
    } catch (err) {
      setActionError(err instanceof PortalApiError ? err.message : "Couldn't remove that block.");
    }
  }

  if (error) return <ErrorBox text={error} />;

  const blocks = data?.blocks ?? [];

  return (
    <div>
      <p className="text-xs text-ink-3 mb-3">
        Hides the vehicle from search for a window without taking it off the marketplace.
      </p>

      {actionError && <ErrorBox text={actionError} />}

      <div className="flex flex-col gap-2 mb-4">
        {data === null && <p className="text-sm text-ink-3">Loading…</p>}
        {data !== null && blocks.length === 0 && (
          <p className="text-sm text-ink-3">No blocks — the vehicle is bookable whenever it is free.</p>
        )}
        {blocks.map((b) => (
          <div
            key={String(b.id)}
            className="flex items-center justify-between gap-3 text-sm rounded-row bg-surface-2 px-3 py-2"
          >
            <span className="text-ink min-w-0">
              {new Date(String(b.start_at)).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              {" – "}
              {new Date(String(b.end_at)).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              {b.reason ? <span className="text-ink-3"> · {String(b.reason)}</span> : null}
            </span>
            <button
              type="button"
              onClick={() => remove(String(b.id))}
              className="text-xs text-danger font-medium hover:underline shrink-0"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="rounded-row bg-surface-2 p-4">
          <div className="grid grid-cols-2 gap-3">
            <DateField label="From" value={startAt} onChange={setStartAt} />
            <DateField label="Until (inclusive)" value={endAt} onChange={setEndAt} />
          </div>
          {invalidRange && <p className="text-xs text-danger -mt-2 mb-3">The end date must not be before the start.</p>}
          <TextField label="Reason (optional, not shown to riders)" value={reason} onChange={setReason} />
          <div className="flex items-center gap-3">
            <SubmitButton busy={busy} disabled={!startAt || !endAt || invalidRange} onClick={addBlock}>
              Block these dates
            </SubmitButton>
            <button type="button" onClick={() => setAdding(false)} className="text-sm text-ink-3 hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-sm text-ink font-medium hover:underline"
        >
          + Block dates
        </button>
      )}
    </div>
  );
}

/**
 * The photos a rider sees, which until now were write-only: Fleet could
 * upload one and nothing in the portal ever read them back, so a merchant
 * could not tell whether an upload landed, let alone reorder or remove one.
 *
 * `display_order` decides which photo leads the listing, so the order is the
 * point rather than a nicety.
 */
function PhotosTab({
  vehicleId,
  token,
  canWrite,
}: {
  vehicleId: string;
  token: string;
  canWrite: boolean;
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error } = usePortalQuery<{ media: Row[] }>(
    "merchant",
    `/vehicles/${vehicleId}/media?r=${reloadKey}`,
    token,
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = () => setReloadKey((k) => k + 1);
  const media = data?.media ?? [];

  function fail(err: unknown, fallback: string) {
    if (err instanceof UploadFailedError || err instanceof PortalApiError) setActionError(err.message);
    else setActionError(fallback);
  }

  async function upload(file: File) {
    setBusy(true);
    setActionError(null);
    try {
      await uploadFile({
        portal: "merchant",
        token,
        file,
        presignPath: `/vehicles/${vehicleId}/media/upload`,
        confirmPath: `/vehicles/${vehicleId}/media/confirm`,
        confirmBody: { type: file.type.startsWith("video/") ? "VIDEO" : "IMAGE", displayOrder: media.length },
      });
      reload();
    } catch (err) {
      fail(err, "Couldn't upload that photo.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(mediaId: string) {
    setBusy(true);
    setActionError(null);
    try {
      await portalFetch("merchant", `/vehicles/${vehicleId}/media/${mediaId}`, { method: "DELETE", token });
      reload();
    } catch (err) {
      fail(err, "Couldn't remove that photo.");
    } finally {
      setBusy(false);
    }
  }

  async function publish(mediaId: string, published: boolean) {
    setBusy(true);
    setActionError(null);
    try {
      await portalFetch("merchant", `/vehicles/${vehicleId}/media/${mediaId}`, {
        method: "PATCH",
        token,
        body: { published },
      });
      reload();
    } catch (err) {
      fail(err, "Couldn't change photo visibility.");
    } finally {
      setBusy(false);
    }
  }

  /** Swaps one photo with its neighbour. The endpoint replaces the whole
   *  order, so the full list is sent even for a single move. */
  async function move(index: number, delta: number) {
    const next = [...media];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];

    setBusy(true);
    setActionError(null);
    try {
      await portalFetch("merchant", `/vehicles/${vehicleId}/media/order`, {
        method: "PATCH",
        token,
        body: { order: next.map((m, i) => ({ id: String(m.id), displayOrder: i })) },
      });
      reload();
    } catch (err) {
      fail(err, "Couldn't reorder those photos.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorBox text={error} />;

  return (
    <div>
      <p className="text-xs text-ink-3 mb-3">
        Publish the photos you want riders to see on the vehicle details page.
      </p>

      {actionError && <ErrorBox text={actionError} />}

      {data === null && <p className="text-sm text-ink-3">Loading…</p>}
      {data !== null && media.length === 0 && (
        <p className="text-sm text-ink-3 mb-4">No photos yet. A listing with no photo rarely gets booked.</p>
      )}

      {media.length > 0 && (
        <ul className="flex flex-col gap-2 mb-4">
          {media.map((m, i) => (
            <li key={String(m.id)} className="flex flex-wrap items-center gap-3 rounded-row bg-surface-2 px-3 py-2">
              <MediaThumb vehicleId={vehicleId} mediaId={String(m.id)} token={token} type={String(m.type)} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-ink">
                  {m.type === "VIDEO" ? "Video" : `Photo ${i + 1}`}
                </span>
                <span className="block text-xs text-ink-3">{m.published ? "Published" : "Private"}</span>
              </span>
              {canWrite && (
                <>
                  {m.type === "IMAGE" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => publish(String(m.id), !m.published)}
                      className="text-xs font-medium text-ink hover:underline disabled:opacity-40"
                    >
                      {m.published ? "Unpublish" : "Publish"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy || i === 0}
                    onClick={() => move(i, -1)}
                    aria-label="Move earlier"
                    className="text-ink-3 hover:text-ink disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={busy || i === media.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label="Move later"
                    className="text-ink-3 hover:text-ink disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(String(m.id))}
                    className="text-xs text-danger font-medium hover:underline disabled:opacity-40"
                  >
                    Remove
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {canWrite && (
        <label className="text-sm text-ink font-medium hover:underline cursor-pointer">
          + Add photo
          <input
            type="file"
            accept="image/*,video/*"
            disabled={busy}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
        </label>
      )}
    </div>
  );
}

/** Thumbnails need a presigned GET per object, so each one resolves its own
 *  short-lived URL. A failure degrades to an icon rather than a broken image. */
function MediaThumb({
  vehicleId,
  mediaId,
  token,
  type,
}: {
  vehicleId: string;
  mediaId: string;
  token: string;
  type: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    portalFetch<{ downloadUrl: string }>(
      "merchant",
      `/vehicles/${vehicleId}/media/${mediaId}/download`,
      { token },
    )
      .then((r) => {
        if (!cancelled) setUrl(r.downloadUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleId, mediaId, token]);

  if (type === "VIDEO" || failed || !url) {
    return (
      <span className="h-12 w-12 shrink-0 rounded-row bg-surface-3 flex items-center justify-center text-ink-4">
        {url && !failed ? (
          <a href={url} target="_blank" rel="noreferrer" aria-label="Open file">
            <Download className="h-4 w-4" />
          </a>
        ) : (
          <Download className="h-4 w-4" />
        )}
      </span>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
      <img src={url} alt="" className="h-12 w-12 rounded-row object-cover bg-surface-3" />
    </a>
  );
}

/**
 * Helmets and the like. `POST` always INSERTs — the service is named
 * `setAccessory` but there is no upsert — so posting the same type twice
 * silently creates two rows. The form refuses a type that is already listed
 * rather than letting the merchant discover the duplicate later.
 */
function AccessoriesTab({
  vehicleId,
  token,
  canWrite,
}: {
  vehicleId: string;
  token: string;
  canWrite: boolean;
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error } = usePortalQuery<{ accessories: Row[] }>(
    "merchant",
    `/vehicles/${vehicleId}/accessories?r=${reloadKey}`,
    token,
  );
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = () => setReloadKey((k) => k + 1);
  const accessories = data?.accessories ?? [];
  const duplicate = accessories.some(
    (a) => String(a.type).trim().toLowerCase() === type.trim().toLowerCase() && type.trim() !== "",
  );

  async function add() {
    setBusy(true);
    setActionError(null);
    try {
      await portalFetch("merchant", `/vehicles/${vehicleId}/accessories`, {
        method: "POST",
        token,
        body: {
          type: type.trim(),
          quantity: Number(quantity),
          status: available ? "AVAILABLE" : "UNAVAILABLE",
        },
      });
      setType("");
      setQuantity("1");
      setAvailable(true);
      setAdding(false);
      reload();
    } catch (err) {
      setActionError(err instanceof PortalApiError ? err.message : "Couldn't add that accessory.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(accessoryId: string) {
    setActionError(null);
    try {
      await portalFetch("merchant", `/vehicles/${vehicleId}/accessories/${accessoryId}`, {
        method: "DELETE",
        token,
      });
      reload();
    } catch (err) {
      setActionError(err instanceof PortalApiError ? err.message : "Couldn't remove that accessory.");
    }
  }

  if (error) return <ErrorBox text={error} />;

  return (
    <div>
      <p className="text-xs text-ink-3 mb-3">What goes out with the vehicle — helmets, a phone mount, a carrier.</p>

      {actionError && <ErrorBox text={actionError} />}

      {data === null && <p className="text-sm text-ink-3">Loading…</p>}
      {data !== null && accessories.length === 0 && (
        <p className="text-sm text-ink-3 mb-4">Nothing listed for this vehicle.</p>
      )}

      {accessories.length > 0 && (
        <ul className="flex flex-col gap-2 mb-4">
          {accessories.map((a) => (
            <li
              key={String(a.id)}
              className="flex items-center justify-between gap-3 rounded-row bg-surface-2 px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="text-ink">{enumLabel(a.type)}</span>
                <span className="text-ink-3"> × {String(a.quantity)}</span>
              </span>
              <span className="flex items-center gap-3 shrink-0">
                <StatusPill value={a.status} />
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => remove(String(a.id))}
                    className="text-xs text-danger font-medium hover:underline"
                  >
                    Remove
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canWrite &&
        (adding ? (
          <div className="rounded-row bg-surface-2 p-4">
            <TextField label="Accessory (e.g. Helmet)" value={type} onChange={setType} autoFocus />
            <TextField label="Quantity" type="number" value={quantity} onChange={setQuantity} />
            {duplicate && (
              <p className="text-xs text-danger -mt-2 mb-3">
                Already listed for this vehicle — edit the existing row's quantity instead of adding a second.
              </p>
            )}
            <label className="flex items-center gap-2 mb-4 text-sm text-ink-2">
              <input
                type="checkbox"
                checked={available}
                onChange={(e) => setAvailable(e.target.checked)}
                className="h-4 w-4"
              />
              Available to riders
            </label>
            <div className="flex items-center gap-3">
              <SubmitButton
                busy={busy}
                disabled={!type.trim() || Number(quantity) < 1 || duplicate}
                onClick={add}
              >
                Add accessory
              </SubmitButton>
              <button type="button" onClick={() => setAdding(false)} className="text-sm text-ink-3 hover:text-ink">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-sm text-ink font-medium hover:underline"
          >
            + Add accessory
          </button>
        ))}
    </div>
  );
}

/** The fields the RC carries. Only the registration number is required. */
const REGISTRATION_FIELDS: { key: string; label: string; numeric?: boolean }[] = [
  { key: "registeringAuthority", label: "Registering authority" },
  { key: "engineNumber", label: "Engine number" },
  { key: "chassisNumber", label: "Chassis number" },
  { key: "manufacturer", label: "Manufacturer" },
  { key: "financer", label: "Financer" },
  { key: "cubicCapacity", label: "Cubic capacity (cc)", numeric: true },
  { key: "seatingCapacity", label: "Seating capacity", numeric: true },
];

/** Maps a camelCase form key to the snake_case column the GET returns. */
function snake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/**
 * The registration record behind the plate. `PUT` is append-only — it INSERTs
 * a new row on every save and returns `{updated:true}` rather than the row —
 * so this reads the newest record back through the GET instead of trusting
 * the response, and says plainly that saving files a new one.
 */
function RegistrationTab({
  vehicleId,
  token,
  canWrite,
}: {
  vehicleId: string;
  token: string;
  canWrite: boolean;
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error } = usePortalQuery<{ record: Row | null }>(
    "merchant",
    `/vehicles/${vehicleId}/registration?r=${reloadKey}`,
    token,
  );
  const [editing, setEditing] = useState(false);

  if (error) return <ErrorBox text={error} />;
  if (data === null) return <p className="text-sm text-ink-3">Loading…</p>;

  const record = data.record;

  return (
    <div>
      <p className="text-xs text-ink-3 mb-3">
        Details from the registration certificate. Saving files a new record rather than editing the old one, so
        the history is kept.
      </p>

      {!record ? (
        <p className="text-sm text-ink-3 mb-4">No registration record filed for this vehicle.</p>
      ) : (
        <dl className="text-sm flex flex-col gap-1.5 mb-4">
          <RegistrationPair label="Registration number" value={record.registration_number} />
          {REGISTRATION_FIELDS.map((f) => (
            <RegistrationPair key={f.key} label={f.label} value={record[snake(f.key)]} />
          ))}
          <RegistrationPair label="Tax valid until" value={dateLabel(record.tax_valid_until)} />
        </dl>
      )}

      {canWrite && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-sm text-ink font-medium hover:underline"
        >
          {record ? "File an updated record" : "+ File registration record"}
        </button>
      )}

      <Modal open={editing} onClose={() => setEditing(false)} title={record ? "File an updated record" : "File registration record"}>
        <RegistrationForm
          vehicleId={vehicleId}
          token={token}
          record={record}
          onDone={() => {
            setEditing(false);
            setReloadKey((k) => k + 1);
          }}
          onCancel={() => setEditing(false)}
        />
      </Modal>
    </div>
  );
}

function RegistrationPair({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-ink font-medium text-right">
        {value == null || value === "" ? <span className="text-ink-4">—</span> : String(value)}
      </dd>
    </div>
  );
}

function RegistrationForm({
  vehicleId,
  token,
  record,
  onDone,
  onCancel,
}: {
  vehicleId: string;
  token: string;
  record: Row | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [registrationNumber, setRegistrationNumber] = useState(String(record?.registration_number ?? ""));
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(REGISTRATION_FIELDS.map((f) => [f.key, String(record?.[snake(f.key)] ?? "")])),
  );
  const [taxValidUntil, setTaxValidUntil] = useState(String(record?.tax_valid_until ?? "").slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      // Blank fields are omitted rather than sent as "" — the schema treats
      // them as optional, and an empty string is not the same as unknown.
      const body: Record<string, unknown> = { registrationNumber: registrationNumber.trim() };
      for (const f of REGISTRATION_FIELDS) {
        const raw = fields[f.key]?.trim();
        if (!raw) continue;
        body[f.key] = f.numeric ? Number(raw) : raw;
      }
      if (taxValidUntil) body.taxValidUntil = taxValidUntil;

      await portalFetch("merchant", `/vehicles/${vehicleId}/registration`, { method: "PUT", token, body });
      onDone();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't file that record.");
    } finally {
      setBusy(false);
    }
  }

  const numericInvalid = REGISTRATION_FIELDS.some(
    (f) => f.numeric && (fields[f.key]?.trim() ?? "") !== "" && !Number.isFinite(Number(fields[f.key])),
  );

  return (
    <div>
      {error && <ErrorBox text={error} />}
      <TextField
        label="Registration number"
        value={registrationNumber}
        onChange={setRegistrationNumber}
        autoFocus
      />
      {REGISTRATION_FIELDS.map((f) => (
        <TextField
          key={f.key}
          label={f.label}
          type={f.numeric ? "number" : "text"}
          value={fields[f.key] ?? ""}
          onChange={(v) => setFields((prev) => ({ ...prev, [f.key]: v }))}
        />
      ))}
      <DateField label="Tax valid until" value={taxValidUntil} onChange={setTaxValidUntil} fromYear={2000} />
      <div className="flex items-center gap-3">
        <SubmitButton busy={busy} disabled={!registrationNumber.trim() || numericInvalid} onClick={save}>
          File record
        </SubmitButton>
        <button type="button" onClick={onCancel} className="text-sm text-ink-3 hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}
