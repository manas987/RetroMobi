import { useEffect, useState } from "react";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { usePortalQuery, portalFetch, PortalApiError, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";
import { ErrorBox, SubmitButton, TextField } from "../../components/AuthFormBits";
import { combine, splitIso, DateField } from "../../components/DateTimeField";
import { DateRangeField } from "../../components/DateRangeField";
import { Modal } from "../../components/Modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { defaultWindow } from "../../lib/searchParams";
import { enumLabel, rupees } from "../../lib/format";

/** A booking is either an online one (a rider, a customer account) or a
 *  walk-in (loose name and phone on the row). The two sets of columns are
 *  mutually exclusive by `source`, so read whichever side is populated. */
function renterOf(b: Row): { name: string; phone: string | null } {
  if (b.source === "OFFLINE") {
    return { name: String(b.walkin_name ?? "Walk-in"), phone: b.walkin_phone ? String(b.walkin_phone) : null };
  }
  const name = b.customer_name ?? b.rider_name;
  return { name: name ? String(name) : "—", phone: b.customer_phone ? String(b.customer_phone) : null };
}

function BookingsBody() {
  const { token, shopId, can } = useMerchantShop();
  const [reloadKey, setReloadKey] = useState(0);
  const [addingWalkin, setAddingWalkin] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const canWrite = can("bookings:write");
  const canReturn = can("bookings:return");

  // This route takes status/from/to and no page — the server validates
  // exactly these three.
  const query = new URLSearchParams({ r: String(reloadKey) });
  if (status) query.set("status", status);
  if (from) query.set("from", new Date(`${from}T00:00:00`).toISOString());
  if (to) query.set("to", new Date(`${to}T23:59:59`).toISOString());

  const { data, error } = usePortalQuery<{ bookings: Row[] }>(
    "merchant",
    shopId ? `/shops/${shopId}/bookings?${query}` : null,
    token,
  );
  const reload = () => setReloadKey((k) => k + 1);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-semibold text-ink">Bookings</h1>
        {!addingWalkin && canWrite && (
          <button type="button" onClick={() => setAddingWalkin(true)} className="text-sm text-ink font-medium hover:underline shrink-0">
            + Walk-in rental
          </button>
        )}
      </div>
      <p className="text-sm text-ink-3 mb-1">Online bookings and walk-in rentals for this shop.</p>
      {/* The absent pickup button on an online booking is deliberate, not a
          gap — `merchantPickup` rejects ONLINE bookings. */}
      <p className="text-xs text-ink-3 mb-5">
        An online booking's pickup is confirmed by the rider's own condition recording, not from here. Walk-ins
        you confirm yourself.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div className="flex gap-1.5 mb-4">
          {["", "HOLD", "CONFIRMED", "COMPLETED"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatus(st)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                status === st ? "bg-ink text-surface" : "bg-surface border border-line-strong text-ink-2"
              }`}
            >
              {st === "" ? "All" : enumLabel(st)}
            </button>
          ))}
        </div>
        <div className="w-40">
          <DateField label="Pickup from" value={from} onChange={setFrom} fromYear={2024} />
        </div>
        <div className="w-40">
          <DateField label="Pickup to" value={to} onChange={setTo} fromYear={2024} />
        </div>
      </div>

      {shopId && (
        <Modal open={addingWalkin} onClose={() => setAddingWalkin(false)} title="Walk-in rental">
          <WalkinForm token={token} shopId={shopId} onCreated={() => { setAddingWalkin(false); reload(); }} onCancel={() => setAddingWalkin(false)} />
        </Modal>
      )}

      {error && <ErrorBox text={error} />}
      {!error && data === null && <p className="text-sm text-ink-3">Loading…</p>}
      {!error && data && (
        <DataTable
          rows={data.bookings}
          emptyLabel="No bookings for this shop yet."
          columns={[
            { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            {
              key: "vehicle",
              label: "Vehicle",
              render: (r) => (
                <span className="text-ink font-medium">
                  {String(r.make ?? "")} {String(r.model ?? "")}
                  <span className="block text-xs text-ink-3 font-normal">
                    {String(r.registration_number ?? "")}
                  </span>
                </span>
              ),
            },
            {
              key: "renter",
              label: "Renter",
              render: (r) => {
                const who = renterOf(r);
                return (
                  <span>
                    {who.name}
                    {who.phone && <span className="block text-xs text-ink-3">{who.phone}</span>}
                  </span>
                );
              },
            },
            { key: "scheduled_pickup_at", label: "Pickup" },
            { key: "scheduled_return_at", label: "Return" },
            { key: "source", label: "Source", render: (r) => enumLabel(r.source) },
            {
              key: "__open",
              label: "",
              render: (r) => (
                <button
                  type="button"
                  onClick={() => setOpenId(String(r.id))}
                  className="text-xs font-medium text-ink hover:underline"
                >
                  Details
                </button>
              ),
            },
            {
              key: "__actions",
              label: "",
              render: (r) =>
                canReturn ? <BookingRowActions booking={r} token={token} onChanged={reload} /> : null,
            },
          ]}
        />
      )}

      {shopId && (
        <Modal
          open={Boolean(openId)}
          onClose={() => {
            setOpenId(null);
            reload();
          }}
          title="Booking"
          wide
        >
          {openId && <BookingDetail bookingId={openId} shopId={shopId} token={token} />}
        </Modal>
      )}
    </div>
  );
}

/**
 * One booking in full. The detail route returns a BARE row (not wrapped) and
 * every money column is `bigint`, which `pg` serialises as a JSON string — so
 * each one goes through Number() before it is formatted.
 */
function BookingDetail({ bookingId, shopId, token }: { bookingId: string; shopId: string; token: string }) {
  const [booking, setBooking] = useState<Row | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    portalFetch<Row>("merchant", `/shops/${shopId}/bookings/${bookingId}`, { token })
      .then((b) => {
        if (cancelled) return;
        setBooking(b);
        setState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof PortalApiError && err.status === 404
            ? "That booking is no longer on this shop."
            : err instanceof Error
              ? err.message
              : "Couldn't load that booking.",
        );
        setState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId, shopId, token]);

  const who = booking ? renterOf(booking) : null;

  return (
    <div>
      {state === "loading" && <p className="text-sm text-ink-3">Loading…</p>}
      {state === "failed" && <ErrorBox text={error ?? "Couldn't load that booking."} />}

      {state === "ready" && booking && (
        <>
          <div className="flex items-start justify-between gap-4 mb-1">
            <h1 className="text-xl font-semibold text-ink">
              {String(booking.make ?? "")} {String(booking.model ?? "")}
            </h1>
            <StatusPill value={booking.status} />
          </div>
          <p className="text-sm text-ink-3 mb-5">
            {String(booking.registration_number ?? "")} · {enumLabel(booking.source)}
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <section className="rounded-panel border border-line divide-y divide-line">
              <Pair label="Renter" value={who?.name ?? "—"} />
              {who?.phone && <Pair label="Phone" value={who.phone} />}
              {booking.walkin_dl_number != null && (
                <Pair label="Licence number" value={String(booking.walkin_dl_number)} />
              )}
              <Pair label="Scheduled pickup" value={stamp(booking.scheduled_pickup_at)} />
              <Pair label="Scheduled return" value={stamp(booking.scheduled_return_at)} />
              <Pair
                label="Actual pickup"
                value={booking.actual_pickup_at ? stamp(booking.actual_pickup_at) : "Not collected yet"}
              />
              <Pair
                label="Actual return"
                value={booking.actual_return_at ? stamp(booking.actual_return_at) : "Not returned yet"}
              />
            </section>

            <section className="rounded-panel border border-line divide-y divide-line">
              <Pair label="Rental" value={rupees(Number(booking.rental_amount))} />
              <Pair label="Platform fee" value={rupees(Number(booking.platform_fee))} />
              <Pair label="Tax" value={rupees(Number(booking.tax_amount))} />
              {Number(booking.discount_amount) > 0 && (
                <Pair label="Discount" value={`− ${rupees(Number(booking.discount_amount))}`} />
              )}
              <Pair label="Total paid" value={rupees(Number(booking.total_amount))} strong />
              <Pair
                label="Deposit held by you"
                value={rupees(Number(booking.security_deposit_amount))}
              />
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function stamp(value: unknown): string {
  if (!value) return "—";
  return new Date(String(value)).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Pair({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="px-5 py-3 flex items-baseline justify-between gap-3 text-sm">
      <span className="text-ink-3">{label}</span>
      <span className={strong ? "text-ink font-semibold tnum" : "text-ink font-medium tnum"}>{value}</span>
    </div>
  );
}

function BookingRowActions({ booking: b, token, onChanged }: { booking: Row; token: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [reason, setReason] = useState("");

  const canPickup = b.status === "CONFIRMED" && !b.actual_pickup_at && b.source === "OFFLINE";
  const canReturn = Boolean(b.actual_pickup_at) && !b.actual_return_at;

  async function pickup() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/bookings/${b.id}/pickup`, { method: "POST", token });
      onChanged();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't confirm pickup.");
      setBusy(false);
    }
  }

  async function returnClean() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/bookings/${b.id}/return`, { method: "POST", token, body: { claim: false } });
      onChanged();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't process that return.");
      setBusy(false);
    }
  }

  async function returnWithClaim() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/bookings/${b.id}/return`, { method: "POST", token, body: { claim: true, reason } });
      onChanged();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't process that return.");
      setBusy(false);
    }
  }

  if (claiming) {
    return (
      <span className="inline-flex items-center gap-2">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for deposit claim"
          className="rounded-row border border-line-strong px-2 py-1 text-xs outline-none focus:border-ink"
        />
        <button type="button" disabled={busy || !reason} onClick={returnWithClaim} className="text-xs text-danger font-medium hover:underline disabled:opacity-40">
          Confirm claim
        </button>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      {error && <span className="text-xs text-danger">{error}</span>}
      {canPickup && (
        <button type="button" disabled={busy} onClick={pickup} className="text-xs font-medium text-ink hover:underline disabled:opacity-40">
          Confirm pickup
        </button>
      )}
      {canReturn && (
        <>
          <button type="button" disabled={busy} onClick={returnClean} className="text-xs font-medium text-verified hover:underline disabled:opacity-40">
            Clean return
          </button>
          <button type="button" disabled={busy} onClick={() => setClaiming(true)} className="text-xs font-medium text-danger hover:underline disabled:opacity-40">
            Claim deposit
          </button>
        </>
      )}
    </div>
  );
}

