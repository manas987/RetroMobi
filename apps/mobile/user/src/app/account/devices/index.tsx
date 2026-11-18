import { View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { MonitorSmartphone, ShieldCheck } from "lucide-react-native";
import { Button, ErrorNote, LoadingRows, Screen, Text, dateTimeLabel, errorMessage, useSession } from "@retromobi/mobile-shared";
import { EmptyState, Headline } from "../../../features/RiderSurface";
import { trail } from "../../../ui/trail";
import { ProfileGroup, ProfileRow, deviceName, profileStyles, type Device } from "../../../features/profile/ProfileSurface";
import { usePrivate } from "../../../state/private";

export default function Devices() {
  const router = useRouter();
  const session = useSession();
  const devices = usePrivate<{ sessions: Device[] }>("/auth/sessions");
  return <Screen edges={["left", "right", "bottom"]} refreshing={devices.isRefetching}
    onRefresh={session ? () => void devices.refetch() : undefined}>
    <Stack.Screen options={{ title: "" }} />
    {!session ? <EmptyState title="Sign in to manage devices" action={<Button label="Sign in" onPress={() => router.push("/login")} />} />
      : devices.isPending ? <LoadingRows label="Loading signed-in devices" />
      : devices.error ? <ErrorNote text={errorMessage(devices.error, "Couldn’t load your devices.")} onRetry={() => void devices.refetch()} />
      : !devices.data.sessions.length ? <EmptyState title="No active sessions" />
      : <View style={profileStyles.page}>
        <Headline kicker="Security" title="Your devices" />
        <View style={profileStyles.lead}>
          <ShieldCheck color={trail.forest} size={30} />
          <View style={profileStyles.leadText}>
            <Text size="lg" weight="bold">{devices.data.sessions.length} signed-in {devices.data.sessions.length === 1 ? "device" : "devices"}</Text>
            <Text size="sm" color="ink2">Review activity or sign out a device you don’t recognise.</Text>
          </View>
        </View>
        <ProfileGroup label="Active sessions">
          {devices.data.sessions.map((device, index) => <ProfileRow key={device.id} icon={MonitorSmartphone}
            label={deviceName(device)} detail={device.is_current ? "This device" : `Last active · ${dateTimeLabel(device.last_used_at)}`}
            separated={index > 0}
            onPress={() => router.push({ pathname: "/account/devices/[id]", params: { id: device.id } })} />)}
        </ProfileGroup>
      </View>}
  </Screen>;
}
