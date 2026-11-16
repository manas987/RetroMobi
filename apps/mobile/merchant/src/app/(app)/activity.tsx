import { useState } from "react";
import { FlatList } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Button, Card, EmptyState, ErrorNote, LoadingRows, Screen, SelectField, Text,
  activityText, api, dateLabel, decodeJwtSubject, errorText, istDay, phoneLabel, space, useSession, useT, type ActivityItem, type Row,
} from "@retromobi/mobile-shared";
import { useMerchantShop } from "../../state/shop";
import { useMerchantQuery } from "../../state/query";
import { Fields } from "../../features/fleet/tabs/Fields";

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
        <SelectField label={t("staff.kind")} value={kind} onChange={setKind} closeLabel={t("common.close")}
          options={KINDS.map((value) => ({ value, label: t(`staff.kind_${value}`) }))} />
        <SelectField label={t("staff.person")} value={actor} onChange={setActor} closeLabel={t("common.close")}
          options={[{ value: "", label: t("staff.everyone") }, ...(members.data?.members ?? []).map((item) => ({
            value: String(item.merchant_user_id), label: String(item.name || phoneLabel(String(item.phone ?? ""))),
          }))]} />
        {members.error && <ErrorNote text={errorText(lang, members.error)} retryLabel={t("common.retry")} onRetry={() => void members.refetch()} />}
      </Fields>}
      ListEmptyComponent={q.isPending ? <LoadingRows label={t("common.loading")} /> : q.error
        ? <ErrorNote text={errorText(lang, q.error)} retryLabel={t("common.retry")} onRetry={() => void q.refetch()} /> : <EmptyState text={t("staff.activityEmpty")} />}
      ListFooterComponent={q.isFetchNextPageError ? <ErrorNote text={errorText(lang, q.error)} retryLabel={t("common.retry")} onRetry={next} />
        : q.hasNextPage ? <Button label={t("common.showOlder")} busy={q.isFetchingNextPage} onPress={next} /> : undefined}
      renderItem={({ item, index }) => {
        const day = istDay(new Date(item.created_at));
        const previous = items[index - 1];
        return <Fields>
          {(!previous || istDay(new Date(previous.created_at)) !== day) && <Text size="sm" weight="bold" accessibilityRole="header">{dateLabel(day, lang)}</Text>}
          <Card>
            <Fields>
              <Text>{activityText(item, t)}</Text><Text size="sm" color="ink2">{time(item.created_at)}</Text>
              {item.booking_id && <Button variant="ghost" label={t("staff.openBooking")}
                onPress={() => router.push({ pathname: "/booking/[id]", params: { id: item.booking_id!, shopId: shopId! } })} />}
              {!item.booking_id && item.vehicle_id && <Button variant="ghost" label={t("staff.openVehicle")}
                onPress={() => router.push({ pathname: "/vehicle/[id]", params: { id: item.vehicle_id! } })} />}
            </Fields>
          </Card>
        </Fields>;
      }} />}
  </Screen>;
}
