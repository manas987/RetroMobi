import { useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ApiError, Button, ErrorNote, Field, Input, LoadingRows, Screen, SelectField, Text, api, dateTimeLabel, errorMessage, space, useSession, type Row } from "@retromobi/mobile-shared";
import { useDiscardChanges } from "../../state/discard";
import { usePrivate, useWrite, refreshRiderData } from "../../state/private";
import { vehicleName } from "../../features/bookings/bookings";

type Category = "BOOKING" | "APP_HELP" | "OTHER";
const categoryOptions = [
  { value: "BOOKING", label: "A booking" }, { value: "APP_HELP", label: "Help with the app" }, { value: "OTHER", label: "Something else" },
] satisfies { value: Category; label: string }[];

export default function NewConversation() {
  const { booking } = useLocalSearchParams<{ booking?: string }>();
  const [category, setCategory] = useState<Category>("BOOKING");
  const [bookingId, setBookingId] = useState(booking ?? "");
  const [message, setMessage] = useState("");
  const session = useSession();
  const router = useRouter();
  const w = useWrite();
  const discard = useDiscardChanges(!!message.trim(), w.busy);
  const q = usePrivate<{ bookings: Row[] }>(category === "BOOKING" ? "/bookings" : null);
  const validBooking = q.data?.bookings.some((row) => row.id === bookingId);
  return <Screen edges={["left", "right", "bottom"]} contentStyle={{ gap: space[3] }}>
    <Stack.Screen options={{ title: "New conversation" }} />
    {!session ? <Button label="Sign in" onPress={() => router.push("/login")} /> : <>
      <SelectField label="What can we help with?" value={category} onChange={setCategory} options={categoryOptions} />
      {category === "BOOKING" && (q.isPending ? <LoadingRows label="Loading bookings" />
        : q.error ? <ErrorNote text={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        : !q.data?.bookings.length ? <Text>No bookings to select. Choose Help with the app or Something else.</Text>
        : <SelectField label="Booking" value={validBooking ? bookingId : null} placeholder="Choose a booking" onChange={setBookingId}
          options={q.data.bookings.map((row) => ({ value: String(row.id), label: `${vehicleName(row)} · ${dateTimeLabel(row.scheduled_pickup_at)}` }))} />)}
      <Field label="Your message"><Input accessibilityLabel="Your message" multiline value={message} onChangeText={setMessage} /></Field>
      {w.error && <ErrorNote text={w.error} />}
      <Button label="Start conversation" variant="primary" busy={w.busy} disabled={!message.trim() || (category === "BOOKING" && !validBooking)}
        onPress={() => void w.run(async () => {
          const response = await api<{ id: string }>("/tickets", { method: "POST", body: {
            category, bookingId: category === "BOOKING" ? bookingId : undefined, firstMessage: message.trim(),
          } });
          if (!response?.id) throw new ApiError(502, "Couldn’t read the response. Check your conversations before trying again.");
          await refreshRiderData("/tickets");
          discard.leave();
          router.replace({ pathname: "/support/[ticketId]", params: { ticketId: response.id } });
        })} />
    </>}
    {discard.dialog}
  </Screen>;
}
