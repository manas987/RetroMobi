import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { combine, splitIso } from "../components/DateTimeField";
import { DateRangeField } from "../components/DateRangeField";
import { ErrorBox, SubmitButton, TextField } from "../components/AuthFormBits";
import { RiderVerification } from "../components/RiderVerification";
import { Modal } from "../components/Modal";
import { EmptyState, feedbackActionClass, SkeletonRows } from "../components/ContentFeedback";
import { useCart } from "../lib/cart";
import { usePortalSession, usePortalQuery, portalFetch, PortalApiError, type Row } from "../lib/portal";
import { defaultWindow, toIsoWithOffset } from "../lib/searchParams";

// Only the group id is used: everything the payment screen shows is read back
// from the server by group id, not carried over in React state.
type HoldResult = { groupId: string };

export function Checkout() {
  const { items, clear } = useCart();
  const { session } = usePortalSession("user");
  const [, navigate] = useLocation();

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

  const win = defaultWindow();
  const initPickup = splitIso(win.pickupAt);
  const initReturn = splitIso(win.returnAt);
  const [pickupDate, setPickupDate] = useState(initPickup.date);
  const [pickupTime, setPickupTime] = useState(initPickup.time);
  const [returnDate, setReturnDate] = useState(initReturn.date);
  const [returnTime, setReturnTime] = useState(initReturn.time);

  // One rider per cart item — most groups still have each vehicle attributed
  // to whoever's actually riding it, since the backend verifies each rider's
  // own licence independently.
  const [riderByVehicle, setRiderByVehicle] = useState<Record<string, string | null>>({});

  const [addingRider, setAddingRider] = useState(false);
  const [riderName, setRiderName] = useState("");
  const [verifyingRiderId, setVerifyingRiderId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const riders = ridersRes?.riders ?? [];

  function riderVerified(riderId: string | null): boolean {
    const rider = riders.find((r) => r.id === riderId);
    return (
      rider?.licence_status === "VERIFIED" &&
      typeof rider.licence_expires_on === "string" &&
      new Date(rider.licence_expires_on) >= returnDate
    );
  }

  const allAssignedAndVerified = vehicles.every((v) => riderVerified(riderByVehicle[v.vehicleId] ?? null));

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
      setVerifyingRiderId(String(rider.id));
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
                            {takenElsewhere ? (
                              <span className="text-xs text-ink-4">Riding another scooter</span>
                            ) : r.licence_status === "VERIFIED" ? (
                              <span className="text-xs text-verified font-medium">Licence verified</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setVerifyingRiderId(String(r.id))}
                                className="text-xs text-amber-edge font-medium hover:underline"
                              >
                                Verify licence
                              </button>
                            )}
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

              <Modal
                open={Boolean(verifyingRiderId)}
                onClose={() => setVerifyingRiderId(null)}
                title="Verify driving licence"
              >
                {verifyingRiderId && (
                  <RiderVerification
                    riderId={verifyingRiderId}
                    riderName={String(
                      riders.find((r) => String(r.id) === verifyingRiderId)?.name ?? "",
                    )}
                    token={session!.accessToken}
                    onDone={() => {
                      setVerifyingRiderId(null);
                      // usePortalQuery's state is not shared with the riders
                      // list here, so a reload is the simplest way to pick up
                      // the fresh licence status.
                      window.location.reload();
                    }}
                    onCancel={() => setVerifyingRiderId(null)}
                  />
                )}
              </Modal>

              <Modal open={addingRider} onClose={() => setAddingRider(false)} title="Add a rider">
                <TextField label="Rider name" value={riderName} onChange={setRiderName} autoFocus />
                <SubmitButton busy={busy} onClick={addRider} disabled={!riderName}>
                  Add rider
                </SubmitButton>
              </Modal>
            </section>

            <button
              type="button"
              disabled={busy || !allAssignedAndVerified}
              onClick={submitHold}
              className="w-full h-11 rounded-row bg-amber text-on-amber font-semibold disabled:opacity-40 hover:brightness-95 transition-[filter]"
            >
              {busy ? "Working…" : "Continue to payment"}
            </button>
            {ridersRes && !allAssignedAndVerified && (
              <p className="mt-2 text-xs text-warning text-center">
                Every scooter needs a rider with a verified licence (covering the full return date) before booking.
              </p>
            )}
          </div>
        )}

      </div>
      <Footer />
    </div>
  );
}
