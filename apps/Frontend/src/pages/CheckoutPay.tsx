import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { ErrorBox } from "../components/AuthFormBits";
import { EmptyState, feedbackActionClass, LoadingSkeleton, SkeletonBlock } from "../components/ContentFeedback";
import { SearchFailure } from "../components/SearchFeedback";
import { usePortalSession, portalFetch, PortalApiError } from "../lib/portal";
import { startCheckout } from "../lib/cashfree";
import { rupees } from "../lib/format";

/**
 * The payment step, addressable by URL.
 *
 * It used to live in Checkout.tsx's React state, which meant a refresh, a back
 * button or a return from the payment gateway lost the screen -- and since
 * submitHold clears the cart, the customer was then bounced to /browse with a
 * real, still-running hold they had no way to pay for. Everything here is read
 * from the server by group id instead.
 */

type PaymentStatus = {
  orderStatus: "ACTIVE" | "PAID" | "EXPIRED" | "TERMINATED" | "TERMINATION_REQUESTED" | null;
  paymentStatus: string | null;
  bookingStatus: string | null;
  totalAmount: number | null;
  holdExpiresAt: string | null;
  totals: {
    rentalAmount: number;
    platformFee: number;
    taxAmount: number;
    discountAmount: number;
    securityDepositAmount: number;
  };
  items: Array<{ make: string; model: string; shopName: string; riderName: string | null }>;
};

/** Server reason codes to something a first-timer can act on. One map, one place. */
const PAYMENT_COPY: Record<string, string> = {
  payments_unavailable:
    "Card and UPI payments aren't available right now. Your hold is safe — try again in a minute.",
  booking_group_not_found: "We can't find this booking. It may have expired.",
  rate_limited: "Too many checks in a row. Give it a few seconds.",
};

function describe(err: unknown): string {
  if (err instanceof PortalApiError && PAYMENT_COPY[err.code]) return PAYMENT_COPY[err.code]!;
  if (err instanceof PortalApiError) return err.message;
  return "Something went wrong. Your hold is safe.";
}

function useStatus(groupId: string | undefined, token: string | undefined) {
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async () => {
    if (!groupId || !token) return null;
    setChecking(true);
    try {
      const next = await portalFetch<PaymentStatus>("user", `/payments/status/${groupId}`, { token });
      setStatus(next);
      setError(null);
      setMissing(false);
      return next;
    } catch (err) {
      if (err instanceof PortalApiError && err.code === "booking_group_not_found") {
        setStatus(null);
        setError(null);
        setMissing(true);
        return null;
      }
      setError(describe(err));
      return null;
    } finally {
      setChecking(false);
    }
  }, [groupId, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, error, refresh, setError, missing, checking };
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="px-5 py-3 flex items-center justify-between gap-4 text-sm">
      <span className="text-ink-3">{label}</span>
      <span className={`text-ink text-right tnum ${bold ? "font-semibold text-base" : "font-medium"}`}>
        {value}
      </span>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="max-w-[760px] w-full mx-auto px-5 py-10 flex-1">{children}</div>
      <Footer />
    </div>
  );
}

function Confirmed() {
  return (
    <div className="mt-6">
      <h1 className="text-2xl font-semibold text-ink mb-1">Payment received</h1>
      <p className="text-sm text-ink-3 mb-6">
        Your booking is confirmed. The shop can see it, and we've texted and emailed you the details.
      </p>
      <Link
        href="/account/bookings"
        className="inline-flex h-11 items-center rounded-row bg-amber px-5 font-semibold text-on-amber hover:brightness-95 transition-[filter]"
      >
        View my bookings
      </Link>
    </div>
  );
}

function HoldUnavailable({ expired = false }: { expired?: boolean }) {
  return (
    <EmptyState
      className="mt-6"
      title={expired ? "Your booking hold expired" : "Booking hold unavailable"}
      description={expired ? "Choose a vehicle again to start a new booking." : "Check My bookings for the latest status or browse for another vehicle."}
    >
      <Link href="/account/bookings" className={feedbackActionClass}>My bookings</Link>
      <Link href="/browse" className={feedbackActionClass}>Browse vehicles</Link>
    </EmptyState>
  );
}

