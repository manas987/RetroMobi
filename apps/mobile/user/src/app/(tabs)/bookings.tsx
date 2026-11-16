import { useEffect, useState } from "react";
import { SectionList, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Chip, ErrorNote, LoadingRows, Screen, Text, dateTimeLabel, errorMessage, istDay, rupees, space, useSession, type Row } from "@retromobi/mobile-shared";
import { Card, EmptyState } from "../../features/RiderSurface";
import { usePrivate } from "../../state/private";
import { bookingLabel, canReview, groupBookings, vehicleName } from "../../features/bookings/bookings";

export default function Bookings() {
  const session = useSession();
  const router = useRouter();
  const q = usePrivate<{ bookings: Row[] }>("/bookings");
  const [now, setNow] = useState(Date.now);
  const [dismissed, setDismissed] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const rows = q.data?.bookings ?? [];
  const sections = groupBookings(rows, istDay(new Date(now)));
  const remind = rows.filter(canReview).sort((a,b) => String(b.actual_return_at).localeCompare(String(a.actual_return_at)))[0];
  return <Screen scroll={false} padded={false}>
    {!session ? <EmptyState title="Sign in to see your bookings" text="Find upcoming rides, pickup details and past rentals here."
      action={<Button label="Sign in" variant="primary" onPress={() => router.push("/login")} />} />
      : <SectionList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} sections={sections} stickySectionHeadersEnabled={false} keyExtractor={(row) => String(row.id)}
        onRefresh={() => void q.refetch()} refreshing={q.isRefetching}
        contentContainerStyle={{ flexGrow: 1, padding: space[4], gap: space[3] }}
        ListHeaderComponent={<View style={{ gap: space[3] }}>
          <Text size="xl" weight="bold" accessibilityRole="header">My bookings</Text>
          {q.error && <ErrorNote text={errorMessage(q.error, "Couldn’t load your bookings.")} onRetry={() => void q.refetch()} />}
          {remind && String(remind.id) !== dismissed && <Card title="How was your ride?"><View style={{ gap: space[2] }}>
            <Text>{String(remind.shop_name)}</Text>
            <Button label="Review this rental" onPress={() => router.push({ pathname: "/shop/[shopId]", params: { shopId: String(remind.shop_id), reviewBooking: String(remind.id) } })} />
            <Button label="Dismiss reminder" variant="ghost" onPress={() => setDismissed(String(remind.id))} />
          </View></Card>}
        </View>}
        ListEmptyComponent={q.isPending ? <LoadingRows label="Loading bookings" /> : q.isSuccess ? <EmptyState title="No bookings yet" text="Your upcoming rentals will show up here."
          action={<Button label="Find a scooter" variant="primary" onPress={() => router.push("/browse")} />} /> : undefined}
        renderSectionHeader={({ section }) => <Text size="lg" weight="bold" accessibilityRole="header">{section.title}</Text>}
        renderItem={({ item }) => <Card title={vehicleName(item)}><View style={{ gap: space[2] }}>
          <Chip {...bookingLabel(item, now)} />
          <Text>{String(item.shop_name)}</Text>
          <Text color="ink2">{dateTimeLabel(item.scheduled_pickup_at)} → {dateTimeLabel(item.scheduled_return_at)}</Text>
          <Text weight="bold">{rupees(Number(item.total_amount ?? 0))}</Text>
          <Button label="Booking details" onPress={() => router.push({ pathname: "/booking/[id]", params: { id: String(item.id) } })} />
        </View></Card>} />}
  </Screen>;
}
