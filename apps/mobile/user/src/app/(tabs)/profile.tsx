import { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { ChevronRight, UserRound } from "lucide-react-native";
import { useRouter } from "expo-router";
import {
  Button, Chip, ConfirmSheet, ErrorNote, Line, LoadingRows, Screen, Text, api, colors, dateLabel, dateTimeLabel,
  enumLabel, errorMessage, istDay, logout, radius, setSession, space, useSession, type Row,
} from "@retromobi/mobile-shared";
import { Card, EmptyState } from "../../features/RiderSurface";
import { refreshRiderData, usePrivate, useWrite } from "../../state/private";
import { licenceState } from "../../features/riders/rider";

type Device = { id: string; is_current: boolean; device_name: string | null; browser_name: string | null; login_location: string | null; created_at: string; last_used_at: string };
type Item = { row: Row; heading: string | null };

export default function Profile() {
  const session = useSession();
  const router = useRouter();
  if (!session) return <Screen><EmptyState title="Sign in" text="Manage your riders and signed-in devices."
    action={<Button label="Sign in" variant="primary" onPress={() => router.push("/login")} />} />
    <Button label="Help & policies" variant="ghost" onPress={() => router.push("/policies")} />
  </Screen>;
  return <ProfileBody />;
}

function ProfileBody() {
  const router = useRouter();
  const q = usePrivate<{ riders: Row[] }>("/riders");
  const devices = usePrivate<{ sessions: Device[] }>("/auth/sessions");
  const today = istDay(new Date());
  const riderRows = q.data?.riders ?? [];
  const needs = riderRows.filter((row) => licenceState(row, today) !== "VERIFIED");
  const verified = riderRows.filter((row) => licenceState(row, today) === "VERIFIED");
  const data: Item[] = [
    ...needs.map((row, i) => ({ row, heading: i === 0 ? "Needs attention" : null })),
    ...verified.map((row, i) => ({ row, heading: i === 0 ? "Verified riders" : null })),
  ];
  const [rider, setRider] = useState<Row | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const write = useWrite();
  const refresh = () => { void Promise.all([q.refetch(), devices.refetch()]); };

  return <Screen scroll={false} padded={false} background="canvas">
    <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={data} keyExtractor={({ row }) => String(row.id)} refreshing={q.isRefetching || devices.isRefetching} onRefresh={refresh}
      contentContainerStyle={{ flexGrow: 1, padding: space[4], gap: space[3] }}
      ListHeaderComponent={<View style={{ gap: space[3] }}>
        <Text size="xxl" weight="bold" accessibilityRole="header">Your profile</Text>
        <Text color="ink2">Manage the riders you book for and the devices signed in to your account.</Text>
        {!!data.length && <Button label="Add a rider" variant="primary" onPress={() => router.push({ pathname: "/rider/[riderId]", params: { riderId: "new" } })} />}
      </View>}
      ListEmptyComponent={q.isPending ? <LoadingRows label="Loading riders" /> : q.error ? <ErrorNote text={errorMessage(q.error, "Couldn't load your riders.")} onRetry={() => void q.refetch()} />
        : <EmptyState title="No riders yet" text="Add yourself or someone you’ll book for."
          action={<Button label="Add a rider" variant="primary" onPress={() => router.push({ pathname: "/rider/[riderId]", params: { riderId: "new" } })} />} />}
      renderItem={({ item: { row, heading } }) => {
        const status = licenceState(row, today);
        return <View style={{ gap: space[2] }}>
          {heading && <Text size="lg" weight="bold" accessibilityRole="header">{heading}</Text>}
          <Card>
            <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${row.name}`}
              onPress={() => router.push({ pathname: "/rider/[riderId]", params: { riderId: String(row.id) } })}
              style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 48 }}>
              <View style={{ padding: space[2], backgroundColor: colors.surface3, borderRadius: radius.full }}><UserRound size={20} color={colors.ink} /></View>
              <View style={{ flex: 1, gap: space[1] }}>
                <Text weight="bold">{String(row.name ?? "")}</Text>
                <Text color="ink2" size="sm">{row.dob ? `Born ${dateLabel(row.dob)}` : "Date of birth missing"}</Text>
              </View>
              <ChevronRight size={18} color={colors.ink2} />
            </Pressable>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] }}>
              <Chip tone={status === "VERIFIED" ? "good" : status === "EXPIRED" ? "bad" : "attention"} label={enumLabel(status)} />
              {!!row.licence_expires_on && <Text size="sm" color="ink2">{status === "VERIFIED" ? "Valid until " : ""}{dateLabel(row.licence_expires_on)}</Text>}
            </View>
            <Line />
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
              {status !== "VERIFIED" && <Button label={status === "REVIEW_PENDING" || status === "CHECK_AT_PICKUP" ? "Licence status" : "Verify licence"}
                variant="ghost" onPress={() => router.push({ pathname: "/rider/[riderId]/verify", params: { riderId: String(row.id) } })} />}
              <Button label="Remove rider" variant="ghost" onPress={() => setRider(row)} />
            </View>
          </Card>
        </View>;
      }}
      ListFooterComponent={<View style={{ gap: space[3] }}>
        <Button label="Help & policies" onPress={() => router.push("/policies")} />
        <Text size="lg" weight="bold" accessibilityRole="header">Signed-in devices</Text>
        {devices.isPending ? <LoadingRows label="Loading signed-in devices" /> : devices.error
          ? <ErrorNote text={errorMessage(devices.error, "Couldn’t load your devices")} onRetry={() => void devices.refetch()} />
          : !devices.data.sessions.length ? <EmptyState inline title="No active sessions" />
          : devices.data.sessions.map((item) => <Card key={item.id} title={item.device_name ?? (item.is_current ? "Current device" : "Unidentified device")}>
            <View style={{ gap: space[2] }}>
              {item.is_current && <Chip tone="good" label="This device" />}
              {item.browser_name && <Text color="ink2" size="sm">{item.browser_name}</Text>}
              <Text color="ink2" size="sm">Last sign-in · {dateTimeLabel(item.created_at)}</Text>
              <Text color="ink2" size="sm">Last active · {dateTimeLabel(item.last_used_at)}</Text>
              <Text color="ink2" size="sm">{item.login_location ? `${item.login_location} (approx.)` : "Sign-in location unavailable"}</Text>
              <Button label={item.is_current ? "Sign out here" : "Sign out"} onPress={() => setDevice(item)} />
            </View>
          </Card>)}
        <Button label="Sign out" variant="ghost" onPress={() => void logout()} />
      </View>} />
    <ConfirmSheet open={!!rider} title="Remove this rider?" body={`${rider?.name ?? ""} will be removed from your rider list and won’t be available for future bookings.`}
      confirmLabel="Remove rider" cancelLabel="Keep rider" danger busy={write.busy} error={write.error} onClose={() => setRider(null)}
      onConfirm={() => {
        if (rider) void write.run(async () => { await api(`/riders/${rider.id}`, { method: "DELETE" }); await refreshRiderData("/riders"); setRider(null); });
      }} />
    <ConfirmSheet open={!!device} title={device?.is_current ? "Sign out here?" : "Sign out this device?"}
      body={device?.is_current ? "You’ll need to sign in again to manage your account." : `All sign-ins for ${device?.device_name ?? "this device"} will be revoked.`}
      confirmLabel="Sign out" danger busy={write.busy} error={write.error} onClose={() => setDevice(null)} onConfirm={() => {
        if (device) void write.run(async () => {
          await api(`/auth/sessions/${device.id}`, { method: "DELETE" });
          if (device.is_current) setSession(null);
          else await refreshRiderData("/auth/sessions");
          setDevice(null);
        });
      }} />
  </Screen>;
}
