import { useState } from "react";
import { View } from "react-native";
import {
  ApiError, Button, ConfirmSheet, ErrorNote, Field, Input, LoadingRows, Segmented, SelectField, Sheet, Text,
  api, decodeJwtSubject, errorMessage, queryClient, reviewTimeLabel, space, useSession, useToast, type Row,
} from "@retromobi/mobile-shared";
import { Card, EmptyState } from "../RiderSurface";
import { usePublic } from "./api";
import { canReview, vehicleName } from "../bookings/bookings";
import { refreshRiderData, usePrivate, useWrite } from "../../state/private";

type Target = { kind: "new" | "edit" | "delete"; row: Row };

export function Reviews({ id, name, reviewBooking }: { id: string; name: string; reviewBooking?: string }) {
  const path = `/shops/${encodeURIComponent(id)}/reviews`;
  const q = usePublic<{ reviews: Row[] }>(path);
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
  return <Card title={`Reviews for ${name}`}><View style={{ gap: space[3] }}>
    {picked && <>
      {eligible.length > 1 && <SelectField label="Which ride?" options={eligible.map((row) => ({
        label: `${vehicleName(row)} · ${reviewTimeLabel(String(row.actual_return_at)) ?? ""}`, value: String(row.id),
      }))} value={String(picked.id)} onChange={setPick} />}
      <Button label="Leave a review" onPress={() => setTarget({ kind: "new", row: picked })} />
    </>}
    {!!reviewBooking && bookings.isError && <ErrorNote text={errorMessage(bookings.error)} onRetry={() => void bookings.refetch()} />}
    {q.isPending ? <LoadingRows label="Loading reviews" /> : q.error ? <ErrorNote text={errorMessage(q.error, "We couldn’t load reviews.")} onRetry={() => void q.refetch()} />
      : !q.data.reviews.length ? <EmptyState inline title="No reviews yet" /> : q.data.reviews.map((row) => <Card key={String(row.id)}>
        <View style={{ gap: space[2] }}>
          <Text weight="bold">{String(row.reviewer_name || "RetroMobi rider")} · {Number(row.rating)} / 5</Text>
          {row.comment != null && <Text>{String(row.comment)}</Text>}
          <Text size="xs" color="ink2">{reviewTimeLabel(String(row.created_at))}</Text>
          {!!ownId && row.user_id === ownId && <>
            <Button label="Edit your review" onPress={() => setTarget({ kind: "edit", row })} />
            <Button label="Delete your review" variant="ghost" onPress={() => setTarget({ kind: "delete", row })} />
          </>}
        </View>
      </Card>)}
    {active && session && <ReviewEditor key={`${active.kind}:${active.row.id}`} target={active} name={name} onClose={close} onChanged={changed} />}
  </View></Card>;
}

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
