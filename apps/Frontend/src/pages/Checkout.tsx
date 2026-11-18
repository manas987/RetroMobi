import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { combine, splitIso } from "../components/DateTimeField";
import { DateRangeField } from "../components/DateRangeField";
import { ErrorBox, SubmitButton, TextField } from "../components/AuthFormBits";
import { CouponField } from "../components/CouponField";
import { Modal } from "../components/Modal";
import { EmptyState, feedbackActionClass, SkeletonRows } from "../components/ContentFeedback";
import { useCart } from "../lib/cart";
import { usePortalSession, usePortalQuery, portalFetch, PortalApiError, type Row } from "../lib/portal";
import { defaultWindow, toIsoWithOffset } from "../lib/searchParams";

// Only the group id is used: everything the payment screen shows is read back
// from the server by group id, not carried over in React state.
type HoldResult = { groupId: string };

export function Checkout() {
  const { items, clear, revalidate } = useCart();
  const { session } = usePortalSession("user");
  const [, navigate] = useLocation();

  // Again here, not only on login: this is the last point before money, and the
  // gap between the cart page and this one is long enough for a shop to take a
  // scooter off the road. If it empties the cart the guard below bounces to
  // /browse, with the toast explaining why.
  useEffect(() => {
    void revalidate();
  }, [revalidate]);

  // One row per physical unit — a qty-2 cart line needs two riders, one each.
  const vehicles = items.flatMap((i) =>
    i.vehicleIds.map((vehicleId) => ({ vehicleId, make: i.make, model: i.model, shopName: i.shopName })),
  );

  useEffect(() => {
    if (!session) navigate(`/login?next=${encodeURIComponent("/checkout")}`);
  }, [session, navigate]);

  // Set the instant the hold succeeds, before the cart is cleared. Without it
  // the empty-cart guard below fires on the way out and bounces the customer to
  // /browse instead of the payment page they are being sent to.
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (session && items.length === 0 && !leaving) navigate("/browse", { replace: true });
  }, [session, items.length, leaving, navigate]);

  const { data: ridersRes, error: ridersError } = usePortalQuery<{ riders: Row[] }>(
    "user",
    "/riders",
    session?.accessToken,
  );

  const lastDatedItem = items.findLast((item) => item.pickupAt && item.returnAt);
  const win = lastDatedItem?.pickupAt && lastDatedItem.returnAt
    ? { pickupAt: lastDatedItem.pickupAt, returnAt: lastDatedItem.returnAt }
    : defaultWindow();
  const initPickup = splitIso(win.pickupAt);
  const initReturn = splitIso(win.returnAt);
  const [pickupDate, setPickupDate] = useState(initPickup.date);
  const [pickupTime, setPickupTime] = useState(initPickup.time);
  const [returnDate, setReturnDate] = useState(initReturn.date);
  const [returnTime, setReturnTime] = useState(initReturn.time);

  // One rider per cart item -- the shop checks that rider's original licence
  // at pickup, so the booking has to say who is riding what.
  const [riderByVehicle, setRiderByVehicle] = useState<Record<string, string | null>>({});

  const [addingRider, setAddingRider] = useState(false);
  const [riderName, setRiderName] = useState("");
  // usePortalQuery can't refetch, so riders added here are kept alongside the loaded list.
  const [addedRiders, setAddedRiders] = useState<Row[]>([]);
  // Beta: no online licence check. Both statements are sent with the hold (LICENCE_DECLARATION on the server).
  const [validLicence, setValidLicence] = useState(false);
  const [cancelIfMissing, setCancelIfMissing] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const riders = [...(ridersRes?.riders ?? []), ...addedRiders];
  const assignedRiders = vehicles.map((v) => riderByVehicle[v.vehicleId]);
  const allAssigned = assignedRiders.every(Boolean) && new Set(assignedRiders).size === vehicles.length;
  const declared = validLicence && cancelIfMissing;

  // What the hold will be asked for, once every scooter has a rider.
  // The coupon step prices exactly this.
  const cart = allAssigned
    ? {
        items: vehicles.map((v) => ({ vehicleId: v.vehicleId, riderId: riderByVehicle[v.vehicleId]! })),
        pickupAt: toIsoWithOffset(combine(pickupDate, pickupTime)),
        returnAt: toIsoWithOffset(combine(returnDate, returnTime)),
      }
    : null;
  const [coupon, setCoupon] = useState<{ code: string; description: string | null; discountAmount: number } | null>(null);

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const addRider = () =>
    run(async () => {
      const rider = await portalFetch<Row>("user", "/riders", {
        method: "POST",
        token: session!.accessToken,
        body: { name: riderName },
      });
      setAddingRider(false);
      setRiderName("");
      setAddedRiders((prev) => [...prev, rider]);
      // Straight onto the first vehicle still without a rider.
      const open = vehicles.find((v) => !riderByVehicle[v.vehicleId]);
      if (open) setRiderByVehicle((prev) => ({ ...prev, [open.vehicleId]: String(rider.id) }));
    });

  const submitHold = () =>
    run(async () => {
      const result = await portalFetch<HoldResult>("user", "/bookings", {
        method: "POST",
        token: session!.accessToken,
        body: {
          items: vehicles.map((v) => ({ vehicleId: v.vehicleId, riderId: riderByVehicle[v.vehicleId] })),
          pickupAt: toIsoWithOffset(combine(pickupDate, pickupTime)),
          returnAt: toIsoWithOffset(combine(returnDate, returnTime)),
          ...(coupon ? { couponCode: coupon.code } : {}),
          licenceDeclaration: { validLicence: true, cancelIfMissing: true },
        },
      });
      // The payment step lives at its own URL, loaded from the server, so a
      // refresh or a return from the gateway cannot lose it.
      setLeaving(true);
      clear();
      navigate(`/checkout/pay/${result.groupId}`);
    });

  if (!session) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="max-w-[760px] w-full mx-auto px-5 py-10 flex-1">
        <Link href="/browse" className="text-sm text-ink-3 hover:text-ink transition-colors">
          ← Back to browse
        </Link>

        {items.length > 0 && (
          <div className="mt-6">
            <h1 className="text-2xl font-semibold text-ink mb-1">
              Checkout — {vehicles.length} scooter{vehicles.length === 1 ? "" : "s"}
            </h1>
            <p className="text-sm text-ink-3 mb-6">One hold, same pickup and return window for everything.</p>

            {error && <ErrorBox text={error} />}

            <section className="rounded-panel border border-line p-5 mb-5">
              <h2 className="font-semibold text-ink mb-3">1. Dates</h2>
              <DateRangeField
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
            </section>

            <section className="rounded-panel border border-line p-5 mb-5">
              <h2 className="font-semibold text-ink mb-3">2. Riders</h2>

              {ridersError && <p className="text-sm text-danger">{ridersError}</p>}

              <div className="flex flex-col gap-4">
                {vehicles.map((item) => (
                  <div key={item.vehicleId}>
                    <p className="text-sm font-medium text-ink mb-2">
                      {item.make} {item.model} <span className="text-ink-3 font-normal">— {item.shopName}</span>
                    </p>
                    {riders.length > 0 && <div className="flex flex-col gap-2">
                      {riders.map((r) => {
                        // One person can't ride two scooters at once -- a rider already
                        // assigned to a different vehicle in this checkout can't be picked again.
                        const takenElsewhere = Object.entries(riderByVehicle).some(
                          ([vehicleId, riderId]) => vehicleId !== item.vehicleId && riderId === r.id,
                        );
                        return (
                          <label
                            key={String(r.id)}
                            className={`flex items-center justify-between gap-3 rounded-row border border-line-strong px-3 py-2.5 has-[:checked]:border-ink ${
                              takenElsewhere ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`rider-${item.vehicleId}`}
                                checked={riderByVehicle[item.vehicleId] === r.id}
                                disabled={takenElsewhere}
                                onChange={() =>
                                  setRiderByVehicle((prev) => ({ ...prev, [item.vehicleId]: String(r.id) }))
                                }
                              />
                              <span className="text-sm text-ink font-medium">{String(r.name)}</span>
                            </span>
                            {takenElsewhere && <span className="text-xs text-ink-4">Riding another scooter</span>}
                          </label>
                        );
                      })}
                    </div>}
                  </div>
                ))}
              </div>

              {!ridersError && !ridersRes && <SkeletonRows label="Loading riders" />}
              {ridersRes && riders.length === 0 && (
                <EmptyState title="No riders added yet" description="Add the person who will ride so you can assign them to a vehicle.">
                  <button type="button" onClick={() => setAddingRider(true)} className={feedbackActionClass}>Add a rider</button>
                </EmptyState>
              )}

              {riders.length > 0 && <button
                type="button"
                onClick={() => setAddingRider(true)}
                className="text-sm text-ink-2 hover:text-ink font-medium mt-4"
              >
                + Add a rider
              </button>}

              <Modal open={addingRider} onClose={() => setAddingRider(false)} title="Add a rider">
                <TextField label="Rider name" value={riderName} onChange={setRiderName} autoFocus />
                <SubmitButton busy={busy} onClick={addRider} disabled={!riderName}>
                  Add rider
                </SubmitButton>
              </Modal>
            </section>

            <section className="rounded-panel border border-line p-5 mb-5">
              <h2 className="font-semibold text-ink">3. Driving licence</h2>
              <p className="text-sm text-ink-3 mt-1 mb-4">
                No uploads. The shop checks each rider’s original licence when you collect the vehicle.
              </p>
              <div className="flex flex-col gap-2">
                {([
                  [validLicence, setValidLicence, "Every rider has a valid driving licence for the vehicle they’re riding."],
                  [cancelIfMissing, setCancelIfMissing, "I’ll bring the original licence to pickup. If the shop can’t check it, the booking is cancelled: the deposit is refunded, the rental isn’t."],
                ] as const).map(([checked, set, label]) => (
                  <label
                    key={label}
                    className="flex gap-3 items-start rounded-row border border-line-strong px-3 py-3 text-sm text-ink cursor-pointer hover:border-ink-4 has-[:checked]:border-ink has-[:checked]:bg-surface-2 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => set(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-ink)]"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-ink-2 font-medium hover:text-ink">Cancellation policy</summary>
                <ul className="mt-2 space-y-1 text-ink-2">
                  <li>More than 24 hours before pickup · 90% of the rental refunded</li>
                  <li>2–24 hours before pickup · 50% of the rental refunded</li>
                  <li>Under 2 hours until pickup, or refused at pickup · No rental refund</li>
                </ul>
                <p className="mt-2 text-ink-2">The security deposit is always refunded in full. Platform fees and taxes are not refunded.</p>
              </details>
            </section>
            <CouponField token={session.accessToken} cart={cart} applied={coupon} onApplied={setCoupon} />

            <button
              type="button"
              disabled={busy || !allAssigned || !declared}
              onClick={submitHold}
              className="w-full h-11 rounded-row bg-amber text-on-amber font-semibold disabled:opacity-40 hover:brightness-95 transition-[filter]"
            >
              {busy ? "Working…" : "Continue to payment"}
            </button>
            {ridersRes && (!allAssigned || !declared) && (
              <p className="mt-2 text-xs text-warning text-center">
                {!allAssigned ? "Choose a different rider for each scooter" : "Tick both licence statements"} to continue.
              </p>
            )}
          </div>
        )}

      </div>
      <Footer />
    </div>
  );
}
