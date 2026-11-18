import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ArrowUpRight, ChevronRight, CircleHelp, IdCard, LogOut, MessageCircle, ShieldCheck } from "lucide-react-native";
import { Button, ConfirmSheet, Screen, Text, colors, logout, phoneLabel, radius, space, useSession, type Row } from "@retromobi/mobile-shared";
import { EmptyState, Headline } from "../../features/RiderSurface";
import { art } from "../../ui/art";
import { trail } from "../../ui/trail";
import { ProfileAvatar, ProfileGroup, ProfileRow, profileStyles, type Account } from "../../features/profile/ProfileSurface";
import { usePrivate } from "../../state/private";

export default function Profile() {
  const session = useSession();
  const router = useRouter();
  const account = usePrivate<Account>("/auth/me");
  const riders = usePrivate<{ riders: Row[] }>("/riders");
  const trips = usePrivate<{ bookings: Row[] }>("/bookings");
  const [confirm, setConfirm] = useState(false);
  if (!session) return <Screen><EmptyState title="Sign in to your account" text="Manage your riders, bookings and signed-in devices."
    action={<Button label="Sign in" variant="primary" onPress={() => router.push("/login")} />} />
    <Button label="Help & policies" variant="ghost" onPress={() => router.push("/policies")} />
  </Screen>;

  const person = account.data;
  const contact = person?.email || (person?.phone && phoneLabel(person.phone));
  const rows = riders.data?.riders ?? [];
  const done = (trips.data?.bookings ?? []).filter((b) => b.status === "COMPLETED" && !b.deleted_at);
  const cities = new Set(done.map((b) => String(b.shop_city ?? "")).filter(Boolean)).size;

  return <Screen onRefresh={() => void Promise.all([account.refetch(), riders.refetch(), trips.refetch()])}
    refreshing={account.isRefetching || riders.isRefetching}>
    <View style={profileStyles.page}>
      <Headline title="Profile" />
      <Pressable accessibilityRole="button" accessibilityLabel={person?.name ? `Personal information for ${person.name}` : "Personal information"}
        onPress={() => router.push("/account/personal")}
        style={({ pressed }) => [styles.coverCard, pressed && styles.pressed]}>
        <Image source={art.login} style={styles.cover}
          contentFit="cover" contentPosition="bottom" accessible={false} />
        <View style={styles.coverDetails}>
          <View style={styles.coverAvatar}><ProfileAvatar name={person?.name} compact /></View>
          <View style={styles.identity}>
            <Text size="xxl" weight="bold" color="white" style={profileStyles.title}>{person?.name?.trim() || "Your account"}</Text>
            <Text size="sm" style={styles.coverSecondary}>{contact || "Personal information"}</Text>
          </View>
          <View style={styles.coverLink}><ArrowUpRight size={20} color={colors.white} /></View>
        </View>
      </Pressable>

      {trips.isSuccess && <View style={styles.stats}>
        <Stat value={done.length} label={done.length === 1 ? "Ride done" : "Rides done"} lead />
        <Stat value={cities} label={cities === 1 ? "City ridden" : "Cities ridden"} />
        <Stat value={rows.length} label={rows.length === 1 ? "Rider saved" : "Riders saved"} />
      </View>}

      <View style={styles.riderPanel}>
        <Pressable accessibilityRole="button" onPress={() => router.push("/account/riders")}
          style={({ pressed }) => [styles.riderRow, pressed && styles.pressed]}>
          <View style={styles.riderIcon}><IdCard size={24} color={colors.verified} /></View>
          <View style={styles.identity}>
            <Text size="lg" weight="bold">Riders</Text>
            {riders.isSuccess && <Text size="sm" color="ink2">{rows.length === 0 ? "Add a rider to get started" : `${rows.length} saved · licence checked at pickup`}</Text>}
          </View>
          <ChevronRight size={20} color={colors.ink2} />
        </Pressable>
      </View>

      <ProfileGroup>
        <ProfileRow icon={ShieldCheck} label="Signed-in devices" onPress={() => router.push("/account/devices")} />
        <ProfileRow icon={MessageCircle} label="Contact support" separated onPress={() => router.navigate("/support")} />
        <ProfileRow icon={CircleHelp} label="Help & policies" separated onPress={() => router.push("/policies")} />
      </ProfileGroup>
      <Pressable accessibilityRole="button" onPress={() => setConfirm(true)}
        style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
        <LogOut size={17} color={colors.danger} /><Text size="sm" weight="medium" color="danger">Sign out</Text>
      </Pressable>
    </View>
    <ConfirmSheet open={confirm} title="Sign out?" body="You can sign back in with your phone number."
      danger confirmLabel="Sign out" onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void logout(); }} />
  </Screen>;
}

function Stat({ value, label, lead }: { value: number; label: string; lead?: boolean }) {
  return <View style={[styles.stat, lead && { backgroundColor: colors.amber }]} accessible accessibilityLabel={`${value} ${label}`}>
    <Text weight="bold" tnum style={{ fontSize: 30, lineHeight: 34, letterSpacing: -1 }}>{value}</Text>
    <Text size="sm" color={lead ? "onAmber" : "ink2"}>{label}</Text>
  </View>;
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: space[2] },
  stat: { flex: 1, minHeight: 104, justifyContent: "space-between", borderRadius: 24, padding: space[3], backgroundColor: colors.surface3 },
  coverCard: { borderRadius: 30, overflow: "hidden", backgroundColor: trail.forest },
  cover: { width: "100%", height: 126 },
  coverDetails: { flexDirection: "row", alignItems: "flex-end", padding: space[4], paddingTop: space[8], gap: space[2] },
  coverAvatar: { position: "absolute", top: -25, left: space[4], borderWidth: 3, borderColor: trail.forest, borderRadius: radius.full },
  coverSecondary: { color: trail.mist },
  coverLink: { width: 40, height: 40, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.13)" },
  identity: { flex: 1, gap: 2 },
  riderPanel: { backgroundColor: colors.verifiedSoft, borderRadius: 24, paddingHorizontal: space[4] },
  riderRow: { minHeight: 80, flexDirection: "row", alignItems: "center", paddingVertical: space[3], gap: space[3] },
  riderIcon: { width: 43, height: 43, borderRadius: radius.panel, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  signOut: { minHeight: 48, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: space[3], gap: space[2] },
  pressed: { opacity: 0.72 },
});