export function CheckoutPay() {
  const { groupId } = useParams<{ groupId: string }>();
  const { session } = usePortalSession("user");
  const [, navigate] = useLocation();
  const { status, error, refresh, setError, missing, checking } = useStatus(groupId, session?.accessToken);
  const [busy, setBusy] = useState(false);
  const [elapsedHold, setElapsedHold] = useState<string | null>(null);
  const holdExpiresAt = status?.holdExpiresAt;

  useEffect(() => {
    if (!holdExpiresAt) return;
    const timeout = window.setTimeout(() => setElapsedHold(holdExpiresAt), Math.max(0, Date.parse(holdExpiresAt) - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [holdExpiresAt]);

  useEffect(() => {
    if (!session) navigate(`/login?next=${encodeURIComponent(`/checkout/pay/${groupId}`)}`);
  }, [session, navigate, groupId]);

  const pay = async () => {
    setError(null);
    setBusy(true);
    try {
      // The intent call is safe to repeat: the order id is derived from the
      // group, the backend reuses the live payment row, and Cashfree's 409 on a
      // repeated order id is handled by reusing the existing session.
      const intent = await portalFetch<{
        paymentSessionId: string;
        mode: "sandbox" | "production";
      }>("user", "/payments/intent", {
        method: "POST",
        token: session!.accessToken,
        body: { groupId },
      });
      await startCheckout(intent);
      // startCheckout navigates away on success. Reaching here means it did not.
      setBusy(false);
    } catch (err) {
      setError(describe(err));
      setBusy(false);
    }
  };

  if (!session) return null;

  if (status?.paymentStatus === "SUCCEEDED" || status?.bookingStatus === "CONFIRMED") {
    return (
      <Shell>
        <Confirmed />
      </Shell>
    );
  }

  const holdExpired = !!holdExpiresAt && (elapsedHold === holdExpiresAt || Date.parse(holdExpiresAt) <= Date.now());
  if (missing || holdExpired) return <Shell><HoldUnavailable expired={holdExpired} /></Shell>;

  return (
    <Shell>
      <Link href="/browse" className="text-sm text-ink-3 hover:text-ink transition-colors">
        ← Back to browse
      </Link>

      <div className="mt-6">
        <h1 className="text-2xl font-semibold text-ink mb-1">Complete payment</h1>
        {status?.holdExpiresAt && (
          <p className="text-sm text-ink-3 mb-6">
            Held until {new Date(status.holdExpiresAt).toLocaleTimeString("en-IN")}.
          </p>
        )}
        {error && (status
          ? <ErrorBox text={error} />
          : <SearchFailure title={error} onRetry={() => void refresh()} retrying={checking} />)}
        {!error && !status && (
          <LoadingSkeleton label="Loading booking and payment details" className="mt-5 space-y-5">
            <div className="space-y-2 rounded-panel border border-line px-5 py-3">
              <SkeletonBlock className="h-4 w-1/3" />
              <SkeletonBlock className="h-4 w-1/2" />
            </div>
            <div className="rounded-panel border border-line divide-y divide-line">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="flex justify-between gap-4 px-5 py-3">
                  <SkeletonBlock className="h-5 w-1/3" />
                  <SkeletonBlock className="h-5 w-20" />
                </div>
              ))}
            </div>
            <SkeletonBlock className="h-11 rounded-row" />
          </LoadingSkeleton>
        )}

        {status && (
          <>
            {status.items.length > 0 && (
              <section className="rounded-panel border border-line divide-y divide-line mb-5">
                {status.items.map((item, i) => (
                  <div key={i} className="px-5 py-3 text-sm">
                    <p className="font-medium text-ink">
                      {item.make} {item.model}
                    </p>
                    <p className="text-ink-3">
                      {item.shopName}
                      {item.riderName ? ` — ${item.riderName}` : ""}
                    </p>
                  </div>
                ))}
              </section>
            )}

            <section className="rounded-panel border border-line divide-y divide-line mb-5">
              <Line label="Rental" value={rupees(status.totals.rentalAmount)} />
              <Line label="Platform fee" value={rupees(status.totals.platformFee)} />
              {status.totals.discountAmount > 0 && (
                <Line label="Discount" value={`− ${rupees(status.totals.discountAmount)}`} />
              )}
              <Line label="Refundable deposit" value={rupees(status.totals.securityDepositAmount)} />
              <Line label="Total payable now" value={rupees(status.totalAmount ?? 0)} bold />
            </section>

            <button
              type="button"
              disabled={busy}
              onClick={pay}
              className="w-full h-11 rounded-row bg-amber text-on-amber font-semibold disabled:opacity-40 hover:brightness-95 transition-[filter]"
            >
              {busy ? "Opening payment…" : "Pay now"}
            </button>
            <p className="mt-3 text-xs text-ink-4 text-center">
              Card, UPI and netbanking, handled by Cashfree. We never see your card details.
            </p>
            {status.paymentStatus === "FAILED" && (
              <p className="mt-2 text-xs text-warning text-center">
                The last attempt didn't go through. Nothing was charged — try again.
              </p>
            )}
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={checking}
              className="mt-4 w-full text-xs text-ink-3 hover:text-ink disabled:opacity-50"
            >
              Already paid? Check again
            </button>
          </>
        )}
      </div>
    </Shell>
  );
}

