import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import * as Linking from "expo-linking";
import { Button, ErrorNote, Screen, Text, space } from "@retromobi/mobile-shared";
import { Card } from "../features/RiderSurface";
import { FAQS, STEPS } from "../features/explore/copy";
import { RentalPolicy } from "../features/explore/RentalPolicy";

const photoCredits = [
  { label: "Dehradun · AYUSH8494", page: "Dehradun_View%2CMussorie.jpg" },
  { label: "Haridwar · Piyush Tripathi", page: "Har_Ki_Pauri_l_River_Ganga_l_Haridwar.jpg" },
  { label: "Rishikesh · Soumya Gupta2706", page: "Rishikesh_Landscape.jpg" },
];

export default function Policies() {
  const router = useRouter();
  const [linkError, setLinkError] = useState(false);
  function open(url: string) {
    setLinkError(false);
    void Linking.openURL(url).catch(() => setLinkError(true));
  }
  return <Screen edges={["left", "right", "bottom"]} contentStyle={{ gap: space[3] }}>
    <Stack.Screen options={{ title: "Help & policies" }} />
    <Card title="Cancellation policy"><RentalPolicy /></Card>
    <Card title="How renting works">
      {STEPS.map(({ title, body }) => <View key={title} style={{ gap: space[1] }}>
        <Text weight="bold">{title}</Text>
        <Text color="ink2">{body}</Text>
      </View>)}
    </Card>
    <Text size="lg" weight="bold" accessibilityRole="header">Common questions</Text>
    {FAQS.map(({ q, a }) => <Card key={q} title={q}><Text>{a}</Text></Card>)}
    <Button label="Contact RetroMobi support" onPress={() => router.navigate("/support")} />
    {["Grievance officer", "National Consumer Helpline", "Privacy notice", "User agreement", "Ranking parameters"].map((title) =>
      <Card key={title} title={title}><Text color="ink2">Details are not available here yet.</Text></Card>)}
    <Card title="Destination photo credits">
      {photoCredits.map(({ label, page }) =>
        <Button key={page} label={label} variant="ghost" onPress={() => open(`https://commons.wikimedia.org/wiki/File:${page}`)} />)}
      <Button label="CC BY-SA 4.0 · photos resized" variant="ghost" onPress={() => open("https://creativecommons.org/licenses/by-sa/4.0/")} />
      {linkError && <ErrorNote text="Couldn’t open the link." />}
    </Card>
  </Screen>;
}
