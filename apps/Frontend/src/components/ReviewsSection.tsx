import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, SkeletonRows } from "./ContentFeedback";
import { SearchFailure } from "./SearchFeedback";
import { reviewTimeLabel } from "../lib/format";
import { usePortalSession, usePortalQuery, portalFetch, decodeJwtSubject, PortalApiError, type Row } from "../lib/portal";

async function fetchShopReviews(shopId: string): Promise<{ reviews: Row[] }> {
  const res = await fetch(`/api/user/shops/${shopId}/reviews`);
  if (!res.ok) throw new Error("Couldn't load reviews.");
  return res.json();
}

/** A collected booking at the shop earns one review. */
export function ReviewsSection({
  shopId,
  shopName,
}: {
  shopId: string;
  shopName: string;
}) {
  const [revision, setRevision] = useState(0);
  const queryClient = useQueryClient();
  const queryKey = ["shop-reviews", shopId];
  const query = useQuery({
    queryKey,
    queryFn: () => fetchShopReviews(shopId),
  });
  const { data } = query;
  const reviews = data?.reviews ?? [];
  const refetch = () => {
    setRevision((value) => value + 1);
    void queryClient.invalidateQueries({ queryKey });
  };

  const { session } = usePortalSession("user");
  const myUserId = session ? decodeJwtSubject(session.accessToken) : null;
  const { data: bookingsRes } = usePortalQuery<{ bookings: Row[] }>("user", `/bookings?r=${revision}`, session?.accessToken);
  const eligibleBooking = (bookingsRes?.bookings ?? []).find(
    (b) => b.shop_id === shopId && b.actual_pickup_at != null && !b.deleted_at && !b.has_review,
  );

  return (
    <section className="mt-8">
      <h2 className="font-semibold text-ink mb-3">
        Reviews for {shopName}
      </h2>

      {query.isPending && <SkeletonRows label="Loading reviews" detail />}
      {!data && query.isError && (
        <SearchFailure title="We couldn’t load reviews" onRetry={() => void query.refetch({ cancelRefetch: false })} retrying={query.isFetching} />
      )}
      {data && reviews.length === 0 && <EmptyState title="No reviews yet" />}
      {reviews.length > 0 && (
        <div className="rounded-panel border border-line divide-y divide-line">
          {reviews.map((r) =>
            myUserId && r.user_id === myUserId && session ? (
              <MyReviewRow key={String(r.id)} review={r} token={session.accessToken} onChanged={refetch} />
            ) : (
              <div key={String(r.id)} className="px-4 py-3.5 sm:px-5"><ReviewContent review={r} /></div>
            ),
          )}
        </div>
      )}

      {data && session && eligibleBooking && (
        <LeaveReviewForm key={String(eligibleBooking.id)} bookingId={String(eligibleBooking.id)} token={session.accessToken} onPosted={refetch} />
      )}
    </section>
  );
}

function ReviewContent({ review, actions }: { review: Row; actions?: ReactNode }) {
  const name = typeof review.reviewer_name === "string" && review.reviewer_name.trim() || "RetroMobi rider";
  const postedAt = String(review.created_at);
  const time = reviewTimeLabel(postedAt);
  const rating = Number(review.rating);
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-sm font-semibold text-ink">{name}</p>
          {time && <time className="text-xs text-ink-2" dateTime={postedAt}>{time}</time>}
        </div>
        {actions}
      </div>
      <div role="img" aria-label={`${rating} out of 5 stars`} className="mt-1.5 flex items-center gap-0.5">
        {Array.from({ length: 5 }, (_, index) => <StarIcon key={index} filled={index < rating} />)}
      </div>
      {review.comment ? <p className="mt-1.5 break-words text-sm leading-relaxed text-ink-2">{String(review.comment)}</p> : null}
    </>
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
    <div className="px-4 py-3.5 sm:px-5 bg-surface-2">
      {error && <p className="mb-2 text-sm text-danger bg-danger-soft rounded-row px-3 py-2">{error}</p>}
      <ReviewContent review={r} actions={
        <div className="flex items-center gap-3 text-xs font-medium">
          <button type="button" onClick={() => setEditing(true)} className="text-ink hover:underline">
            Edit
          </button>
          <button type="button" disabled={busy} onClick={remove} className="text-danger hover:underline disabled:opacity-50">
            Delete
          </button>
        </div>
      } />
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
      <p className="text-sm font-medium text-ink mb-3">You rented from this shop. Leave a review.</p>
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
