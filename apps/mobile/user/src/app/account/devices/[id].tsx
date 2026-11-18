import { useState } from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { CalendarDays, Clock3, Globe, LogOut, MapPin, MonitorSmartphone } from "lucide-react-native";
import { Button, Chip, ConfirmSheet, ErrorNote, LoadingRows, Screen, Text, api, dateTimeLabel, errorMessage, setSession, useSession } from "@retromobi/mobile-shared";
import { EmptyState } from "../../../features/RiderSurface";
import { trail } from "../../../ui/trail";
import { ProfileGroup, ProfileRow, deviceName, profileStyles, type Device } from "../../../features/profile/ProfileSurface";
import { refreshRiderData, usePrivate, useWrite } from "../../../state/private";

export default function DeviceDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const session = useSession();
  const q = usePrivate<{ sessions: Device[] }>("/auth/sessions");
  const device = q.data?.sessions.find((device) => device.id === id);
  const [confirm, setConfirm] = useState(false);
  const write = useWrite();
  return <Screen edges={["left", "right", "bottom"]}>
    <Stack.Screen options={{ title: "" }} />
    {!session ? <EmptyState title="Sign in to manage devices" action={<Button label="Sign in" onPress={() => router.push("/login")} />} />
      : q.isPending ? <LoadingRows label="Loading device" />
      : q.error ? <ErrorNote text={errorMessage(q.error, "Couldn’t load this device.")} onRetry={() => void q.refetch()} />
      : !device ? <EmptyState title="Session unavailable" action={<Button label="Signed-in devices" onPress={() => router.replace("/account/devices")} />} />
      : <View style={profileStyles.page}>
        <View style={profileStyles.lead}>
          <MonitorSmartphone size={34} color={trail.forest} />
          <View style={profileStyles.leadText}>
            <Text size="xxl" weight="bold" accessibilityRole="header">{deviceName(device)}</Text>
            {device.is_current && <Chip tone="good" label="This device" />}
          </View>
        </View>
        <ProfileGroup label="Sign-in activity">
          {!!device.browser_name && <ProfileRow icon={Globe} label="Browser" detail={device.browser_name} />}
          <ProfileRow icon={CalendarDays} label="Last sign-in" detail={dateTimeLabel(device.created_at)} separated={!!device.browser_name} />
          <ProfileRow icon={Clock3} label="Last active" detail={dateTimeLabel(device.last_used_at)} separated />
          <ProfileRow icon={MapPin} label="Sign-in location" detail={device.login_location ? `${device.login_location} (approx.)` : "Unavailable"} separated />
        </ProfileGroup>
        <ProfileGroup><ProfileRow icon={LogOut} label={device.is_current ? "Sign out here" : "Sign out this device"} danger onPress={() => setConfirm(true)} /></ProfileGroup>
      </View>}
    <ConfirmSheet open={confirm} title={device?.is_current ? "Sign out here?" : "Sign out this device?"}
      body={device?.is_current ? "You’ll need to sign in again to manage your account." : "This will end all sessions for this device."}
      confirmLabel="Sign out" danger busy={write.busy} error={write.error} onClose={() => setConfirm(false)} onConfirm={() => {
        if (device) void write.run(async () => {
          await api(`/auth/sessions/${id}`, { method: "DELETE" });
          setConfirm(false);
          if (device.is_current) {
            setSession(null);
            router.dismissTo("/profile");
          } else {
            void refreshRiderData("/auth/sessions");
            if (router.canGoBack()) router.back();
            else router.replace("/account/devices");
          }
        });
      }} />
  </Screen>;
}
