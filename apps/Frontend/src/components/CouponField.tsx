import { useEffect, useState } from "react";
import { portalFetch, PortalApiError } from "../lib/portal";
import { rupees } from "../lib/format";

type Cart = { items: Array<{ vehicleId: string; riderId: string }>; pickupAt: string; returnAt: string };
type Offer = { code: string; description: string | null; discountAmount: number };

/**
 * Checkout's coupon step. The server prices the cart and judges the coupon with
 * the same code the hold uses (Routes/user/Coupons), so the discount shown here
 * is the discount charged. `cart` is null until every scooter has a rider,
 * because age rules are judged per rider.
 */
export function CouponField({
  token,
  cart,
  applied,
  onApplied,
}: {
  token: string;
  cart: Cart | null;
  applied: Offer | null;
  onApplied: (offer: Offer | null) => void;
}) {
  const [code, setCode] = useState("");
  const [offers, setOffers] = useState<Offer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cartKey = cart ? JSON.stringify(cart) : null;

  // A changed cart (dates, riders) can change eligibility, so the list is
  // refetched and an applied coupon is re-checked.
  useEffect(() => {
    if (!cart) {
      setOffers([]);
      return;
    }
    let live = true;
    portalFetch<{ coupons: Offer[] }>("user", "/coupons/applicable", { method: "POST", token, body: cart })
      .then((r) => live && setOffers(r.coupons))
      .catch(() => live && setOffers([]));
    if (applied) void apply(applied.code);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, token]);

  async function apply(value: string) {
    if (!cart) return;
    setBusy(true);
    setError(null);
    try {
      const offer = await portalFetch<Offer>("user", "/coupons/preview", {
        method: "POST",
        token,
        body: { ...cart, couponCode: value.trim() },
      });
      onApplied(offer);
      setCode("");
    } catch (err) {
      onApplied(null);
      setError(err instanceof PortalApiError ? err.message : "Couldn't check that coupon.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-panel border border-line p-5 mb-5">
      <h2 className="font-semibold text-ink mb-3">3. Coupon</h2>
      {!cart && <p className="text-sm text-ink-3">Pick a rider for every scooter to see coupons for this booking.</p>}
      {cart && applied && (
        <div className="flex items-center justify-between gap-3 rounded-row bg-surface-2 px-4 py-3">
          <span className="text-sm text-ink">
            <span className="font-semibold">{applied.code}</span> applied · {rupees(applied.discountAmount)} off
          </span>
          <button type="button" className="text-sm text-ink-2 hover:text-ink font-medium" onClick={() => onApplied(null)}>
            Remove
          </button>
        </div>
      )}
      {cart && !applied && (
        <>
          <div className="flex gap-2">
            <input
              aria-label="Coupon code"
              placeholder="Coupon code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="h-11 flex-1 rounded-row border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-ink"
            />
            <button
              type="button"
              disabled={busy || !code.trim()}
              onClick={() => apply(code)}
              className="h-11 rounded-row border border-line-strong px-4 text-sm font-semibold text-ink disabled:opacity-40"
            >
              Apply
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}
          {offers.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {offers.map((o) => (
                <li key={o.code}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => apply(o.code)}
                    className="flex w-full items-center justify-between gap-3 rounded-row border border-line px-4 py-3 text-left hover:border-ink"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-ink">{o.code}</span>
                      {o.description && <span className="block text-xs text-ink-3">{o.description}</span>}
                    </span>
                    <span className="text-sm font-semibold text-ink">{rupees(o.discountAmount)} off</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
