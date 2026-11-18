import { useState } from "react";
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronRight, Star } from "lucide-react-native";
import {
  ApiError, Button, ConfirmSheet, ErrorNote, Field, Input, LoadingRows, Segmented, SelectField, Sheet, Text,
  api, colors, decodeJwtSubject, errorMessage, queryClient, radius, reviewTimeLabel, space, useSession, useToast, type Row,
} from "@retromobi/mobile-shared";
import { EmptyState } from "../RiderSurface";
import { usePublic } from "./api";
import { canReview, vehicleName } from "../bookings/bookings";
import { refreshRiderData, usePrivate, useWrite } from "../../state/private";

type Target = { kind: "new" | "edit" | "delete"; row: Row };

export function Reviews({ id, name, reviewBooking }: { id: string; name: string; reviewBooking?: string }) {
  const path = `/shops/${encodeURIComponent(id)}/reviews`;
  const q = usePublic<{ reviews: Row[] }>(`${path}?limit=3`);
  const [showAll, setShowAll] = useState(false);
  const session = useSession();
  const ownId = session ? decodeJwtSubject(session.accessToken) : null;
  const bookings = usePrivate<{ bookings: Row[] }>(session ? "/bookings" : null);
  const eligible = bookings.data?.bookings.filter((row) => row.shop_id === id && canReview(row)) ?? [];
  const requested = eligible.find((row) => row.id === reviewBooking);
  const [pick, setPick] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState("");
  const [target, setTarget] = useState<Target>();
  const active: Target | undefined = target ?? (requested && reviewBooking !== dismissed ? { kind: "new", row: requested } : undefined);
  const toast = useToast();
  const picked = eligible.find((row) => row.id === pick) ?? eligible[0];
  const close = () => { setTarget(undefined); setDismissed(reviewBooking ?? ""); };
  const changed = async (copy: string) => {
    close(); toast(copy);
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["public"] }), refreshRiderData("/bookings")]);
  };
  return <><View style={styles.section}>
    <View style={styles.heading}>
      <View style={{ flex: 1, gap: space[1] }}><Text size="xl" weight="bold" accessibilityRole="header">Reviews</Text>
        <Text size="sm" color="ink2">{name}</Text></View>
      {!!q.data?.reviews.length && <Pressable accessibilityRole="button" accessibilityLabel="View all reviews" style={styles.viewAll} onPress={() => setShowAll(true)}>
        <Text size="sm" weight="bold">View all</Text><ChevronRight size={16} color={colors.ink} />
      </Pressable>}
    </View>
    {picked && <>
      {eligible.length > 1 && <SelectField label="Which ride?" options={eligible.map((row) => ({
        label: `${vehicleName(row)} · ${reviewTimeLabel(String(row.actual_return_at)) ?? ""}`, value: String(row.id),
      }))} value={String(picked.id)} onChange={setPick} />}
      <Button label="Leave a review" onPress={() => setTarget({ kind: "new", row: picked })} />
    </>}
    {!!reviewBooking && bookings.isError && <ErrorNote text={errorMessage(bookings.error)} onRetry={() => void bookings.refetch()} />}
    {q.isPending ? <LoadingRows label="Loading reviews" /> : q.error ? <ErrorNote text={errorMessage(q.error, "We couldn’t load reviews.")} onRetry={() => void q.refetch()} />
      : !q.data.reviews.length ? <EmptyState inline title="No reviews yet" /> : q.data.reviews.slice(0, 2).map((row) =>
        <ReviewRow key={String(row.id)} row={row} ownId={ownId} preview onAction={setTarget} />)}
    </View>
    {showAll && !active && <AllReviews path={path} name={name} ownId={ownId} onClose={() => setShowAll(false)} onAction={setTarget} />}
    {active && session && <ReviewEditor key={`${active.kind}:${active.row.id}`} target={active} name={name} onClose={close} onChanged={changed} />}
  </>;
}

function ReviewRow({ row, ownId, preview = false, onAction }: { row: Row; ownId: string | null; preview?: boolean; onAction: (target: Target) => void }) {
  return <View style={styles.review}>
    <View style={styles.heading}>
      <View style={{ flex: 1, gap: space[1] }}><Text weight="bold">{String(row.reviewer_name || "RetroMobi rider")}</Text>
        <Text size="xs" color="ink2">{reviewTimeLabel(String(row.created_at))}</Text></View>
      <View style={styles.rating}><Star size={15} color={colors.amberText} fill={colors.amber} /><Text weight="bold" size="sm">{Number(row.rating)} / 5</Text></View>
    </View>
    {row.comment != null && <Text numberOfLines={preview ? 3 : undefined}>{String(row.comment)}</Text>}
    {!!ownId && row.user_id === ownId && <View style={styles.actions}>
      <Button label="Edit" variant="ghost" accessibilityLabel="Edit your review" onPress={() => onAction({ kind: "edit", row })} />
      <Button label="Delete" variant="ghost" accessibilityLabel="Delete your review" onPress={() => onAction({ kind: "delete", row })} />
    </View>}
  </View>;
}

