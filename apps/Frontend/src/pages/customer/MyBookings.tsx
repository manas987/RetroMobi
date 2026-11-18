import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "wouter";
import { ArrowLeft, ChevronRight, Copy, LifeBuoy, MapPin, Phone, X } from "lucide-react";
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

// My bookings: a compact list (/account/bookings) where each row opens the
// booking's own page (/account/bookings/:id) with everything about it: the
// next step, pickup confirmation, extension, price, deposit and its support chat.

function fmt(iso: unknown): string {
  if (typeof iso !== "string") return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}
function shortDate(iso: unknown): string {
  if (typeof iso !== "string") return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

const primaryAction = "inline-flex min-h-10 items-center justify-center rounded-row bg-amber px-4 text-sm font-semibold text-on-amber hover:brightness-95 disabled:opacity-50";
const secondaryAction = "inline-flex min-h-10 items-center justify-center rounded-row border border-line-strong px-4 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50";
const card = "rounded-panel border border-line bg-surface p-4 sm:p-5";
const bookingsPath = "/account/bookings";
const bookingPath = (id: unknown) => `${bookingsPath}/${String(id)}`;
const chatPath = (id: unknown) => `/account/support?${new URLSearchParams({ ticket: String(id) })}`;

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

/** Everything the list and the detail page derive from one booking row. */
function describe(b: Row, now = new Date()) {
  const status = String(b.status);
  const cancelled = Boolean(b.deleted_at);
  const completed = status === "COMPLETED" || !!b.actual_return_at;
  const collected = !!b.actual_pickup_at;
  const due = pickupDue(b, now);
  const unpaidHold = !cancelled && status === "HOLD" && b.payment_status !== "SUCCEEDED" && Date.parse(String(b.hold_expires_at)) > Date.now();
  const canConfirmPickup = !cancelled && !completed && status === "CONFIRMED" && !collected;
  const label = cancelled ? "Cancelled" : completed ? "Completed" : unpaidHold ? "Payment due" :
    collected ? "In progress" : canConfirmPickup && due ? "Pickup today" : status === "CONFIRMED" ? "Confirmed" : "Hold expired";
  const tone = unpaidHold || (canConfirmPickup && due) ? "bg-warning-soft text-warning" :
    collected && !cancelled && !completed ? "bg-verified-soft text-verified" : "bg-surface-2 text-ink-2";
  return {
    status, cancelled, completed, collected, due, unpaidHold, canConfirmPickup, label, tone,
    canCancel: !cancelled && !completed && !collected,
    canExtend: !cancelled && !completed && status === "CONFIRMED" && collected,
    name: [b.make, b.model].filter(Boolean).join(" "),
    photo: stockPhotos(String(b.make), String(b.model))[0],
    shop: [b.shop_name, b.shop_city].filter(Boolean).join(" · "),
    total: rupees(Number(b.total_amount ?? 0)),
  };
}

function useBookings() {
  const { session } = usePortalSession("user");
  const [, navigate] = useLocation();
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (!session) navigate("/login?next=" + encodeURIComponent(window.location.pathname));
  }, [session, navigate]);
  const { data, error } = usePortalQuery<{ bookings: Row[] }>("user", session ? `/bookings?r=${reloadKey}` : null, session?.accessToken);
  return { session, data, error, reload: () => setReloadKey((k) => k + 1) };
}

// ---- The list ------------------------------------------------------------------

