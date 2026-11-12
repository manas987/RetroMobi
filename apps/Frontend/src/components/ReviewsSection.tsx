import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, SkeletonRows } from "./ContentFeedback";
import { SearchFailure } from "./SearchFeedback";
import { Modal } from "./Modal";
import { reviewTimeLabel } from "../lib/format";
import { usePortalSession, usePortalQuery, portalFetch, decodeJwtSubject, PortalApiError, type Row } from "../lib/portal";

async function fetchShopReviews(shopId: string): Promise<{ reviews: Row[] }> {
  const res = await fetch(`/api/user/shops/${shopId}/reviews`);
  if (!res.ok) throw new Error("Couldn't load reviews.");
  return res.json();
}

/** Each completed rental at the shop earns one review. */
export function ReviewsSection({
  shopId,
  shopName,
  reviewBookingId,
}: {
  shopId: string;
  shopName: string;
  reviewBookingId?: string | null;
}) {
  const [revision, setRevision] = useState(0);
  const [openBookingId, setOpenBookingId] = useState(reviewBookingId ?? null);
  const [posted, setPosted] = useState(false);
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
  const eligible = (bookingsRes?.bookings ?? []).filter(
    (b) => b.shop_id === shopId && b.status === "COMPLETED" && !!b.actual_return_at && !b.deleted_at && !b.has_review,
  );
  const selected = eligible.find((booking) => booking.id === openBookingId);
  useEffect(() => {
    if (reviewBookingId) document.getElementById("shop-reviews")?.scrollIntoView({ block: "start" });
  }, [reviewBookingId]);

  return (
    <section id="shop-reviews" className="mt-8 scroll-mt-24">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-ink">Reviews for {shopName}</h2>
        {reviewBookingId !== undefined && eligible.length > 0 && (
          <button type="button" onClick={() => { setPosted(false); setOpenBookingId(String(eligible[0]!.id)); }}
            className="min-h-9 rounded-row border border-line-strong px-3 text-sm font-medium text-ink hover:bg-surface-2">
            Write a review
          </button>
        )}
      </div>
      {posted && <p role="status" className="mb-3 text-sm text-verified">Thanks for sharing your experience. Your review is posted.</p>}

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

      {session && selected && (
        <Modal open onClose={() => setOpenBookingId(null)} title="Review your rental">
          <LeaveReviewForm key={String(selected.id)} bookingId={String(selected.id)} shopName={shopName}
            vehicle={[selected.make, selected.model].filter(Boolean).join(" ")} token={session.accessToken} onPosted={(success) => {
              setOpenBookingId(null);
              setPosted(success);
              refetch();
            }} />
        </Modal>
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

function LeaveReviewForm({ bookingId, shopName, vehicle, token, onPosted }: {
  bookingId: string; shopName: string; vehicle: string; token: string; onPosted: (success: boolean) => void;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("user", "/reviews", {
        method: "POST",
        token,
        body: { bookingId, rating, comment: comment || undefined },
      });
      onPosted(true);
    } catch (err) {
      if (err instanceof PortalApiError && err.status === 409) {
        onPosted(false);
        return;
      }
      setError(err instanceof Error ? err.message : "Couldn't submit that.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-row bg-surface-2 px-4 py-3">
        <p className="text-sm font-semibold text-ink">{vehicle}</p>
        <p className="text-sm text-ink-2">{shopName}</p>
      </div>
      {error && <p className="mb-3 text-sm text-danger bg-danger-soft rounded-row px-3 py-2">{error}</p>}
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-ink">How was your experience?</legend>
        <div className="flex flex-wrap gap-1">
        {Array.from({ length: 5 }, (_, i) => (
          <button key={i} type="button" onClick={() => setRating(i + 1)} aria-label={`Rate ${i + 1} out of 5`}
            aria-pressed={rating === i + 1} className="grid size-10 place-items-center rounded-row hover:bg-surface-2 [&_svg]:size-5">
            <StarIcon filled={i < rating} />
          </button>
        ))}
        </div>
      </fieldset>
      <label className="block text-sm font-medium text-ink">Tell us more <span className="font-normal text-ink-2">(optional)</span>
        <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="How was pickup, the vehicle, or the shop’s service?"
        rows={3}
        className="mt-1.5 w-full rounded-row border border-line-strong px-3 py-2 text-sm font-normal outline-none focus:border-ink"
        />
      </label>
      <button
        type="button"
        disabled={busy || rating === 0}
        onClick={submit}
        className="h-11 px-5 rounded-row bg-amber text-on-amber font-semibold text-sm disabled:opacity-50"
      >
        {busy ? "Posting…" : "Post review"}
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