/**
 * Cashfree's return_url. The browser arrives here with nothing trustworthy --
 * just the group id we put in the URL ourselves -- so the page asks the server,
 * which asks Cashfree. A redirect is not a payment.
 */
export function CheckoutReturn() {
  const { session } = usePortalSession("user");
  const [, navigate] = useLocation();
  const groupId = new URLSearchParams(window.location.search).get("group") ?? undefined;
  const { status, error, refresh, missing, checking } = useStatus(groupId, session?.accessToken);
  const [attempts, setAttempts] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!session) {
      navigate(`/login?next=${encodeURIComponent(`/checkout/return?group=${groupId ?? ""}`)}`);
    }
  }, [session, navigate, groupId]);

  // The webhook and this page race, and the webhook usually wins -- but not
  // always, and a bank can take a few seconds to tell Cashfree anything. So
  // poll a handful of times before giving up, rather than declaring failure on
  // the first ACTIVE.
  const settled = status?.paymentStatus === "SUCCEEDED" || status?.paymentStatus === "FAILED";
  useEffect(() => {
    if (!status || settled || attempts >= 5) return;
    timer.current = setTimeout(() => {
      setAttempts((a) => a + 1);
      void refresh();
    }, 2000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [status, settled, attempts, refresh]);

  if (!session) return null;

  if (!groupId || missing) return <Shell><HoldUnavailable /></Shell>;

  if (status?.paymentStatus === "SUCCEEDED" || status?.bookingStatus === "CONFIRMED") {
    return (
      <Shell>
        <Confirmed />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mt-6">
        {error && (status
          ? <ErrorBox text={error} />
          : <SearchFailure title={error} onRetry={() => void refresh()} retrying={checking} />)}

        {!error && !settled && attempts < 5 && (
          <>
            <h1 className="text-2xl font-semibold text-ink mb-1">Checking your payment…</h1>
            <p className="text-sm text-ink-3">
              Don't close this page. Banks sometimes take a few seconds to confirm.
            </p>
          </>
        )}

        {!settled && attempts >= 5 && (
          <>
            <h1 className="text-2xl font-semibold text-ink mb-1">Still confirming</h1>
            <p className="text-sm text-ink-3 mb-6">
              Your payment hasn't reached us yet. If it went through we'll confirm the booking within a
              few minutes and text you — nothing is lost either way, and you will not be charged twice.
            </p>
            <Link href="/account/bookings" className="text-sm font-medium text-ink hover:underline">
              View my bookings →
            </Link>
          </>
        )}

        {status?.paymentStatus === "FAILED" && (
          <>
            <h1 className="text-2xl font-semibold text-ink mb-1">Payment didn't go through</h1>
            <p className="text-sm text-ink-3 mb-6">Nothing was charged. You can try again.</p>
            <Link
              href={`/checkout/pay/${groupId}`}
              className="inline-flex h-11 items-center rounded-row bg-amber px-5 font-semibold text-on-amber hover:brightness-95 transition-[filter]"
            >
              Try again
            </Link>
          </>
        )}
      </div>
    </Shell>
  );
}
