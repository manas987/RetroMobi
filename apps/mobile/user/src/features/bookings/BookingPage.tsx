import type { ReactNode } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button, ErrorNote, LoadingRows, Screen, errorMessage, space, useSession, type Row } from "@retromobi/mobile-shared";
import { EmptyState } from "../RiderSurface";
import { usePrivate } from "../../state/private";

export function BookingPage({ title, children }: { title: string; children: (row: Row) => ReactNode }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const session = useSession();
  const q = usePrivate<{ bookings: Row[] }>("/bookings");
  const row = q.data?.bookings.find((b) => b.id === id);
  return <Screen edges={["left", "right", "bottom"]} contentStyle={{ gap: space[3] }} onRefresh={() => { if (session) void q.refetch(); }} refreshing={q.isRefetching}>
    <Stack.Screen options={{ title }} />
    {!session ? <EmptyState title="Sign in to view this booking" text="Open bookings from the account you used to rent the vehicle."
      action={<Button label="Sign in" variant="primary" onPress={() => router.push("/login")} />} />
      : q.isPending ? <LoadingRows label="Loading booking" />
      : q.error && !row ? <ErrorNote text={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      : row ? children(row) : <EmptyState title="Booking not found" text="Check your upcoming and past rentals in Bookings."
        action={<Button label="Go to Bookings" onPress={() => router.replace("/bookings")} />} />}
  </Screen>;
}