function AllReviews({ path, name, ownId, onClose, onAction }: { path: string; name: string; ownId: string | null; onClose: () => void; onAction: (target: Target) => void }) {
  const { height } = useWindowDimensions();
  const q = useInfiniteQuery({
    queryKey: ["public", path, "all-reviews"], initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => api<{ reviews: Row[] }>(`${path}?limit=25&page=${pageParam}`, { auth: false, signal }),
    getNextPageParam: (last, pages) => last.reviews.length === 25 ? pages.length + 1 : undefined,
  });
  return <Sheet open scroll={false} title="All reviews" onClose={onClose} closeLabel="Close">
    <FlatList style={{ maxHeight: height * 0.7 }} data={q.data?.pages.flatMap((page) => page.reviews) ?? []} keyExtractor={(row) => String(row.id)}
      showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: space[4], gap: space[3] }}
      ListHeaderComponent={<Text size="sm" color="ink2">{name}</Text>}
      ListEmptyComponent={q.isPending ? <LoadingRows label="Loading reviews" /> : q.isError
        ? <ErrorNote text={errorMessage(q.error)} onRetry={() => void q.refetch()} /> : <EmptyState inline title="No reviews yet" />}
      ListFooterComponent={q.isFetchNextPageError ? <ErrorNote text="Couldn’t load more reviews." onRetry={() => void q.fetchNextPage()} />
        : q.hasNextPage ? <Button label="Load more reviews" busy={q.isFetchingNextPage} onPress={() => void q.fetchNextPage()} /> : undefined}
      renderItem={({ item }) => <ReviewRow row={item} ownId={ownId} onAction={onAction} />} />
  </Sheet>;
}

const styles = StyleSheet.create({
  section: { gap: space[3], paddingVertical: space[3] },
  heading: { flexDirection: "row", alignItems: "center", gap: space[3] },
  viewAll: { flexDirection: "row", alignItems: "center", minHeight: 48, gap: space[1] },
  review: { backgroundColor: colors.surface2, borderRadius: radius.card, padding: space[4], gap: space[3] },
  rating: { flexDirection: "row", alignItems: "center", gap: space[1] },
  actions: { flexDirection: "row", flexWrap: "wrap" },
});

function ReviewEditor({ target, name, onClose, onChanged }: { target: Target; name: string; onClose: () => void; onChanged: (copy: string) => Promise<void> }) {
  const { kind, row } = target;
  const create = kind === "new";
  const [rating, setRating] = useState(create ? "" : String(row.rating));
  const [comment, setComment] = useState(create ? "" : String(row.comment ?? ""));
  const w = useWrite();
  const path = `/reviews/${encodeURIComponent(String(row.id))}`;
  if (kind === "delete") return <ConfirmSheet open title="Delete your review?" body={<Text>Your review will be removed from this shop.</Text>}
    onClose={onClose} confirmLabel="Delete review" danger busy={w.busy} error={w.error}
    onConfirm={() => void w.run(async () => { await api(path, { method: "DELETE" }); await onChanged("Review deleted."); })} />;
  return <Sheet open title={create ? "Review this rental" : "Edit your review"} onClose={onClose} busy={w.busy} closeLabel="Close"
    footer={<Button label={create ? "Post review" : "Save review"} variant="primary" disabled={!rating} busy={w.busy} onPress={() => void w.run(async () => {
      try {
        await api(create ? "/reviews" : path, { method: create ? "POST" : "PATCH",
          body: { ...(create ? { bookingId: row.id } : {}), rating: Number(rating), comment: comment.trim() } });
      } catch (err) {
        if (create && err instanceof ApiError && err.status === 409) {
          await onChanged("You’ve already reviewed this rental.");
          return;
        }
        throw err;
      }
      await onChanged(create ? "Review posted." : "Review updated.");
    })} />}>
    <View style={{ gap: space[3] }}>
      <Text weight="bold">{name}{create ? ` · ${vehicleName(row)}` : ""}</Text>
      <Text accessibilityRole="header">Stars out of five</Text>
      <Segmented value={rating} onChange={setRating} options={["1", "2", "3", "4", "5"].map((value) => ({ value, label: value }))} />
      <Field label="Comment (optional)"><Input accessibilityLabel="Comment" multiline value={comment} onChangeText={setComment} /></Field>
      {w.error && <ErrorNote text={w.error} />}
    </View>
  </Sheet>;
}