function MyBookingsBody() {
  const { session, data, error } = useBookings();
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
    <main className="max-w-[880px] w-full mx-auto px-5 py-8 sm:py-10 flex-1 min-h-[calc(100dvh-4rem)]">
      <h1 className="text-2xl sm:text-3xl font-semibold text-ink mb-7">My bookings</h1>

      {error && <ErrorBox text={error} />}
      {!error && data === null && (
        <LoadingSkeleton label="Loading bookings" className="space-y-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex items-center gap-4 rounded-panel border border-line p-3">
              <SkeletonBlock className="h-16 w-20 rounded-row" />
              <div className="flex-1 space-y-2">
                <SkeletonBlock className="h-4 w-2/5" />
                <SkeletonBlock className="h-3 w-1/3" />
              </div>
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
              <ul className="space-y-2">
                {items.map((booking) => <BookingRow key={String(booking.id)} booking={booking} />)}
              </ul>
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

function BookingRow({ booking: b }: { booking: Row }) {
  const d = describe(b);
  return (
    <li>
      <Link href={bookingPath(b.id)}
        className="flex items-center gap-3 rounded-panel border border-line bg-surface p-3 transition-colors hover:border-line-strong hover:bg-surface-2 sm:gap-4">
        {d.photo
          ? <img src={d.photo} alt="" className="h-16 w-20 shrink-0 rounded-row object-cover sm:h-[72px] sm:w-24" />
          : <span className="h-16 w-20 shrink-0 rounded-row bg-surface-2 sm:h-[72px] sm:w-24" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate text-base font-semibold text-ink">{d.name}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.tone}`}>{d.label}</span>
          </div>
          <p className="truncate text-sm text-ink-2">{d.shop}</p>
          <p className="mt-0.5 text-xs text-ink-3">{shortDate(b.scheduled_pickup_at)} → {shortDate(b.scheduled_return_at)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-sm font-semibold text-ink tnum">{d.total}</span>
          <ChevronRight size={18} aria-hidden="true" className="text-ink-3" />
        </div>
      </Link>
    </li>
  );
}

// ---- One booking ----------------------------------------------------------------

function BookingDetailBody() {
  const { id } = useParams<{ id: string }>();
  const { session, data, error, reload } = useBookings();
  const booking = data?.bookings.find((b) => String(b.id) === id);

  return (
    <main className="max-w-[880px] w-full mx-auto px-5 py-6 sm:py-8 flex-1 min-h-[calc(100dvh-4rem)]">
      <Link href={bookingsPath} className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={16} aria-hidden="true" /> My bookings
      </Link>
      {error && <ErrorBox text={error} />}
      {!error && data === null && (
        <LoadingSkeleton label="Loading booking" className="space-y-4">
          <SkeletonBlock className="h-24 rounded-panel" />
          <SkeletonBlock className="h-40 rounded-panel" />
        </LoadingSkeleton>
      )}
      {data && !booking && (
        <EmptyState title="Booking not found" description="It may belong to another account.">
          <Link href={bookingsPath} className={feedbackActionClass}>Back to my bookings</Link>
        </EmptyState>
      )}
      {booking && session && <BookingDetail key={String(booking.id)} booking={booking} token={session.accessToken} onChanged={reload} />}
    </main>
  );
}

function BookingDetail({ booking: b, token, onChanged }: { booking: Row; token: string; onChanged: () => void }) {
  const d = describe(b);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<"extend" | "cancel" | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [extensionRevision, setExtensionRevision] = useState(0);
  const bookingId = String(b.id);
  const { data: extension } = usePortalQuery<Row | null>("user",
    d.canExtend ? `/bookings/${bookingId}/extension?r=${extensionRevision}` : null, token);
  const pendingExtension = extension?.status === "PENDING" ? extension : null;
  const depositIssue = b.deposit_status === "CLAIMED" || b.deposit_status === "PARTIALLY_DEDUCTED";
  const address = [b.shop_address, b.shop_city].filter(Boolean).join(", ");

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

  return (
    <div className="space-y-4">
      {/* What and where */}
      <section className={cn(card, "flex items-start gap-4")}>
        {d.photo && <img src={d.photo} alt="" className="h-20 w-24 shrink-0 rounded-row object-cover sm:h-24 sm:w-32" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="text-xl font-semibold text-ink sm:text-2xl">{d.name}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${d.tone}`}>{d.label}</span>
          </div>
          <p className="mt-0.5 text-sm text-ink-2">{d.shop}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Fact label={d.collected && !d.cancelled ? "Picked up" : "Pickup"} value={fmt(d.collected && !d.cancelled ? b.actual_pickup_at : b.scheduled_pickup_at)} />
            <Fact label={b.actual_return_at ? "Returned" : d.collected ? "Return due" : "Return"} value={fmt(b.actual_return_at ?? b.scheduled_return_at)} />
            <Fact label="Total" value={d.total} />
          </div>
        </div>
      </section>

      {/* The one thing to do next */}
      {d.unpaidHold && (
        <NextStep title="Complete your payment" text={`This booking is held for you until ${fmt(b.hold_expires_at)}.`}>
          <Link href={`/checkout/pay/${b.group_id}`} className={primaryAction}>Complete payment</Link>
        </NextStep>
      )}
      {d.canConfirmPickup && (
        <section className={card} aria-label="Pick up your scooter">
          <h2 className="text-base font-semibold text-ink">Pick up your scooter</h2>
          <p className="mt-0.5 text-sm text-ink-2">{d.due ? "Your pickup is today." : `Pickup is on ${fmt(b.scheduled_pickup_at)}. Come back here at the shop.`}</p>
          {!!b.handover_code && (
            <div className="mt-4 rounded-row border border-line bg-surface-2 px-4 py-3">
              <p className="text-xs text-ink-2">1. Tell the shop your handover code</p>
              <p className="mt-1 text-3xl font-semibold tracking-[0.3em] text-ink tnum">{String(b.handover_code)}</p>
              <p className="mt-1 text-xs text-ink-2">We also sent it on WhatsApp. Show your original driving licence too.</p>
            </div>
          )}
          <div className="mt-4">
            <p className="mb-2 text-xs text-ink-2">{b.handover_code ? "2. " : ""}Once the shop has checked your ID, record the scooter and confirm pickup</p>
            {error && <div className="mb-3"><ErrorBox text={error} /></div>}
            <PickupConfirm bookingId={bookingId} token={token} busy={busy} run={run} />
          </div>
        </section>
      )}
      {d.canExtend && (
        <NextStep title={pendingExtension ? "Extension awaiting payment" : "Need more time?"}
          text={`Return due ${fmt(b.scheduled_return_at)}.`}>
          <button type="button" className={secondaryAction} onClick={() => { setError(null); setAction("extend"); }}>
            {pendingExtension ? "Manage extension" : "Request extension"}
          </button>
        </NextStep>
      )}
      {d.canExtend && extension && <ExtensionStatus extension={extension} />}
      {canReview(b) && (
        <NextStep title="How was your rental?" text="Your review helps other riders choose.">
          <Link href={reviewLink(b)} className={primaryAction}>Leave a review</Link>
        </NextStep>
      )}
      {!d.cancelled && depositIssue && <DepositStatus booking={b} />}

      {/* Help with this booking */}
      <SupportCard booking={b} token={token} onChanged={onChanged} />

      {/* Shop and rider */}
      <section className={card} aria-label="Shop and rider">
        <h2 className="mb-3 text-base font-semibold text-ink">Shop and rider</h2>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          {address && (
            <div className="flex gap-2">
              <MapPin size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
              <div>
                <p className="font-medium text-ink">{String(b.shop_name ?? "")}</p>
                <p className="text-ink-2">{address}</p>
                <a className="text-sm font-medium text-ink underline underline-offset-2" target="_blank" rel="noreferrer"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`}>Directions</a>
              </div>
            </div>
          )}
          <div className="space-y-3">
            {b.shop_phone ? (
              <div className="flex gap-2">
                <Phone size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
                <a className="font-medium text-ink underline underline-offset-2" href={`tel:${b.shop_phone}`}>{String(b.shop_phone)}</a>
              </div>
            ) : null}
            {b.rider_name ? <Fact label="Rider" value={String(b.rider_name)} /> : null}
          </div>
        </div>
      </section>

      {/* Money */}
      <section className={card} aria-label="Payment">
        <h2 className="mb-1 text-base font-semibold text-ink">Payment</h2>
        <div className="divide-y divide-line text-sm">
          <PriceRow label="Rental" value={rupees(Number(b.rental_amount ?? 0))} />
          <PriceRow label="Platform fee" value={rupees(Number(b.platform_fee ?? 0))} />
          {Number(b.discount_amount ?? 0) > 0 && <PriceRow label="Discount" value={`− ${rupees(Number(b.discount_amount))}`} />}
          <PriceRow label="Refundable deposit" value={rupees(Number(b.security_deposit_amount ?? 0))} />
          <PriceRow label="Total" value={d.total} bold />
        </div>
        {Number(b.tax_amount ?? 0) > 0 && <p className="mt-1 text-xs text-ink-2">Includes {rupees(Number(b.tax_amount))} in tax.</p>}
        {!d.cancelled && !depositIssue && <div className="mt-3"><DepositStatus booking={b} /></div>}
        {d.cancelled && (
          <p className="mt-3 rounded-row bg-surface-2 px-3 py-2 text-sm text-ink-2">
            {b.cancellation_reason ? String(b.cancellation_reason) : "This booking was cancelled."}{" "}
            {b.payment_status === "SUCCEEDED" && Number(b.cancellation_refund_amount ?? 0) > 0 && `${rupees(Number(b.cancellation_refund_amount))} refund recorded.`}{" "}
            {b.payment_status === "SUCCEEDED" && Number(b.cancellation_penalty_amount ?? 0) > 0 && `${rupees(Number(b.cancellation_penalty_amount))} cancellation fee applied.`}
          </p>
        )}
      </section>

      {/* Reference and cancel */}
      <section className={cn(card, "flex flex-wrap items-center justify-between gap-3")}>
        <div className="min-w-0">
          <p className="text-xs text-ink-2">Booking ID</p>
          <code className="block break-all text-xs text-ink">{bookingId}</code>
          {copyMessage && <p role="status" className="text-xs text-ink-2">{copyMessage}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryAction} onClick={async () => {
            try { await navigator.clipboard.writeText(bookingId); setCopyMessage("Copied"); }
            catch { setCopyMessage("Select the ID to copy it"); }
          }}><Copy size={14} aria-hidden="true" className="mr-1.5" /> Copy ID</button>
          {d.canCancel && <button type="button" className={cn(secondaryAction, "text-danger")} onClick={() => { setError(null); setAction("cancel"); }}>Cancel booking</button>}
        </div>
      </section>

      {action && (
        <Modal open onClose={() => { if (!busy) setAction(null); }}
          title={action === "extend" ? "Request an extension" : "Cancel this booking?"}>
          <p className="mb-4 text-sm text-ink-2">{d.name} · {d.shop}</p>
          {error && <div className="mb-4"><ErrorBox text={error} /></div>}
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
                <button type="button" className={secondaryAction} disabled={busy} onClick={() => setAction(null)}>Keep booking</button>
                <button type="button" className="min-h-10 rounded-row bg-danger px-4 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={busy} onClick={() => void run(async () => {
                    await portalFetch("user", `/bookings/${bookingId}/cancel`, { method: "POST", token });
                  })}>{busy ? "Cancelling…" : "Confirm cancellation"}</button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function NextStep({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <section className={cn(card, "flex flex-wrap items-center justify-between gap-3")} aria-label={title}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 text-sm text-ink-2">{text}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * Help with this booking. One chat per booking: open it if it exists (reopen
 * it if it was resolved), otherwise write the first message here.
 */
function SupportCard({ booking: b, token, onChanged }: { booking: Row; token: string; onChanged: () => void }) {
  const [, navigate] = useLocation();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ticketId = b.support_ticket_id ? String(b.support_ticket_id) : null;
  const resolved = b.support_ticket_status === "RESOLVED";

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t reach support.");
    } finally {
      setBusy(false);
    }
  }

  const start = () => run(async () => {
    const { id } = await portalFetch<{ id: string }>("user", "/tickets", {
      method: "POST", token,
      body: { category: "BOOKING", bookingId: String(b.id), firstMessage: message.trim() },
    });
    onChanged();
    navigate(chatPath(id));
  });
  const reopen = () => run(async () => {
    await portalFetch("user", `/tickets/${ticketId}/reopen`, { method: "POST", token });
    onChanged();
    navigate(chatPath(ticketId));
  });

  return (
    <section className={card} aria-label="Help with this booking">
      <div className="flex items-start gap-3">
        <LifeBuoy size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-2" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-ink">Help with this booking</h2>
          {ticketId ? (
            <>
              <p className="mt-0.5 text-sm text-ink-2">
                {resolved ? "Your support chat for this booking was resolved. Reopen it if something still isn’t right." : "You have a support chat open for this booking."}
              </p>
              {error && <div className="mt-3"><ErrorBox text={error} /></div>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={chatPath(ticketId)} className={resolved ? secondaryAction : primaryAction}>Open chat</Link>
                {resolved && <button type="button" className={primaryAction} disabled={busy} onClick={() => void reopen()}>{busy ? "Reopening…" : "Reopen chat"}</button>}
              </div>
            </>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); if (!busy && message.trim()) void start(); }}>
              <p className="mt-0.5 text-sm text-ink-2">Tell us what’s wrong. RetroMobi support replies in the chat, and can bring the shop in.</p>
              {error && <div className="mt-3"><ErrorBox text={error} /></div>}
              <textarea aria-label="Your message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} disabled={busy}
                placeholder="For example: the shop is closed, or my deposit hasn’t come back."
                className="mt-3 w-full resize-y rounded-row border border-line-strong px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-ink" />
              <button type="submit" className={cn(primaryAction, "mt-2")} disabled={busy || !message.trim()}>{busy ? "Sending…" : "Send to support"}</button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-ink-2">{label}</p><p className="mt-0.5 font-medium text-ink">{value}</p></div>;
}

/**
 * The latest extension on a booking. Extensions are charge-first since Phase
 * 15 — the row is written PENDING and only the payment promotes it — so a
 * PENDING row means the return time has NOT moved yet. A partial unique index
 * allows only one PENDING extension per booking, so the newest row is the
 * whole story.
 */
function ExtensionStatus({ extension: data }: { extension: Row }) {
  const status = String(data.status);
  const amount = rupees(Number(data.payable_amount ?? data.additional_amount ?? 0));

  if (status === "PENDING") {
    return (
      <div className="text-xs bg-warning-soft text-warning rounded-row px-3 py-2">
        <p className="font-medium">Extension to {fmt(data.new_return_at)} is awaiting payment — {amount} due.</p>
        <p className="mt-0.5">
          Keep your current return time until the extension is approved. If the extra time becomes unavailable after payment, you’ll receive a full refund.
        </p>
      </div>
    );
  }
  if (status === "APPROVED") {
    return <p className="text-xs text-verified">Extended to {fmt(data.new_return_at)} — {amount} paid.</p>;
  }
  return <p className="text-xs text-ink-3">Extension to {fmt(data.new_return_at)} was not applied. Keep your scheduled return time.</p>;
}

function DepositStatus({ booking: b }: { booking: Row }) {
  const status = String(b.deposit_status);
  if (status === "HELD") {
    return <p className="text-xs text-ink-3">Deposit held — released automatically on a clean return.</p>;
  }
  if (status === "RELEASED") {
    const amount = rupees(Number(b.deposit_refund_amount ?? 0));
    // Real state, not an invented ETA: "refunded" only once the money landed.
    return b.deposit_refund_status === "SUCCEEDED" ? (
      <p className="text-xs text-verified">Deposit refunded — {amount} back on your original payment method.</p>
    ) : (
      <p className="text-xs text-verified">Deposit released — {amount} sent to your original payment method. Your bank clears it from here.</p>
    );
  }
  if (status === "CLAIMED" || status === "PARTIALLY_DEDUCTED") {
    return (
      <div className="text-xs text-danger bg-danger-soft rounded-row px-3 py-2">
        <p className="font-medium">Deposit claim — {rupees(Number(b.deposit_deducted_amount ?? 0))} deducted.</p>
        {b.deposit_deduction_reason ? <p className="mt-0.5">{String(b.deposit_deduction_reason)}</p> : null}
        <p className="mt-0.5">Use “Help with this booking” below to talk to support about it.</p>
      </div>
    );
  }
  return null;
}

function PriceRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
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
    <div className="space-y-3 text-sm text-ink-2">
      <details className="rounded-row bg-surface-2 px-3 py-2">
        <summary className="cursor-pointer font-medium text-ink">How to record the video</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>Walk around the whole vehicle: front, rear, both sides, mirrors, wheels and body panels.</li>
          <li>Get close-ups of any scratches, dents or broken parts.</li>
          <li>Turn on the display and show the odometer and fuel or battery level.</li>
        </ol>
        <p className="mt-2 text-warning">Keep a copy. Without pickup footage RetroMobi can’t verify pre-existing damage if there’s a deposit dispute.</p>
      </details>
      <label className="block font-medium text-ink">
        Walk-around video
        <input type="file" accept="video/*" capture="environment" disabled={busy} className="mt-2 block w-full text-sm file:mr-3 file:rounded-row file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:font-medium file:transition-colors enabled:file:cursor-pointer enabled:hover:file:bg-line"
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

export function MyBooking() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <BookingDetailBody />
      <Footer />
    </div>
  );
}
