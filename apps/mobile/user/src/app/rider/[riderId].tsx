import { useState } from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Button, DateField, ErrorNote, Field, Input, LoadingRows, Screen, Text, api, errorMessage, istDay, space, useSession, type Row,
} from "@retromobi/mobile-shared";
import { EmptyState } from "../../features/RiderSurface";
import { useDiscardChanges } from "../../state/discard";
import { refreshRiderData, usePrivate, useWrite } from "../../state/private";

export default function RiderFormPage() {
  const { riderId } = useLocalSearchParams<{ riderId: string }>();
  const session = useSession();
  const router = useRouter();
  const q = usePrivate<{ riders: Row[] }>(riderId === "new" ? null : "/riders");
  const rider = q.data?.riders.find((item) => item.id === riderId);
  return <Screen edges={["left", "right", "bottom"]} contentStyle={{ gap: space[3] }}>
    <Stack.Screen options={{ title: riderId === "new" ? "Add a rider" : "Edit rider" }} />
    {!session ? <EmptyState title="Sign in to manage riders" text="Your riders are saved to your RetroMobi account."
      action={<Button label="Sign in" variant="primary" onPress={() => router.push("/login")} />} /> : riderId === "new" || rider
      ? <RiderForm key={riderId} rider={rider} />
      : q.isPending ? <LoadingRows label="Loading rider" /> : q.error ? <ErrorNote text={errorMessage(q.error, "Couldn't load this rider.")} onRetry={() => void q.refetch()} />
      : <EmptyState title="Rider not found" text="Choose a rider from your profile."
        action={<Button label="Go to Profile" onPress={() => router.replace("/profile")} />} />}
  </Screen>;
}

function RiderForm({ rider }: { rider?: Row }) {
  const router = useRouter();
  const [name, setName] = useState(String(rider?.name ?? ""));
  const [date, setDate] = useState(String(rider?.dob ?? "").slice(0, 10));
  const w = useWrite();
  const discard = useDiscardChanges(name !== String(rider?.name ?? "") || date !== String(rider?.dob ?? "").slice(0, 10), w.busy);
  function save() {
    if (!name.trim()) return;
    void w.run(async () => {
      await api(rider ? `/riders/${rider.id}` : "/riders", { method: rider ? "PATCH" : "POST", body: { name: name.trim(), dob: date || undefined } });
      await refreshRiderData("/riders");
      discard.leave();
      if (router.canGoBack()) router.back();
      else router.replace("/profile");
    });
  }
  return <View style={{ gap: space[3] }}>
    <Field label="Full name"><Input accessibilityLabel="Full name" value={name} onChangeText={setName}
      autoComplete="name" textContentType="name" returnKeyType="done" onSubmitEditing={save} /></Field>
    <DateField label="Date of birth (optional)" value={date} onChange={setDate} min="1920-01-01" max={istDay(new Date())} clearable />
    {w.error && <ErrorNote text={w.error} />}
    <Button label={rider ? "Save changes" : "Add rider"} variant="primary" disabled={!name.trim()} busy={w.busy} onPress={save} />
    {discard.dialog}
    <Text size="sm" color="ink2">Use the name printed on their driving licence.</Text>
  </View>;
}
