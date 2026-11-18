import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { IdCard, UserRound } from "lucide-react-native";
import {
  Button, DateField, ErrorNote, Input, LoadingRows, Screen, Text, api, colors, errorMessage, istDay, space, useSession, type Row,
} from "@retromobi/mobile-shared";
import { EmptyState, PillCTA } from "../../features/RiderSurface";
import { trail, type } from "../../ui/trail";
import { profileStyles } from "../../features/profile/ProfileSurface";
import { useDiscardChanges } from "../../state/discard";
import { refreshRiderData, usePrivate, useWrite } from "../../state/private";

export default function RiderFormPage() {
  const { riderId } = useLocalSearchParams<{ riderId: string }>();
  const session = useSession();
  const router = useRouter();
  const q = usePrivate<{ riders: Row[] }>(riderId === "new" ? null : "/riders");
  const rider = q.data?.riders.find((item) => item.id === riderId);
  return <>
    <Stack.Screen options={{ title: "" }} />
    {session && (riderId === "new" || rider) ? <RiderForm key={riderId} rider={rider} /> : <Screen edges={["left", "right", "bottom"]}>
      {!session ? <EmptyState title="Sign in to manage riders" text="Your riders are saved to your RetroMobi account."
        action={<Button label="Sign in" variant="primary" onPress={() => router.push("/login")} />} />
        : q.isPending ? <LoadingRows label="Loading rider" /> : q.error ? <ErrorNote text={errorMessage(q.error, "Couldn't load this rider.")} onRetry={() => void q.refetch()} />
        : <EmptyState title="Rider not found" text="Choose a rider from your list."
          action={<Button label="Your riders" onPress={() => router.replace("/account/riders")} />} />}
    </Screen>}
  </>;
}

function RiderForm({ rider }: { rider?: Row }) {
  const router = useRouter();
  const [name, setName] = useState(String(rider?.name ?? ""));
  const originalDate = String(rider?.dob ?? "").slice(0, 10);
  const [date, setDate] = useState(originalDate);
  const [focused, setFocused] = useState(false);
  const w = useWrite();
  const discard = useDiscardChanges(name !== String(rider?.name ?? "") || date !== originalDate, w.busy);
  function save() {
    if (!name.trim()) return;
    void w.run(async () => {
      await api(rider ? `/riders/${rider.id}` : "/riders", {
        method: rider ? "PATCH" : "POST",
        body: { name: name.trim(), dob: date === originalDate ? undefined : date || null },
      });
      await refreshRiderData("/riders");
      discard.leave();
      if (router.canGoBack()) router.back();
      else router.replace("/account/riders");
    });
  }
  return <Screen edges={["left", "right", "bottom"]} footer={<PillCTA label={rider ? "Save changes" : "Add rider"}
    disabled={!name.trim()} busy={w.busy} onPress={save} />}>
    <View style={profileStyles.page}>
      <View style={styles.intro}>
        <View style={styles.mark}><IdCard size={24} color={colors.onAmber} /></View>
        <Text weight="bold" style={type.headline} accessibilityRole="header">{rider ? "Rider details" : "Who’s riding?"}</Text>
        <Text color="ink2">Enter their name as it appears on their driving licence.</Text>
      </View>
      <View style={styles.fields}>
        <View style={[styles.nameField, focused && styles.focused]}>
          <UserRound size={18} color={focused ? trail.forest : colors.ink2} accessible={false} />
          <View style={styles.nameText}>
            <Text size="xs" weight="medium" color={focused ? "verified" : "ink2"}>Full name</Text>
            <Input accessibilityLabel="Full name" value={name} onChangeText={setName} placeholder="First and last name"
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
              style={styles.input} autoComplete="name" textContentType="name" returnKeyType="done" onSubmitEditing={save} />
          </View>
        </View>
        <DateField inline label="Date of birth (optional)" value={date} onChange={setDate} min="1920-01-01" max={istDay(new Date())} clearable />
      </View>
      {w.error && <ErrorNote text={w.error} />}
      {discard.dialog}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  intro: { paddingTop: space[3], paddingBottom: space[2], gap: space[2] },
  mark: { width: 56, height: 56, alignItems: "center", justifyContent: "center", borderRadius: 28, backgroundColor: colors.amber },
  fields: { gap: space[3] },
  nameField: { flexDirection: "row", alignItems: "center", gap: space[3], borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 22, backgroundColor: colors.surface2, paddingHorizontal: space[4] },
  nameText: { flex: 1, paddingTop: space[2] },
  focused: { borderColor: trail.forest, backgroundColor: trail.forestSoft },
  input: { borderWidth: 0, backgroundColor: "transparent", paddingHorizontal: 0, paddingTop: 0, paddingBottom: space[2], minHeight: 48 },
});
