import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { CheckCircle2, MessageCircle, Plus, Search } from "lucide-react-native";
import { Button, Chip, ErrorNote, Input, LoadingRows, Screen, Text, colors, dateTimeLabel, errorMessage, radius, space, useSession } from "@retromobi/mobile-shared";
import { EmptyState, Headline, IconAction, PhotoPill } from "../../features/RiderSurface";
import { art } from "../../ui/art";
import { senderLabel, ticketTitle, type Ticket } from "../../features/support/tickets";
import { usePrivate } from "../../state/private";

const FILTERS = [{ value: "all", label: "All" }, { value: "open", label: "Open" }, { value: "resolved", label: "Resolved" }] as const;

export default function Support() {
  const session = useSession();
  const router = useRouter();
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const q = usePrivate<{ tickets: Ticket[] }>("/tickets", focused ? 10_000 : undefined);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const rows = (q.data?.tickets ?? []).filter((ticket) =>
    (filter === "all" || (filter === "resolved") === (ticket.status === "RESOLVED")) &&
    [ticketTitle(ticket), ticket.latest_message, ticket.booking_shop].join(" ").toLowerCase().includes(search.trim().toLowerCase()));
  const start = () => router.push("/support/new");
  const filtered = !!search.trim() || filter !== "all";
  return <Screen scroll={false} padded={false}>
    {!session ? <EmptyState image={art.emptyChat} title="Need help with a ride?" text="Sign in to message RetroMobi or check an existing conversation."
      action={<Button label="Sign in" variant="primary" onPress={() => router.push("/login")} />} />
      : <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={rows} keyExtractor={(item) => item.id} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<View style={{ gap: space[3] }}>
          <Headline kicker="Questions about a ride?" title="Help" action={<IconAction icon={Plus} tone="forest" label="New conversation" onPress={start} />} />
          {!!q.data?.tickets.length && <>
            <View style={styles.search}>
              <Search size={17} color={colors.ink2} />
              <Input style={styles.searchField} accessibilityLabel="Search conversations" placeholder="Search conversations"
                value={search} onChangeText={setSearch} returnKeyType="search" />
            </View>
            <View style={styles.filters}>
              {FILTERS.map(({ value, label }) => <PhotoPill key={value} label={label} selected={filter === value} onPress={() => setFilter(value)} />)}
            </View>
          </>}
          {q.error && <ErrorNote text={errorMessage(q.error, "Couldn’t load conversations.")} onRetry={() => void q.refetch()} />}
        </View>}
        ListEmptyComponent={q.isPending ? <LoadingRows label="Loading conversations" /> : q.isSuccess
          ? <EmptyState image={filtered ? undefined : art.emptyChat} title={filtered ? "No matching conversations" : "No conversations yet"}
            text={filtered ? "Try another search or filter." : "Start a conversation if you need help with a booking or the app."}
            action={filtered ? <Button label="Clear filters" onPress={() => { setFilter("all"); setSearch(""); }} /> : <Button label="New conversation" variant="primary" onPress={start} />} /> : undefined}
        renderItem={({ item }) => <Pressable accessibilityRole="button" style={({ pressed }) => [styles.conversation, pressed && { opacity: 0.8 }]}
          onPress={() => router.push({ pathname: "/support/[ticketId]", params: { ticketId: item.id } })}>
          <View style={[styles.bubble, item.status === "RESOLVED" && { backgroundColor: colors.surface3 }]}>
            {item.status === "RESOLVED" ? <CheckCircle2 size={20} color={colors.verified} /> : <MessageCircle size={20} color={colors.onAmber} />}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
              <Text weight="bold" numberOfLines={1} style={{ flex: 1 }}>{ticketTitle(item)}</Text>
              <Text size="xs" color="ink2">{dateTimeLabel(item.latest_message_at ?? item.created_at)}</Text>
            </View>
            <Text size="sm" color="ink2" numberOfLines={1}>{item.latest_message ? `${senderLabel(item.latest_sender_type, item.latest_is_mine)}: ${item.latest_message}` : item.first_message}</Text>
            <View style={{ alignSelf: "flex-start", marginTop: 2 }}>
              <Chip tone={item.status === "RESOLVED" ? "good" : item.status === "IN_PROGRESS" ? "info" : "attention"} label={item.status === "RESOLVED" ? "Resolved" : item.status === "IN_PROGRESS" ? "In progress" : "Open"} />
            </View>
          </View>
        </Pressable>} />}
  </Screen>;
}

const styles = StyleSheet.create({
  list: { flexGrow: 1, padding: space[4], gap: space[3] },
  search: { flexDirection: "row", alignItems: "center", paddingLeft: space[4], backgroundColor: colors.surface3, borderRadius: radius.full },
  searchField: { flex: 1, paddingHorizontal: space[2], backgroundColor: "transparent", borderWidth: 0 },
  filters: { flexDirection: "row", alignItems: "center", gap: space[2] },
  conversation: { padding: space[3], flexDirection: "row", alignItems: "flex-start", gap: space[3], borderRadius: 24, backgroundColor: colors.surface2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  bubble: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.amber, alignItems: "center", justifyContent: "center" },
});
