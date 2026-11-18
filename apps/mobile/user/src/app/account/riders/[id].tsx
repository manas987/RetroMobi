import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { CalendarDays, IdCard, Pencil, Store, UserMinus } from "lucide-react-native";
import {
  Button, ConfirmSheet, ErrorNote, LoadingRows, Screen, Text, api, colors, dateLabel, space, errorMessage, useSession, type Row,
} from "@retromobi/mobile-shared";
import { EmptyState } from "../../../features/RiderSurface";
import { trail, type } from "../../../ui/trail";
import { ProfileAvatar, ProfileGroup, ProfileRow, profileStyles } from "../../../features/profile/ProfileSurface";
import { refreshRiderData, usePrivate, useWrite } from "../../../state/private";

export default function RiderDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const session = useSession();
  const q = usePrivate<{ riders: Row[] }>("/riders");
  const rider = q.data?.riders.find((rider) => rider.id === id);
  const [remove, setRemove] = useState(false);
  const write = useWrite();
  const name = String(rider?.name ?? "");

  return <Screen edges={["left", "right", "bottom"]}>
    <Stack.Screen options={{ title: "" }} />
    {!session ? <EmptyState title="Sign in to manage riders" action={<Button label="Sign in" onPress={() => router.push("/login")} />} />
      : q.isPending ? <LoadingRows label="Loading rider" />
      : q.error ? <ErrorNote text={errorMessage(q.error, "Couldn't load this rider.")} onRetry={() => void q.refetch()} />
      : !rider ? <EmptyState title="Rider not found" action={<Button label="Your riders" onPress={() => router.replace("/account/riders")} />} />
      : <View style={profileStyles.page}>
        <View style={styles.card} accessible accessibilityLabel={`${name}. Licence checked by the shop at pickup.`}>
          <View style={styles.cardTop}>
            <Text size="xs" weight="bold" style={{ color: colors.amber, letterSpacing: 1 }}>DRIVING LICENCE</Text>
            <IdCard size={22} color={colors.amber} />
          </View>
          <View style={styles.cardMid}>
            <ProfileAvatar name={name} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text weight="bold" color="white" accessibilityRole="header" style={type.title} numberOfLines={2}>{name}</Text>
              <Text size="sm" style={{ color: trail.mist }}>{rider.dob ? `Born ${dateLabel(rider.dob)}` : "Rider"}</Text>
            </View>
          </View>
          <View style={styles.cardFoot}>
            <View style={styles.state}>
              <Store size={14} color={colors.onAmber} />
              <Text size="sm" weight="bold" style={{ color: colors.onAmber }}>Checked at pickup</Text>
            </View>
            <Text size="sm" style={{ color: trail.mist, flexShrink: 1 }}>Bring the original licence</Text>
          </View>
        </View>
        <ProfileGroup label="Rider information">
          <ProfileRow icon={CalendarDays} label="Date of birth" detail={rider.dob ? dateLabel(rider.dob) : "Not provided"} />
          <ProfileRow icon={Pencil} label="Edit rider" separated
            onPress={() => router.push({ pathname: "/rider/[riderId]", params: { riderId: id } })} />
        </ProfileGroup>
        <ProfileGroup><ProfileRow icon={UserMinus} label="Remove rider" danger onPress={() => setRemove(true)} /></ProfileGroup>
      </View>}
    <ConfirmSheet open={remove} title="Remove this rider?" body={`${name} won’t be available for future bookings.`}
      confirmLabel="Remove rider" cancelLabel="Keep rider" danger busy={write.busy} error={write.error}
      onClose={() => setRemove(false)} onConfirm={() => {
        if (rider) void write.run(async () => {
          await api(`/riders/${id}`, { method: "DELETE" });
          setRemove(false);
          void refreshRiderData("/riders");
          if (router.canGoBack()) router.back();
          else router.replace("/account/riders");
        });
      }} />
  </Screen>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: trail.forest, borderRadius: 28, padding: space[5], gap: space[4] },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardMid: { flexDirection: "row", alignItems: "center", gap: space[4] },
  cardFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: space[2] },
  state: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: space[3], paddingVertical: 6, backgroundColor: colors.amber },
});
