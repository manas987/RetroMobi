import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePortalSession, usePortalQuery, portalFetch, decodeJwtSubject, PortalApiError, type Row } from "../lib/portal";

async function fetchShopReviews(shopId: string): Promise<{ reviews: Row[] }> {
  const res = await fetch(`/api/user/shops/${shopId}/reviews`);
  if (!res.ok) throw new Error("Couldn't load reviews.");
  return res.json();
}

/** Shop-level reviews (RetroMobi reviews shops, not individual vehicles) —
 *  public list, plus a "leave a review" form for a signed-in customer whose
 *  own booking of this vehicle has actually been collected. That's the exact
 *  qualification the backend enforces (reviewsService.createReview requires
 *  a booking with actual_pickup_at set, owned by the caller). */
/** `vehicleId` scopes "can I review this?" to the vehicle actually being
 *  viewed. Omit it on a shop page: reviews are shop-level, so any picked-up
 *  booking at this shop earns the right to write one. */
export function ReviewsSection({
  shopId,
  shopName,
  vehicleId,
}: {
  shopId: string;
  shopName: string;
  vehicleId?: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["shop-reviews", shopId];
  const { data } = useQuery({
    queryKey,
    queryFn: () => fetchShopReviews(shopId),
  });
  const reviews = data?.reviews ?? [];
  const refetch = () => queryClient.invalidateQueries({ queryKey });

  const { session } = usePortalSession("user");
  const myUserId = session ? decodeJwtSubject(session.accessToken) : null;
  const myReview = reviews.find((r) => r.user_id === myUserId);

  const { data: bookingsRes } = usePortalQuery<{ bookings: Row[] }>("user", "/bookings", session?.accessToken);
  const eligibleBooking = (bookingsRes?.bookings ?? []).find(
    (b) =>
      (vehicleId ? b.vehicle_id === vehicleId : b.shop_id === shopId) && b.actual_pickup_at != null,
  );

  return (
    <section className="mt-8">
      <h2 className="flex items-center gap-2 font-semibold text-ink mb-3">
        <StarIcon /> Reviews for {shopName}
      </h2>

      {reviews.length === 0 ? (
        <p className="text-sm text-ink-3 bg-surface-2 rounded-panel px-5 py-4">
          No reviews yet — this shop hasn't had one written about it.
        </p>
      ) : (
        <div className="rounded-panel border border-line divide-y divide-line">
          {reviews.map((r) =>
            r.id === myReview?.id && session ? (
              <MyReviewRow key={String(r.id)} review={r} token={session.accessToken} onChanged={refetch} />
            ) : (
              <div key={String(r.id)} className="px-5 py-4">
                <div className="flex items-center gap-1.5 mb-1">
                  {Array.from({ length: 5 }, (_, i) => (
                    <StarIcon key={i} filled={i < Number(r.rating)} />
                  ))}
                  <span className="text-xs text-ink-4 ml-1">
                    {new Date(String(r.created_at)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
                {r.comment ? <p className="text-sm text-ink-2">{String(r.comment)}</p> : null}
              </div>
            ),
          )}
        </div>
      )}

      {session && eligibleBooking && !myReview && (
        <LeaveReviewForm bookingId={String(eligibleBooking.id)} token={session.accessToken} onPosted={refetch} />
      )}
    </section>
  );
}

function MyReviewRow({ review: r, token, onChanged }: { review: Row; token: string; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(Number(r.rating));
  const [comment, setComment] = useState(String(r.comment ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("user", `/reviews/${r.id}`, { method: "PATCH", token, body: { rating, comment: comment || undefined } });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("user", `/reviews/${r.id}`, { method: "DELETE", token });
      onChanged();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't delete that.");
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="px-5 py-4 bg-surface-2">
        {error && <p className="mb-3 text-sm text-danger bg-danger-soft rounded-row px-3 py-2">{error}</p>}
        <div className="flex items-center gap-1 mb-3">
          {Array.from({ length: 5 }, (_, i) => (
            <button key={i} type="button" onClick={() => setRating(i + 1)} aria-label={`${i + 1} stars`}>
              <StarIcon filled={i < rating} />
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          className="w-full rounded-row border border-line-strong px-3 py-2 text-sm outline-none focus:border-ink mb-3"
        />
        <div className="flex items-center gap-3">
          <button type="button" disabled={busy} onClick={save} className="h-9 px-4 rounded-row bg-ink text-surface font-medium text-sm disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" disabled={busy} onClick={() => setEditing(false)} className="text-sm text-ink-3 hover:text-ink">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-4 bg-surface-2">
      {error && <p className="mb-2 text-sm text-danger bg-danger-soft rounded-row px-3 py-2">{error}</p>}
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: 5 }, (_, i) => (
            <StarIcon key={i} filled={i < Number(r.rating)} />
          ))}
          <span className="text-xs text-ink-4 ml-1">Your review</span>
        </div>
        <div className="flex items-center gap-3 text-xs font-medium">
          <button type="button" onClick={() => setEditing(true)} className="text-ink hover:underline">
            Edit
          </button>
          <button type="button" disabled={busy} onClick={remove} className="text-danger hover:underline disabled:opacity-50">
            Delete
          </button>
        </div>
      </div>
      {r.comment ? <p className="text-sm text-ink-2">{String(r.comment)}</p> : null}
    </div>
  );
}

function LeaveReviewForm({ bookingId, token, onPosted }: { bookingId: string; token: string; onPosted: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "already">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setStatus("busy");
    setError(null);
    try {
      await portalFetch("user", "/reviews", {
        method: "POST",
        token,
        body: { bookingId, rating, comment: comment || undefined },
      });
      setStatus("done");
      onPosted();
    } catch (err) {
      if (err instanceof PortalApiError && err.status === 409) {
        setStatus("already");
        onPosted();
        return;
      }
      setError(err instanceof Error ? err.message : "Couldn't submit that.");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return <p className="mt-4 text-sm text-verified">Thanks — your review is posted.</p>;
  }
  if (status === "already") {
    return null;
  }

  return (
    <div className="mt-4 rounded-panel border border-line p-5">
      <p className="text-sm font-medium text-ink mb-3">You collected this scooter — leave a review</p>
      {error && <p className="mb-3 text-sm text-danger bg-danger-soft rounded-row px-3 py-2">{error}</p>}
      <div className="flex items-center gap-1 mb-3">
        {Array.from({ length: 5 }, (_, i) => (
          <button key={i} type="button" onClick={() => setRating(i + 1)} aria-label={`${i + 1} stars`}>
            <StarIcon filled={i < rating} />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="How was the shop, the vehicle's condition, the handover? (optional)"
        rows={3}
        className="w-full rounded-row border border-line-strong px-3 py-2 text-sm outline-none focus:border-ink mb-3"
      />
      <button
        type="button"
        disabled={status === "busy"}
        onClick={submit}
        className="h-11 px-5 rounded-row bg-ink text-surface font-medium text-sm disabled:opacity-50"
      >
        {status === "busy" ? "Posting…" : "Post review"}
      </button>
    </div>
  );
}

function StarIcon({ filled = true }: { filled?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.5}
      className={filled ? "text-amber-edge" : "text-ink-4"}
      aria-hidden="true"
    >
      <path d="M12 2.5l2.9 6.4 6.9.7-5.2 4.8 1.5 6.9L12 17.9 5.9 21.3l1.5-6.9-5.2-4.8 6.9-.7z" />
    </svg>
  );
}
