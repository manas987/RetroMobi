import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Header } from "../../components/Header";
import { Footer } from "../../components/Footer";
import { usePortalSession, usePortalQuery, portalFetch, PortalApiError, type Row } from "../../lib/portal";
import { StatusPill } from "../../components/DataTable";
import { ErrorBox } from "../../components/AuthFormBits";
import { EmptyState, feedbackActionClass, LoadingSkeleton, SkeletonBlock } from "../../components/ContentFeedback";
import { DateTimeField, combine, splitIso } from "../../components/DateTimeField";
import { rupees } from "../../lib/format";
import { uploadFile, UploadFailedError } from "../../lib/upload";

function fmt(iso: unknown): string {
  if (typeof iso !== "string") return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function MyBookingsBody() {
  const { session } = usePortalSession("user");
  const [, navigate] = useLocation();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!session) navigate("/login?next=" + encodeURIComponent("/account/bookings"));
  }, [session, navigate]);

  const { data, error } = usePortalQuery<{ bookings: Row[] }>(
    "user",
    session ? `/bookings?r=${reloadKey}` : null,
    session?.accessToken,
  );

  return (
    <div className="max-w-[760px] w-full mx-auto px-5 py-10 min-h-[calc(100dvh-4rem)]">
      <h1 className="text-2xl font-semibold text-ink mb-1">My bookings</h1>
      <p className="text-sm text-ink-3 mb-6">Every rental you've held, confirmed or completed.</p>

      {error && <ErrorBox text={error} />}
      {!error && data === null && (
        <LoadingSkeleton label="Loading bookings" className="space-y-4">
          {[0, 1].map((index) => (
            <div key={index} className="space-y-3 rounded-panel border border-line p-5">
              <div className="flex justify-between gap-4">
                <SkeletonBlock className="h-5 w-2/5" />
                <SkeletonBlock className="h-6 w-20 rounded-full" />
              </div>
              <SkeletonBlock className="h-4 w-1/2" />
              <SkeletonBlock className="h-12 rounded-row" />
            </div>
          ))}
        </LoadingSkeleton>
      )}
      {!error && data && data.bookings.length === 0 && (
        <EmptyState title="No bookings yet" description="Your rentals will appear here once you start a booking.">
          <Link href="/browse" className={feedbackActionClass}>Find a scooter</Link>
        </EmptyState>
      )}
      {!error && data && data.bookings.length > 0 && (
        <div className="flex flex-col gap-4">
          {data.bookings.map((b) => (
            <BookingCard key={String(b.id)} booking={b} token={session!.accessToken} onChanged={() => setReloadKey((k) => k + 1)} />
          ))}
        </div>
      )}
    </div>
  );
}

