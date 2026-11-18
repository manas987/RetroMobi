import { useState } from "react";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { CalendarDays, ChevronRight, MessageCircle, Smartphone } from "lucide-react-native";
import { ApiError, Button, ErrorNote, Input, LoadingRows, Screen, SelectOptions, Sheet, Text, api, colors, dateTimeLabel, errorMessage,
  radius, space, useSession, type Row } from "@retromobi/mobile-shared";
import { EmptyState, Headline, PillCTA } from "../../features/RiderSurface";
import { trail } from "../../ui/trail";
import { useDiscardChanges } from "../../state/discard";
import { usePrivate, useWrite, refreshRiderData } from "../../state/private";
import { vehicleName } from "../../features/bookings/bookings";

const categories = [
  { value: "BOOKING", label: "A booking", icon: CalendarDays, prompt: "Tell us what happened with your ride…" },
  { value: "APP_HELP", label: "The app", icon: Smartphone, prompt: "Tell us what you were trying to do…" },
  { value: "OTHER", label: "Something else", icon: MessageCircle, prompt: "Tell us what you need help with…" },
] as const;

type Category = typeof categories[number]["value"];

export default function NewConversation() {
  const { booking } = useLocalSearchParams<{ booking?: string }>();
  const [category, setCategory] = useState<Category>("BOOKING");
  const [bookingId, setBookingId] = useState(booking ?? "");
  const [message, setMessage] = useState("");
  const [picker, setPicker] = useState(false);
  const session = useSession();
  const router = useRouter();
  const w = useWrite();
  const discard = useDiscardChanges(!!message.trim(), w.busy);
  const q = usePrivate<{ bookings: Row[] }>(category === "BOOKING" ? "/bookings" : null);
  const selectedBooking = q.data?.bookings.find((row) => row.id === bookingId);
  const ready = !!message.trim() && (category !== "BOOKING" || !!selectedBooking);
  const prompt = categories.find(({ value }) => value === category)?.prompt;

  function send() {
    if (!ready) return;
    void w.run(async () => {
      const response = await api<{ id: string }>("/tickets", { method: "POST", body: {
        category, bookingId: category === "BOOKING" ? bookingId : undefined, firstMessage: message.trim(),
      } });
      if (!response?.id) throw new ApiError(502, "Couldn’t read the response. Check your conversations before trying again.");
      await refreshRiderData("/tickets");
      discard.leave();
      router.replace({ pathname: "/support/[ticketId]", params: { ticketId: response.id } });
    });
  }

  return <Screen edges={["left", "right", "bottom"]} contentStyle={styles.content}
    footer={session && <PillCTA label="Start conversation" busy={w.busy} disabled={!ready} onPress={send} />}>
    <Stack.Screen options={{ title: "", presentation: "card" }} />
    {!session ? <EmptyState title="Sign in to contact support" text="Use your account to start a conversation with RetroMobi."
      action={<Button label="Sign in" variant="primary" onPress={() => router.push("/login")} />} /> : <>
      <View style={{ gap: space[3] }}>
        <Headline kicker="New conversation" title="How can we help?" />
        <View style={styles.topics} accessibilityRole="radiogroup" accessibilityLabel="Support topic">
          {categories.map(({ value, label, icon: Icon }) => {
            const selected = value === category;
            return <Pressable key={value} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected }}
              onPress={() => setCategory(value)} style={[styles.topic, selected && styles.active]}>
              <Icon size={17} color={selected ? colors.white : trail.forest} />
              <Text size="sm" weight="bold" color={selected ? "surface" : "ink2"}>{label}</Text>
            </Pressable>;
          })}
        </View>
      </View>
      {category === "BOOKING" && (q.isPending ? <LoadingRows rows={1} label="Loading bookings" />
        : q.error ? <ErrorNote text={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        : !q.data?.bookings.length ? <Text color="ink2">No bookings yet. Choose “The app” or “Something else” to message us.</Text>
        : <Pressable accessibilityRole="button" accessibilityLabel={selectedBooking ? `Change booking, ${vehicleName(selectedBooking)}` : "Choose a booking"}
          onPress={() => { Keyboard.dismiss(); setPicker(true); }} style={styles.booking}>
          <View style={styles.calendar}><CalendarDays size={21} color={colors.onAmber} /></View>
          <View style={{ flex: 1, gap: space[1] }}>
            <Text size="xs" color="ink2">{selectedBooking ? "Linked booking" : "Related booking"}</Text>
            <Text weight="bold">{selectedBooking ? vehicleName(selectedBooking) : "Choose a booking"}</Text>
            {selectedBooking && <Text size="sm" color="ink2">{dateTimeLabel(selectedBooking.scheduled_pickup_at)}</Text>}
          </View>
          <ChevronRight size={18} color={colors.ink2} />
        </Pressable>)}
      <View style={{ gap: space[2] }}>
        <Text weight="bold">Your message</Text>
        <Input accessibilityLabel="Your message" placeholder={prompt} multiline value={message} onChangeText={setMessage}
          textAlignVertical="top" style={styles.message} editable={!w.busy} />
      </View>
      {w.error && <ErrorNote text={w.error} />}
    </>}
    {picker && <Sheet open scroll={false} title="Choose a booking" onClose={() => setPicker(false)}>
      <SelectOptions options={(q.data?.bookings ?? []).map((row) => ({ value: String(row.id), label: `${vehicleName(row)} · ${dateTimeLabel(row.scheduled_pickup_at)}` }))}
        value={bookingId} onChange={(id) => { setBookingId(id); setPicker(false); }} />
    </Sheet>}
    {discard.dialog}
  </Screen>;
}

const styles = StyleSheet.create({
  content: { paddingTop: space[1], gap: space[5] },
  topics: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  topic: { flexDirection: "row", gap: space[2], alignItems: "center", minHeight: 52, paddingHorizontal: space[4], borderRadius: radius.full, backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong },
  active: { backgroundColor: trail.forest, borderColor: trail.forest },
  booking: { flexDirection: "row", alignItems: "center", gap: space[3], padding: space[3], borderRadius: 24, backgroundColor: colors.surface2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  calendar: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: colors.amber },
  message: { minHeight: 140, maxHeight: 220, borderWidth: 0, borderRadius: 24, backgroundColor: colors.surface2, padding: space[4] },
});
