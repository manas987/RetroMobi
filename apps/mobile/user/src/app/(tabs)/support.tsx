import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight, Plus, Search } from "lucide-react-native";
import { Button, ErrorNote, Input, LoadingRows, Screen, Text, colors, dateTimeLabel, errorMessage, radius, space, useSession } from "@retromobi/mobile-shared";
import { EmptyState, IconAction } from "../../features/RiderSurface";
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
    {!session ? <EmptyState title="Need help with a ride?" text="Sign in to message RetroMobi or check an existing conversation."
      action={<Button label="Sign in" variant="primary" onPress={() => router.push("/login")} />} />
      : <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={rows} keyExtractor={(item) => item.id} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<View style={{ gap: space[3] }}>
          <View style={styles.heading}>
            <Text size="xxl" weight="bold" accessibilityRole="header">Support</Text>
            <IconAction icon={Plus} label="New conversation" onPress={start} />
          </View>
          {!!q.data?.tickets.length && <>
            <View style={styles.search}>
              <Search size={17} color={colors.ink2} />
              <Input style={styles.searchField} accessibilityLabel="Search conversations" placeholder="Search conversations"
                value={search} onChangeText={setSearch} returnKeyType="search" />
            </View>
            <View style={styles.filters}>
              {FILTERS.map(({ value, label }) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: filter === value }}
                style={[styles.filter, filter === value && styles.activeFilter]} onPress={() => setFilter(value)}>
                <Text size="sm" weight={filter === value ? "bold" : "medium"} color={filter === value ? "ink" : "ink2"}>{label}</Text>
              </Pressable>)}
            </View>
          </>}
          {q.error && <ErrorNote text={errorMessage(q.error, "Couldn’t load conversations.")} onRetry={() => void q.refetch()} />}
        </View>}
        ListEmptyComponent={q.isPending ? <LoadingRows label="Loading conversations" /> : q.isSuccess
          ? <EmptyState title={filtered ? "No matching conversations" : "No conversations yet"}
            text={filtered ? "Try another search or filter." : "Start a conversation if you need help with a booking or the app."}
            action={filtered ? <Button label="Clear filters" onPress={() => { setFilter("all"); setSearch(""); }} /> : <Button label="New conversation" variant="primary" onPress={start} />} /> : undefined}
        renderItem={({ item }) => <Pressable accessibilityRole="button" style={styles.conversation}
          onPress={() => router.push({ pathname: "/support/[ticketId]", params: { ticketId: item.id } })}>
          <View style={{ flex: 1, gap: space[1] }}>
            <Text weight="bold" numberOfLines={1}>{ticketTitle(item)}</Text>
            <Text size="sm" color="ink2" numberOfLines={1}>{item.latest_message ? `${senderLabel(item.latest_sender_type, item.latest_is_mine)}: ${item.latest_message}` : item.first_message}</Text>
            <Text size="xs" color="ink2">{dateTimeLabel(item.latest_message_at ?? item.created_at)} · {item.status === "RESOLVED" ? "Resolved" : item.status === "IN_PROGRESS" ? "In progress" : "Open"}</Text>
          </View>
          <ChevronRight size={17} color={colors.ink2} />
        </Pressable>} />}
  </Screen>;
}

const styles = StyleSheet.create({
  list: { flexGrow: 1, paddingHorizontal: space[4], paddingBottom: space[4] },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  search: { flexDirection: "row", alignItems: "center", paddingLeft: space[3], backgroundColor: colors.surface2, borderRadius: radius.full },
  searchField: { flex: 1, paddingHorizontal: space[2], backgroundColor: "transparent", borderWidth: 0 },
  filters: { flexDirection: "row", alignItems: "center", gap: space[4], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  filter: { minHeight: 48, minWidth: 48, justifyContent: "center", alignItems: "center", paddingHorizontal: space[1], borderBottomWidth: 2, borderBottomColor: "transparent" },
  activeFilter: { borderBottomColor: colors.ink },
  conversation: { minHeight: 72, paddingVertical: space[3], flexDirection: "row", alignItems: "center", gap: space[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
});