function BookingCard({ booking: b, token, onChanged }: { booking: Row; token: string; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [extRefresh, setExtRefresh] = useState(0);

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (err) {
      if (err instanceof PortalApiError || err instanceof UploadFailedError) setError(err.message);
      else setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const status = String(b.status);
  const cancelled = Boolean(b.deleted_at);
  const canCancel = !cancelled && status !== "COMPLETED" && !b.actual_pickup_at;
  const canConfirmPickup = !cancelled && status === "CONFIRMED" && !b.actual_pickup_at;
  const canExtend = !cancelled && status === "CONFIRMED";
  const canReview = !cancelled && Boolean(b.actual_pickup_at);

  // A HOLD whose clock is still running and whose payment never succeeded. The
  // way back to the payment screen for a customer who closed the tab at the
  // gateway -- without this the hold is unreachable and quietly expires.
  const unpaidHold =
    !cancelled &&
    status === "HOLD" &&
    b.payment_status !== "SUCCEEDED" &&
    typeof b.hold_expires_at === "string" &&
    new Date(b.hold_expires_at) > new Date();

  const cancelBooking = () =>
    run(async () => {
      await portalFetch("user", `/bookings/${b.id}/cancel`, { method: "POST", token });
    });

  return (
    <div className={`rounded-panel border border-line p-5 ${cancelled ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-semibold text-ink">
            {String(b.make ?? "")} {String(b.model ?? "")}
          </p>
          <p className="text-sm text-ink-3">
            {String(b.shop_name ?? "")}
            {b.shop_city ? ` · ${String(b.shop_city)}` : ""}
          </p>
        </div>
        <StatusPill value={cancelled ? "CANCELLED" : b.status} />
      </div>

      {error && <ErrorBox text={error} />}

      {unpaidHold && (
        <div className="rounded-row bg-surface-2 px-3 py-3 mb-3 flex items-center justify-between gap-3">
          <p className="text-xs text-ink-2">
            Not paid yet — held until {fmt(b.hold_expires_at)}.
          </p>
          <Link
            href={`/checkout/pay/${String(b.group_id)}`}
            className="shrink-0 inline-flex h-9 items-center rounded-row bg-amber px-4 text-sm font-semibold text-on-amber hover:brightness-95 transition-[filter]"
          >
            Complete payment
          </Link>
        </div>
      )}

      {cancelled && (
        <p className="text-xs text-ink-3 bg-surface-2 rounded-row px-3 py-2 mb-3">
          Cancelled{b.cancellation_reason ? ` — ${String(b.cancellation_reason)}` : ""}.{" "}
          {Number(b.cancellation_refund_amount ?? 0) > 0 && `${rupees(Number(b.cancellation_refund_amount))} refunded.`}
          {Number(b.cancellation_penalty_amount ?? 0) > 0 && ` ${rupees(Number(b.cancellation_penalty_amount))} cancellation fee applied.`}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm mb-3">
        <div>
          <p className="text-ink-4 text-xs mb-0.5">Scheduled pickup</p>
          <p className="text-ink-2">{fmt(b.scheduled_pickup_at)}</p>
        </div>
        <div>
          <p className="text-ink-4 text-xs mb-0.5">Scheduled return</p>
          <p className="text-ink-2">{fmt(b.scheduled_return_at)}</p>
        </div>
        {b.actual_pickup_at ? (
          <div>
            <p className="text-ink-4 text-xs mb-0.5">Actually picked up</p>
            <p className="text-verified">{fmt(b.actual_pickup_at)}</p>
          </div>
        ) : null}
        {b.actual_return_at ? (
          <div>
            <p className="text-ink-4 text-xs mb-0.5">Actually returned</p>
            <p className="text-verified">{fmt(b.actual_return_at)}</p>
          </div>
        ) : null}
        {b.rider_name ? (
          <div>
            <p className="text-ink-4 text-xs mb-0.5">Rider</p>
            <p className="text-ink-2">{String(b.rider_name)}</p>
          </div>
        ) : null}
        {b.shop_phone ? (
          <div>
            <p className="text-ink-4 text-xs mb-0.5">Shop phone</p>
            <p className="text-ink-2">{String(b.shop_phone)}</p>
          </div>
        ) : null}
      </div>

      <div className="rounded-row bg-surface-2 divide-y divide-line text-sm mb-4">
        <Row label="Rental" value={rupees(Number(b.rental_amount ?? 0))} />
        <Row label="Platform fee" value={rupees(Number(b.platform_fee ?? 0))} />
        <Row label="Tax" value={rupees(Number(b.tax_amount ?? 0))} />
        {Number(b.discount_amount ?? 0) > 0 && <Row label="Discount" value={`− ${rupees(Number(b.discount_amount))}`} />}
        <Row label="Refundable deposit" value={rupees(Number(b.security_deposit_amount ?? 0))} />
        <Row label="Total" value={rupees(Number(b.total_amount ?? 0))} bold />
      </div>

      {!cancelled && b.deposit_status ? <DepositStatus booking={b} /> : null}

      {/* ponytail: one request per CONFIRMED booking — there is no endpoint
          returning extensions for the whole list. Fine at a handful of
          bookings; add a joined column to listMyBookings if it grows. */}
      {!cancelled && status === "CONFIRMED" ? (
        <ExtensionStatus bookingId={String(b.id)} token={token} refresh={extRefresh} />
      ) : null}

      <div className="flex items-center gap-4 flex-wrap text-sm">
        {canConfirmPickup && <PickupConfirm bookingId={String(b.id)} token={token} busy={busy} setBusy={setBusy} run={run} />}
        {canExtend && (
          <ExtendForm
            bookingId={String(b.id)}
            token={token}
            run={run}
            currentReturnAt={String(b.scheduled_return_at)}
            pickupAt={String(b.scheduled_pickup_at)}
            onRequested={() => setExtRefresh((k) => k + 1)}
          />
        )}
        {canReview && (
          <Link href={`/vehicles/${b.vehicle_id}`} className="text-ink font-medium hover:underline">
            Leave a review
          </Link>
        )}
        {canCancel && (
          <button type="button" disabled={busy} onClick={cancelBooking} className="text-danger font-medium hover:underline disabled:opacity-40">
            Cancel booking
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The latest extension on a booking. Extensions are charge-first since Phase
 * 15 — the row is written PENDING and only the payment promotes it — so a
 * PENDING row means the return time has NOT moved yet. That distinction was
 * invisible before: the request's response was held in local state and lost
 * on reload, so a customer who paid had no way to see whether it applied.
 *
 * A partial unique index allows only one PENDING extension per booking, so
 * the newest row is the whole story.
 */
function ExtensionStatus({
  bookingId,
  token,
  refresh,
}: {
  bookingId: string;
  token: string;
  refresh: number;
}) {
  // Returns the row bare, or a plain `null` body when none exists — not a 404.
  const { data } = usePortalQuery<Row | null>(
    "user",
    `/bookings/${bookingId}/extension?r=${refresh}`,
    token,
  );

  if (!data) return null;

  const status = String(data.status);
  const amount = rupees(Number(data.additional_amount ?? 0));

  if (status === "PENDING") {
    return (
      <div className="text-xs bg-warning-soft text-warning rounded-row px-3 py-2 mb-4">
        <p className="font-medium">Extension to {fmt(data.new_return_at)} is awaiting payment — {amount} due.</p>
        <p className="mt-0.5">
          Your return time is unchanged until that payment clears. The extra days are held for you meanwhile; if
          they are taken first, you are refunded in full.
        </p>
      </div>
    );
  }

  if (status === "APPROVED") {
    return (
      <p className="text-xs text-verified mb-4">
        Extended to {fmt(data.new_return_at)} — {amount} paid.
      </p>
    );
  }

  // REJECTED: the window was lost during payment, which refunds in full.
  return (
    <p className="text-xs text-ink-3 mb-4">
      Extension to {fmt(data.new_return_at)} was not applied. Anything paid for it has been refunded.
    </p>
  );
}

function DepositStatus({ booking: b }: { booking: Row }) {
  const status = String(b.deposit_status);
  if (status === "HELD") {
    return <p className="text-xs text-ink-3 mb-4">Deposit held — released automatically on a clean return.</p>;
  }
  if (status === "RELEASED") {
    return <p className="text-xs text-verified mb-4">Deposit released — {rupees(Number(b.deposit_refund_amount ?? 0))} refunded.</p>;
  }
  if (status === "CLAIMED" || status === "PARTIALLY_DEDUCTED") {
    return (
      <div className="text-xs text-danger bg-danger-soft rounded-row px-3 py-2 mb-4">
        <p className="font-medium">Deposit claim — {rupees(Number(b.deposit_deducted_amount ?? 0))} deducted.</p>
        {b.deposit_deduction_reason ? <p className="mt-0.5">{String(b.deposit_deduction_reason)}</p> : null}
        <p className="mt-0.5">Check Support for the ticket raised about this.</p>
      </div>
    );
  }
  return null;
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="px-4 py-2.5 flex items-center justify-between gap-4">
      <span className="text-ink-3">{label}</span>
      <span className={`tnum text-ink text-right ${bold ? "font-semibold" : "font-medium"}`}>{value}</span>
    </div>
  );
}

// The video IS the pickup event on the backend (confirmInspection sets
// actual_pickup_at), so a confirm that lands with no stored file would record
// a pickup with no condition evidence — the whole point of the step. The
// upload helper skips the PUT when storage is unconfigured and treats a real
// failure as fatal, so that can no longer happen silently.
function PickupConfirm({
  bookingId,
  token,
  busy,
  setBusy,
  run,
}: {
  bookingId: string;
  token: string;
  busy: boolean;
  setBusy: (b: boolean) => void;
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [picking, setPicking] = useState(false);

  async function onFile(file: File) {
    setBusy(true);
    await run(async () => {
      await uploadFile({
        portal: "user",
        token,
        file,
        presignPath: `/bookings/${bookingId}/inspection/upload`,
        confirmPath: `/bookings/${bookingId}/inspection/confirm`,
      });
    });
    setPicking(false);
  }

  if (!picking) {
    return (
      <button type="button" onClick={() => setPicking(true)} className="text-ink font-medium hover:underline">
        Confirm pickup
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {/* The order is enforced server-side (identity check first), so say so
          here rather than letting the customer meet a 409 with no
          explanation. See docs/dl-verification.md, Phase 5. */}
      <p className="text-xs text-ink-4">
        Shop staff check your licence first — then record the vehicle.
      </p>
      <label className="text-ink font-medium hover:underline cursor-pointer">
      {busy ? "Uploading…" : "Choose a walk-around video"}
      <input
        type="file"
        accept="video/*,image/*"
        disabled={busy}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      </label>
    </div>
  );
}

function ExtendForm({
  bookingId,
  token,
  run,
  currentReturnAt,
  pickupAt,
  onRequested,
}: {
  bookingId: string;
  token: string;
  run: (fn: () => Promise<void>) => Promise<void>;
  currentReturnAt: string;
  pickupAt: string;
  onRequested: () => void;
}) {
  const [open, setOpen] = useState(false);
  const initial = splitIso(currentReturnAt);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);

  const minDate = new Date(currentReturnAt);
  minDate.setHours(0, 0, 0, 0);

  // The request's own response is not kept: the pending extension is a real
  // row, so reading it back survives a reload where local state did not.
  const submit = () =>
    run(async () => {
      await portalFetch("user", `/bookings/${bookingId}/extension`, {
        method: "POST",
        token,
        body: { newReturnAt: combine(date, time).toISOString() },
      });
      setOpen(false);
      onRequested();
    });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-ink font-medium hover:underline">
        Request extension
      </button>
    );
  }

  return (
    <div className="w-full basis-full rounded-row border border-line-strong px-3 py-2.5 flex items-center justify-between gap-3">
      <DateTimeField
        label="New return"
        date={date}
        time={time}
        onDate={(d) => d && setDate(d)}
        onTime={setTime}
        disabled={(d) => d < minDate}
      />
      <button type="button" onClick={submit} className="shrink-0 h-9 px-4 rounded-row bg-ink text-surface font-medium text-sm hover:bg-ink-2 transition-colors">
        Confirm
      </button>
    </div>
  );
}

export function MyBookings() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <MyBookingsBody />
      <Footer />
    </div>
  );
}