function WalkinForm({ token, shopId, onCreated, onCancel }: { token: string; shopId: string; onCreated: () => void; onCancel: () => void }) {
  const { data: vehiclesRes } = usePortalQuery<{ vehicles: Row[] }>("merchant", `/shops/${shopId}/vehicles`, token);
  const [vehicleId, setVehicleId] = useState("");
  const [walkinName, setWalkinName] = useState("");
  const [walkinPhone, setWalkinPhone] = useState("+91");
  const [walkinDlNumber, setWalkinDlNumber] = useState("");
  // A walk-in is being handed the keys now, so the window defaults to the
  // same today-10am-to-10pm as the customer side rather than empty fields.
  const win = defaultWindow();
  const initPickup = splitIso(win.pickupAt);
  const initReturn = splitIso(win.returnAt);
  const [pickupDate, setPickupDate] = useState(initPickup.date);
  const [pickupTime, setPickupTime] = useState(initPickup.time);
  const [returnDate, setReturnDate] = useState(initReturn.date);
  const [returnTime, setReturnTime] = useState(initReturn.time);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickupAt = combine(pickupDate, pickupTime);
  const returnAt = combine(returnDate, returnTime);
  const vehicles = (vehiclesRes?.vehicles ?? []).filter((v) => v.status === "ACTIVE");
  // The server enforces both of these too; catching them here saves a round
  // trip and names the problem next to the field that caused it.
  const windowError = returnAt <= pickupAt ? "Return must be after pickup." : null;
  const valid =
    vehicleId && walkinName && walkinPhone.length >= 10 && walkinDlNumber && !windowError;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", "/bookings/walkin", {
        method: "POST",
        token,
        body: {
          vehicleId,
          walkinName,
          walkinPhone,
          walkinDlNumber,
          pickupAt: pickupAt.toISOString(),
          returnAt: returnAt.toISOString(),
        },
      });
      onCreated();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't create that rental.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <ErrorBox text={error} />}
      <label className="flex flex-col gap-1.5 mb-4">
        <span className="text-xs font-medium text-ink-3">Vehicle</span>
        <Select value={vehicleId} onValueChange={setVehicleId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a vehicle…" />
          </SelectTrigger>
          <SelectContent>
            {vehicles.map((v) => (
              <SelectItem key={String(v.id)} value={String(v.id)}>
                {String(v.make)} {String(v.model)} — {String(v.registration_number)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <TextField label="Customer name" value={walkinName} onChange={setWalkinName} />
      <TextField label="Customer phone" value={walkinPhone} onChange={setWalkinPhone} />
      <TextField label="Driving licence number" value={walkinDlNumber} onChange={setWalkinDlNumber} />
      <div className="rounded-row border border-line-strong px-3 py-2.5 mb-4 flex">
        <DateRangeField
          label="Rental window"
          pickupDate={pickupDate}
          pickupTime={pickupTime}
          returnDate={returnDate}
          returnTime={returnTime}
          onDatesChange={(from, to) => {
            setPickupDate(from);
            setReturnDate(to);
          }}
          onPickupTime={setPickupTime}
          onReturnTime={setReturnTime}
        />
      </div>
      {windowError && <p className="text-xs text-danger mb-3">{windowError}</p>}
      <div className="flex items-center gap-3">
        <SubmitButton busy={busy} disabled={!valid} onClick={submit}>
          Create rental
        </SubmitButton>
        <button type="button" onClick={onCancel} className="text-sm text-ink-3 hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function MerchantBookings() {
  return (
    <MerchantLayout>
      <BookingsBody />
    </MerchantLayout>
  );
}
