import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { CalendarDays, ChevronDown, Copy, X } from "lucide-react";
import { Header } from "../../components/Header";
import { Footer } from "../../components/Footer";
import { usePortalSession, usePortalQuery, portalFetch, type Row } from "../../lib/portal";
import { Modal } from "../../components/Modal";
import { ErrorBox } from "../../components/AuthFormBits";
import { EmptyState, feedbackActionClass, LoadingSkeleton, SkeletonBlock } from "../../components/ContentFeedback";
import { DateTimeField, combine, splitIso } from "../../components/DateTimeField";
import { istDay, rupees } from "../../lib/format";
import { uploadFile } from "../../lib/upload";
import { stockPhotos } from "../../lib/stockPhoto";
import { startCheckout } from "../../lib/cashfree";
import { cn } from "../../lib/cn";

function fmt(iso: unknown): string {
  if (typeof iso !== "string") return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

const primaryAction = "inline-flex min-h-10 items-center justify-center rounded-row bg-amber px-4 text-sm font-semibold text-on-amber hover:brightness-95 disabled:opacity-50";
const secondaryAction = "inline-flex min-h-10 items-center justify-center rounded-row border border-line-strong px-4 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50";

function pickupDue(booking: Row, now: Date) {
  const pickup = new Date(String(booking.scheduled_pickup_at));
  return Number.isFinite(pickup.getTime()) && istDay(pickup) <= istDay(now);
}

function canReview(booking: Row) {
  return booking.status === "COMPLETED" && !!booking.actual_return_at && !booking.deleted_at && !booking.has_review;
}

function reviewLink(booking: Row) {
  const shopId = String(booking.shop_id);
  return `/shops/${shopId}?${new URLSearchParams({ shopId, reviewBooking: String(booking.id) })}#shop-reviews`;
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

  const [dismissedReview, setDismissedReview] = useState<string | null>(() => {
    try { return sessionStorage.getItem("retromobi_dismissed_booking_review"); } catch { return null; }
  });
  const now = new Date();
  const active: Row[] = [];
  const upcoming: Row[] = [];
  const past: Row[] = [];
  for (const booking of data?.bookings ?? []) {
    if (booking.deleted_at || booking.actual_return_at || booking.status === "COMPLETED") past.push(booking);
    else if (booking.status === "CONFIRMED" && (booking.actual_pickup_at || pickupDue(booking, now))) active.push(booking);
    else upcoming.push(booking);
  }
  const dateOf = (booking: Row, key: string) => Date.parse(String(booking[key]));
  const nextAction = (booking: Row) => dateOf(booking, booking.actual_pickup_at ? "scheduled_return_at" : "scheduled_pickup_at");
  active.sort((a, b) => nextAction(a) - nextAction(b));
  upcoming.sort((a, b) => dateOf(a, "scheduled_pickup_at") - dateOf(b, "scheduled_pickup_at"));
  const review = past.filter(canReview).sort((a, b) => dateOf(b, "actual_return_at") - dateOf(a, "actual_return_at"))[0];

  return (
    <main className="max-w-[880px] w-full mx-auto px-5 py-8 sm:py-10 flex-1">
      <h1 className="text-2xl sm:text-3xl font-semibold text-ink mb-7">My bookings</h1>

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
      {!error && data && session && (
        <div className="space-y-8">
          {[
            { title: "Active rentals", items: active },
            { title: "Upcoming", items: upcoming },
            { title: "Past bookings", items: past },
          ].filter(({ items }) => items.length).map(({ title, items }) => (
            <section key={title} aria-label={title}>
              <h2 className="mb-3 text-lg font-semibold text-ink">{title}</h2>
              <div className="space-y-3">
                {items.map((booking) => (
                  <BookingCard key={String(booking.id)} booking={booking} token={session.accessToken}
                    due={pickupDue(booking, now)} onChanged={() => setReloadKey((k) => k + 1)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {!error && review && String(review.id) !== dismissedReview && (
        <aside aria-label="Review reminder" className="fixed bottom-4 right-4 z-30 w-[calc(100%-2rem)] max-w-[290px] rounded-panel border border-line bg-surface p-4 shadow-lg sm:bottom-6 sm:right-6">
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold text-ink">How was your rental?</p>
            <button type="button" aria-label="Dismiss review reminder" className="rounded p-1 text-ink-2 hover:bg-surface-2" onClick={() => {
              setDismissedReview(String(review.id));
              try { sessionStorage.setItem("retromobi_dismissed_booking_review", String(review.id)); } catch { /* still dismiss in this view */ }
            }}><X size={16} /></button>
          </div>
          <p className="mt-1 text-sm text-ink-2">{String(review.shop_name ?? "")}</p>
          <Link href={reviewLink(review)} className="mt-2 inline-flex text-sm font-semibold text-ink underline underline-offset-4">Review this rental</Link>
        </aside>
      )}
    </main>
  );
}

function BookingCard({ booking: b, token, due, onChanged }: { booking: Row; token: string; due: boolean; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<"pickup" | "extend" | "cancel" | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [extensionRevision, setExtensionRevision] = useState(0);
  const status = String(b.status);
  const cancelled = Boolean(b.deleted_at);
  const completed = status === "COMPLETED" || !!b.actual_return_at;
  const collected = !!b.actual_pickup_at;
  const canCancel = !cancelled && !completed && !collected;
  const canConfirmPickup = !cancelled && !completed && status === "CONFIRMED" && !collected;
  const canExtend = !cancelled && !completed && status === "CONFIRMED" && collected;
  const unpaidHold = !cancelled && status === "HOLD" && b.payment_status !== "SUCCEEDED" && Date.parse(String(b.hold_expires_at)) > Date.now();
  const bookingId = String(b.id);
  const { data: extension } = usePortalQuery<Row | null>("user",
    canExtend ? `/bookings/${bookingId}/extension?r=${extensionRevision}` : null, token);
  const pendingExtension = extension?.status === "PENDING" ? extension : null;
  const name = [b.make, b.model].filter(Boolean).join(" ");
  const photo = stockPhotos(String(b.make), String(b.model))[0];
  const shop = [b.shop_name, b.shop_city].filter(Boolean).join(" · ");
  const total = rupees(Number(b.total_amount ?? 0));
  const depositIssue = b.deposit_status === "CLAIMED" || b.deposit_status === "PARTIALLY_DEDUCTED";
  const label = cancelled ? "Cancelled" : completed ? "Completed" : unpaidHold ? "Payment due" :
    collected ? "In progress" : canConfirmPickup && due ? "Awaiting pickup" : status === "CONFIRMED" ? "Confirmed" : "Hold expired";
  const tone = unpaidHold || (canConfirmPickup && due) ? "bg-warning-soft text-warning" :
    collected && !cancelled && !completed ? "bg-verified-soft text-verified" : "bg-surface-2 text-ink-2";

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      setAction(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function open(next: typeof action) {
    setError(null);
    setAction(next);
  }

  return (
    <article className="rounded-panel border border-line bg-surface px-4 pt-4 sm:px-5 sm:pt-5">
      <div className="flex items-start gap-3 sm:gap-4">
        {photo && <img src={photo} alt="" className="h-12 w-14 shrink-0 rounded-row object-cover sm:h-14 sm:w-20" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="text-base font-semibold text-ink">{name}</h3>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
          </div>
          <p className="mt-0.5 text-sm text-ink-2">{shop}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <BookingFact label={collected && !cancelled ? "Picked up" : "Pickup"} value={fmt(collected && !cancelled ? b.actual_pickup_at : b.scheduled_pickup_at)} />
        <BookingFact label={b.actual_return_at ? "Returned" : collected ? "Return due" : "Return"} value={fmt(b.actual_return_at ?? b.scheduled_return_at)} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-x-3 gap-y-2 flex-wrap pb-3">
        <p className="text-sm text-ink-2"><span className="font-semibold text-ink tnum">{total}</span> booking total</p>
        {unpaidHold && <Link href={`/checkout/pay/${b.group_id}`} className={primaryAction}>Complete payment</Link>}
        {canConfirmPickup && due && <button type="button" className={primaryAction} onClick={() => open("pickup")}>Confirm pickup</button>}
        {canExtend && <button type="button" className={secondaryAction} onClick={() => open("extend")}>{pendingExtension ? "Manage extension" : "Request extension"}</button>}
        {canReview(b) && <Link href={reviewLink(b)} className={secondaryAction}>Leave a review</Link>}
      </div>
      {unpaidHold && <p className="pb-3 text-xs text-warning">Held until {fmt(b.hold_expires_at)}.</p>}
      {!cancelled && depositIssue && <DepositStatus booking={b} />}
      {canExtend && extension && <ExtensionStatus extension={extension} />}

      <details className="group border-t border-line">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
          Booking details <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-4 pb-5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-row bg-surface-2 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-xs text-ink-2">Booking ID</p>
              <code className="block break-all text-xs text-ink">{bookingId}</code>
            </div>
            <button type="button" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink" onClick={async () => {
              try { await navigator.clipboard.writeText(bookingId); setCopyMessage("Copied"); }
              catch { setCopyMessage("Select the ID to copy it"); }
            }}><Copy size={14} aria-hidden="true" /> Copy ID</button>
            {copyMessage && <p role="status" className="w-full text-xs text-ink-2">{copyMessage}</p>}
            <p className="w-full text-xs text-ink-2">Use this ID when contacting support about this rental.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {b.rider_name ? <BookingFact label="Rider" value={String(b.rider_name)} /> : null}
            {b.shop_phone ? (
              <div><p className="text-xs text-ink-2">Shop phone</p><a className="underline underline-offset-2" href={`tel:${b.shop_phone}`}>{String(b.shop_phone)}</a></div>
            ) : null}
            {b.shop_landmark ? <BookingFact label="How to find the shop" value={String(b.shop_landmark)} /> : null}
            {collected && <BookingFact label="Scheduled pickup" value={fmt(b.scheduled_pickup_at)} />}
            {!!b.actual_return_at && <BookingFact label="Scheduled return" value={fmt(b.scheduled_return_at)} />}
          </div>
          <div>
            <h4 className="mb-1 text-sm font-semibold text-ink">Price breakdown</h4>
            <div className="divide-y divide-line text-sm">
              <Row label="Rental" value={rupees(Number(b.rental_amount ?? 0))} />
              <Row label="Platform fee" value={rupees(Number(b.platform_fee ?? 0))} />
              {Number(b.discount_amount ?? 0) > 0 && <Row label="Discount" value={`− ${rupees(Number(b.discount_amount))}`} />}
              <Row label="Refundable deposit" value={rupees(Number(b.security_deposit_amount ?? 0))} />
              <Row label="Total" value={total} bold />
            </div>
            {Number(b.tax_amount ?? 0) > 0 && <p className="mt-1 text-xs text-ink-2">Includes {rupees(Number(b.tax_amount))} in tax.</p>}
          </div>
          {!cancelled && !depositIssue && <DepositStatus booking={b} />}
          {cancelled && (
            <p className="rounded-row bg-surface-2 px-3 py-2 text-sm text-ink-2">
              {b.cancellation_reason ? String(b.cancellation_reason) : "This booking was cancelled."}{" "}
              {b.payment_status === "SUCCEEDED" && Number(b.cancellation_refund_amount ?? 0) > 0 && `${rupees(Number(b.cancellation_refund_amount))} refund recorded.`}{" "}
              {b.payment_status === "SUCCEEDED" && Number(b.cancellation_penalty_amount ?? 0) > 0 && `${rupees(Number(b.cancellation_penalty_amount))} cancellation fee applied.`}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {canConfirmPickup && !due && <button type="button" className={secondaryAction} onClick={() => open("pickup")}>Confirm pickup</button>}
            {canCancel && <button type="button" className={cn(secondaryAction, "text-danger")} onClick={() => open("cancel")}>Cancel booking</button>}
          </div>
        </div>
      </details>

      {action && (
        <Modal open onClose={() => { if (!busy) open(null); }}
          title={action === "pickup" ? "Confirm pickup" : action === "extend" ? "Request an extension" : "Cancel this booking?"}>
          <p className="mb-4 text-sm text-ink-2">{name} · {shop}</p>
          {error && <div className="mb-4"><ErrorBox text={error} /></div>}
          {action === "pickup" && <PickupConfirm bookingId={bookingId} token={token} busy={busy} run={run} />}
          {action === "extend" && <ExtendForm bookingId={bookingId} token={token} busy={busy} run={run}
            currentReturnAt={String(b.scheduled_return_at)} pending={pendingExtension}
            onPrepared={() => setExtensionRevision((value) => value + 1)} />}
          {action === "cancel" && (
            <div className="space-y-4">
              <div className="rounded-row bg-warning-soft p-3 text-sm text-warning">
                <p className="font-semibold">Cancelling releases your vehicle.</p>
                {b.payment_status === "SUCCEEDED" ? (
                  <>
                    <p className="mt-1">Your deposit is refunded in full. The rental refund depends on how long until scheduled pickup.</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      <li>More than 24 hours · 90% of the rental</li>
                      <li>2–24 hours · 50% of the rental</li>
                      <li>Under 2 hours · No rental refund</li>
                    </ul>
                    <p className="mt-2">The platform fee is excluded. Rental amounts include tax.</p>
                  </>
                ) : <p className="mt-1">This booking has no successful payment.</p>}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className={secondaryAction} disabled={busy} onClick={() => open(null)}>Keep booking</button>
                <button type="button" className="min-h-10 rounded-row bg-danger px-4 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={busy} onClick={() => void run(async () => {
                    await portalFetch("user", `/bookings/${bookingId}/cancel`, { method: "POST", token });
                  })}>{busy ? "Cancelling…" : "Confirm cancellation"}</button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </article>
  );
}

function BookingFact({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-ink-2">{label}</p><p className="mt-0.5 font-medium text-ink">{value}</p></div>;
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
function ExtensionStatus({ extension: data }: { extension: Row }) {
  const status = String(data.status);
  const amount = rupees(Number(data.payable_amount ?? data.additional_amount ?? 0));

  if (status === "PENDING") {
    return (
      <div className="text-xs bg-warning-soft text-warning rounded-row px-3 py-2 mb-4">
        <p className="font-medium">Extension to {fmt(data.new_return_at)} is awaiting payment — {amount} due.</p>
        <p className="mt-0.5">
          Keep your current return time until the extension is approved. If the extra time becomes unavailable after payment, you’ll receive a full refund.
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

  return (
    <p className="text-xs text-ink-3 mb-4">
      Extension to {fmt(data.new_return_at)} was not applied. Keep your scheduled return time.
    </p>
  );
}

function DepositStatus({ booking: b }: { booking: Row }) {
  const status = String(b.deposit_status);
  if (status === "HELD") {
    return <p className="text-xs text-ink-3 mb-4">Deposit held — released automatically on a clean return.</p>;
  }
  if (status === "RELEASED") {
    const amount = rupees(Number(b.deposit_refund_amount ?? 0));
    // Real state, not an invented ETA: PENDING means we have sent it and the bank
    // has it. This is what the customer checks at the shop counter before leaving,
    // so "refunded" must not appear until the money actually landed.
    return b.deposit_refund_status === "SUCCEEDED" ? (
      <p className="text-xs text-verified mb-4">Deposit refunded — {amount} back on your original payment method.</p>
    ) : (
      <p className="text-xs text-verified mb-4">
        Deposit released — {amount} sent to your original payment method. Your bank clears it from here.
      </p>
    );
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
    <div className="py-2 flex items-center justify-between gap-4">
      <span className="text-ink-3">{label}</span>
      <span className={`tnum text-ink text-right ${bold ? "font-semibold" : "font-medium"}`}>{value}</span>
    </div>
  );
}

function PickupConfirm({ bookingId, token, busy, run }: {
  bookingId: string; token: string; busy: boolean; run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [video, setVideo] = useState<File | null>(null);

  return (
    <div className="space-y-4 text-sm text-ink-2">
      <ol className="list-decimal space-y-2 pl-5">
        <li>Show your original driving licence to shop staff and wait for their identity check.</li>
        <li>Before riding away, record one clear video walking around the entire vehicle. Show the front, rear, both sides, mirrors, wheels, and body panels.</li>
        <li>Get close-ups of any existing scratches, dents, or broken parts. Turn on the display and show the odometer and fuel or battery level.</li>
        <li>Review the video, then upload it to confirm pickup.</li>
      </ol>
      <p className="rounded-row bg-warning-soft p-3 text-warning">
        Keep a copy of the video. Without pickup footage, RetroMobi can’t verify pre-existing damage or guarantee a deposit refund if there’s a dispute.
      </p>
      <label className="block font-medium text-ink">
        Walk-around video
        <input type="file" accept="video/*" disabled={busy} className="mt-2 block w-full text-sm file:mr-3 file:rounded-row file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:font-medium file:transition-colors enabled:file:cursor-pointer enabled:hover:file:bg-line"
          onChange={(e) => setVideo(e.currentTarget.files?.[0] ?? null)} />
      </label>
      <button type="button" className={primaryAction} disabled={busy || !video} onClick={() => {
        if (!video) return;
        void run(async () => {
          await uploadFile({ portal: "user", token, file: video,
            presignPath: `/bookings/${bookingId}/inspection/upload`,
            confirmPath: `/bookings/${bookingId}/inspection/confirm` });
        });
      }}>{busy ? "Uploading…" : "Upload and confirm pickup"}</button>
    </div>
  );
}

function ExtendForm({ bookingId, token, busy, run, currentReturnAt, pending, onPrepared }: {
  bookingId: string; token: string; busy: boolean; run: (fn: () => Promise<void>) => Promise<void>; currentReturnAt: string;
  pending: Row | null; onPrepared: () => void;
}) {
  const earliest = Math.max(Date.parse(currentReturnAt), Date.now());
  const initial = splitIso(new Date(earliest + 86_400_000).toISOString());
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [prepared, setPrepared] = useState<{ extensionId: string; additionalAmount: number } | null>(null);
  const intent = prepared ?? (pending ? { extensionId: String(pending.id), additionalAmount: Number(pending.payable_amount) } : null);
  const minDate = new Date(earliest);
  minDate.setHours(0, 0, 0, 0);
  const nextReturn = combine(date, time);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState("");

  async function prepare() {
    setPrepareError("");
    setPreparing(true);
    try {
      setPrepared(await portalFetch<NonNullable<typeof prepared>>("user", `/bookings/${bookingId}/extension`, {
        method: "POST", token, body: { newReturnAt: nextReturn.toISOString() },
      }));
      onPrepared();
    } catch (error) {
      setPrepareError(error instanceof Error ? error.message : "Couldn’t prepare the extension.");
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className="space-y-4 text-sm text-ink-2">
      <p>Current return <strong className="text-ink">{fmt(currentReturnAt)}</strong></p>
      <p>Choose a later return time. Keep your current return time until payment clears and the extension is approved.</p>
      {intent ? <p>Requested return <strong className="text-ink">{fmt(prepared ? nextReturn.toISOString() : pending?.new_return_at)}</strong></p> : (
        <div className="flex rounded-row border border-line px-3 py-2">
          <DateTimeField label="New return" date={date} time={time}
            onDate={(d) => { if (d && !preparing) setDate(d); }}
            onTime={(t) => { if (!preparing) setTime(t); }}
            disabled={(d) => d < minDate || preparing} />
        </div>
      )}
      {prepareError && <ErrorBox text={prepareError} />}
      {intent ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-ink">Extension total {rupees(intent.additionalAmount)}</p>
          <button type="button" className={primaryAction} disabled={busy}
            onClick={() => void run(async () => {
              const result = await portalFetch<{ state: "settled" } | { state: "pay"; paymentSessionId: string; mode: "sandbox" | "production" }>(
                "user", `/bookings/${bookingId}/extension/${intent.extensionId}/payment`, { method: "POST", token },
              );
              if (result.state === "pay") await startCheckout(result);
            })}>{busy ? "Opening payment…" : "Continue to payment"}</button>
        </div>
      ) : (
        <button type="button" className={primaryAction} disabled={preparing || !(nextReturn.getTime() > earliest)}
          onClick={() => void prepare()}>{preparing ? "Checking…" : "Check availability and price"}</button>
      )}
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
