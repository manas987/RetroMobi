import { useState } from "react";
import { Activity as ActivityIcon, Bike, CalendarPlus, CalendarX, ChevronRight, FileText, IndianRupee, KeyRound, ShieldCheck, Store, Undo2, UserPlus, type LucideIcon } from "lucide-react-native";
import { FlatList, Pressable, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Button, EmptyState, ErrorNote, LoadingRows, Screen, SelectField, Text, colors, radius,
  activityText, api, dateLabel, decodeJwtSubject, errorText, istDay, phoneLabel, space, useSession, useT, type ActivityItem, type Row,
} from "@retromobi/mobile-shared";
import { counter, counterStyles } from "../../ui/Counter";
import { useMerchantShop } from "../../state/shop";
import { useMerchantQuery } from "../../state/query";
import { Fields } from "../../features/fleet/tabs/Fields";

/** One picture per kind of event, so the log can be scanned without reading every line. */
function iconFor(action: string): LucideIcon {
  if (/handed_over|pickup/.test(action)) return KeyRound;
  if (/returned/.test(action)) return Undo2;
  if (/walkin_created/.test(action)) return CalendarPlus;
  if (/cancelled/.test(action)) return CalendarX;
  if (/identity/.test(action)) return ShieldCheck;
  if (/document|verification/.test(action)) return FileText;
  if (/pricing/.test(action)) return IndianRupee;
  if (/member|invite/.test(action)) return UserPlus;
  if (/^vehicle/.test(action)) return Bike;
  if (/^shop/.test(action)) return Store;
  return ActivityIcon;
}

const KINDS = ["all", "bookings", "vehicles", "staff", "shop"] as const;
type Page = { items: ActivityItem[]; nextBefore: string | null };

export default function Activity() {
  const { t, lang, time } = useT();
  const router = useRouter();
  const session = useSession();
  const subject = session && decodeJwtSubject(session.accessToken);
  const { shopId, can } = useMerchantShop();
  const allowed = !!shopId && can("members:read");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("all");
  const [actor, setActor] = useState("");
  const members = useMerchantQuery<{ members: Row[] }>(allowed ? `/shops/${shopId}/members` : null);
  const path = `/shops/${shopId}/activity`;
  const q = useInfiniteQuery({
    queryKey: ["merchant", path, subject, kind, actor],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      if (kind !== "all") params.set("kind", kind);
      if (actor) params.set("actorId", actor);
      if (pageParam) params.set("before", pageParam);
      return api<Page>(`${path}?${params}`, { signal });
    },
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: allowed,
  });
  const items = q.data?.pages.flatMap((page) => page.items) ?? [];
  const next = () => { if (q.hasNextPage && !q.isFetching) void q.fetchNextPage(); };
  return <Screen scroll={false} padded={false} background="canvas" edges={["bottom", "left", "right"]}>
    <Stack.Screen options={{ title: t("nav.activity") }} />
    {!allowed ? <EmptyState text={t("staff.noAccess")} /> : <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={items} keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: space[4], gap: space[3] }} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}
      onEndReached={next} onEndReachedThreshold={0.4}
      ListHeaderComponent={<Fields>
        <Text color="ink2">{t("staff.activitySubtitle")}</Text>
        <View style={{ flexDirection: "row", gap: space[2] }}>
          <View style={{ flex: 1 }}>
            <SelectField compact label={t("staff.kind")} value={kind} onChange={setKind} closeLabel={t("common.close")}
              options={KINDS.map((value) => ({ value, label: t(`staff.kind_${value}`) }))} />
          </View>
          <View style={{ flex: 1 }}>
            <SelectField compact label={t("staff.person")} value={actor} onChange={setActor} closeLabel={t("common.close")}
              options={[{ value: "", label: t("staff.everyone") }, ...(members.data?.members ?? []).map((item) => ({
                value: String(item.merchant_user_id), label: String(item.name || phoneLabel(String(item.phone ?? ""))),
              }))]} />
          </View>
        </View>
        {members.error && <ErrorNote text={errorText(lang, members.error)} retryLabel={t("common.retry")} onRetry={() => void members.refetch()} />}
      </Fields>}
      ListEmptyComponent={q.isPending ? <LoadingRows label={t("common.loading")} /> : q.error
        ? <ErrorNote text={errorText(lang, q.error)} retryLabel={t("common.retry")} onRetry={() => void q.refetch()} /> : <EmptyState text={t("staff.activityEmpty")} />}
      ListFooterComponent={q.isFetchNextPageError ? <ErrorNote text={errorText(lang, q.error)} retryLabel={t("common.retry")} onRetry={next} />
        : q.hasNextPage ? <Button label={t("common.showOlder")} busy={q.isFetchingNextPage} onPress={next} /> : undefined}
      renderItem={({ item, index }) => {
        const day = istDay(new Date(item.created_at));
        const previous = items[index - 1];
        const Icon = iconFor(item.action);
        const open = item.booking_id ? () => router.push({ pathname: "/booking/[id]", params: { id: item.booking_id!, shopId: shopId! } })
          : item.vehicle_id ? () => router.push({ pathname: "/vehicle/[id]", params: { id: item.vehicle_id! } }) : undefined;
        return <Fields>
          {(!previous || istDay(new Date(previous.created_at)) !== day) && <Text size="sm" weight="bold" accessibilityRole="header">{dateLabel(day, lang)}</Text>}
          <Pressable disabled={!open} onPress={open} accessibilityRole={open ? "button" : undefined}
            accessibilityHint={open ? t(item.booking_id ? "staff.openBooking" : "staff.openVehicle") : undefined}
            style={({ pressed }) => [{ ...counterStyles.group, ...counterStyles.row, alignItems: "flex-start", padding: space[3] }, pressed && { backgroundColor: counter.pale }]}>
            <View style={{ width: 40, height: 40, borderRadius: radius.full, backgroundColor: counter.pale, alignItems: "center", justifyContent: "center" }}>
              <Icon size={19} color={counter.navy} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text>{activityText(item, t)}</Text>
              <Text size="sm" color="ink2" tnum>{time(item.created_at)}</Text>
            </View>
            {open && <ChevronRight size={18} color={colors.ink2} style={{ alignSelf: "center" }} />}
          </Pressable>
        </Fields>;
      }} />}
  </Screen>;
}
