import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Header } from "../../components/Header";
import { Footer } from "../../components/Footer";
import { ErrorBox } from "../../components/AuthFormBits";
import { EmptyState, SkeletonRows } from "../../components/ContentFeedback";
import { usePortalSession, usePortalQuery, type Row } from "../../lib/portal";
import { dateLabel, rupees } from "../../lib/format";

// Every live coupon with its rules in plain words (GET /api/user/coupons).
// Whether one fits THIS booking is decided at checkout, where the cart exists.

function rules(c: Row): string[] {
  const cond = (c.conditions ?? {}) as Record<string, unknown>;
  const out: string[] = [];
  if (Number(c.min_order_amount) > 0) out.push(`Rental total of ${rupees(Number(c.min_order_amount))} or more`);
  if (cond.firstBookingOnly) out.push("Your first booking only");
  if (cond.minCompletedRentals != null) out.push(`After ${cond.minCompletedRentals} completed rides`);
  if (cond.maxCompletedRentals != null) out.push(`Up to ${cond.maxCompletedRentals} completed rides`);
  if (cond.newUserWithinDays != null) out.push(`Accounts under ${cond.newUserWithinDays} days old`);
  if (cond.minRentalDays != null) out.push(`Rentals of ${cond.minRentalDays}+ days`);
  if (cond.minRiderAge != null || cond.maxRiderAge != null) {
    out.push(`Riders aged ${cond.minRiderAge ?? 16}${cond.maxRiderAge != null ? `–${cond.maxRiderAge}` : "+"}`);
  }
  if (cond.birthdayWindowDays != null) out.push(`Pickup within ${cond.birthdayWindowDays} days of your birthday`);
  if (Array.isArray(cond.pickupWeekdays)) {
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    out.push(`Pickup on ${(cond.pickupWeekdays as number[]).map((d) => names[d]).join(", ")}`);
  }
  if (Array.isArray(cond.modelIds)) out.push("Selected scooter models only");
  if (c.per_user_limit != null) out.push(`${c.per_user_limit} use${Number(c.per_user_limit) === 1 ? "" : "s"} per customer`);
  return out;
}

function MyCouponsBody() {
  const { session } = usePortalSession("user");
  const [, navigate] = useLocation();
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!session) navigate("/login?next=" + encodeURIComponent("/account/coupons"));
  }, [session, navigate]);

  const { data, error } = usePortalQuery<{ coupons: Row[] }>("user", session ? "/coupons" : null, session?.accessToken);
  const coupons = data?.coupons ?? [];

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
    } catch {
      // Clipboard blocked: the code is on screen to type.
    }
  }

  return (
    <main className="max-w-[880px] w-full mx-auto px-5 py-8 sm:py-10 flex-1 min-h-[calc(100dvh-4rem)]">
      <h1 className="text-2xl font-semibold text-ink mb-1">Coupons</h1>
      <p className="text-sm text-ink-3 mb-6">
        Apply a code at checkout. Checkout also lists the ones that fit your booking.
      </p>
      {error && <ErrorBox text={error} />}
      {!error && !data && <SkeletonRows label="Loading coupons" />}
      {data && coupons.length === 0 && (
        <EmptyState title="No coupons right now" description="New offers show up here.">
          <Link href="/browse" className="text-sm font-medium text-ink underline">Browse scooters</Link>
        </EmptyState>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {coupons.map((c) => {
          const shops = (c.shop_names as string[] | null) ?? [];
          return (
            <li key={String(c.code)} className="rounded-panel border border-line p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-ink">
                    {c.type === "PERCENT" ? `${c.value}% off` : `${rupees(Number(c.value))} off`}
                    {c.type === "PERCENT" && c.max_discount != null && (
                      <span className="text-sm font-normal text-ink-3"> · up to {rupees(Number(c.max_discount))}</span>
                    )}
                  </p>
                  {!!c.description && <p className="text-sm text-ink-2">{String(c.description)}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => copy(String(c.code))}
                  className="shrink-0 rounded-row border border-dashed border-line-strong px-3 py-1.5 text-sm font-semibold text-ink"
                >
                  {copied === c.code ? "Copied" : String(c.code)}
                </button>
              </div>
              <ul className="mt-3 flex flex-col gap-1 text-xs text-ink-3">
                {shops.length > 0 && <li>At {shops.join(", ")}</li>}
                {rules(c).map((r) => <li key={r}>{r}</li>)}
                <li>Valid until {dateLabel(c.valid_until)}</li>
              </ul>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

export function MyCoupons() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <MyCouponsBody />
      <Footer />
    </div>
  );
}
