import { Stack, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { BookOpen, CircleHelp, FileText, Image as ImageIcon, MessageCircle } from "lucide-react-native";
import * as Linking from "expo-linking";
import { ErrorNote, Line, Screen, Sheet, Text, colors, space } from "@retromobi/mobile-shared";
import { Headline } from "../features/RiderSurface";
import { ProfileGroup, ProfileRow, profileStyles } from "../features/profile/ProfileSurface";
import { FAQS, STEPS } from "../features/explore/copy";
import { RentalPolicy } from "../features/explore/RentalPolicy";

const photoCredits = [
  { label: "Dehradun · AYUSH8494", page: "Dehradun_View%2CMussorie.jpg" },
  { label: "Haridwar · Piyush Tripathi", page: "Har_Ki_Pauri_l_River_Ganga_l_Haridwar.jpg" },
  { label: "Rishikesh · Soumya Gupta2706", page: "Rishikesh_Landscape.jpg" },
];
const documents = ["Grievance officer", "National Consumer Helpline", "Privacy notice", "User agreement", "Ranking parameters"];

export default function Policies() {
  const router = useRouter();
  const [topic, setTopic] = useState<{ title: string; body: ReactNode } | null>(null);
  const [linkError, setLinkError] = useState(false);
  function open(url: string) {
    setLinkError(false);
    void Linking.openURL(url).catch(() => setLinkError(true));
  }
  return <Screen edges={["left", "right", "bottom"]}>
    <Stack.Screen options={{ title: "" }} />
    <View style={profileStyles.page}>
      <Headline kicker="Good to know" title="Help & policies" />
      <View style={{ gap: space[3], backgroundColor: colors.surface2, borderRadius: 24, padding: space[4], borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line }}>
        <Text size="xl" weight="bold" accessibilityRole="header">Cancellation policy</Text>
        <RentalPolicy />
      </View>
      <ProfileGroup label="Rental help">
        <ProfileRow icon={BookOpen} label="How renting works" onPress={() => setTopic({
          title: "How renting works", body: <View style={{ gap: space[3] }}>{STEPS.map(({ title, body }, index) => <View key={title} style={{ gap: space[2] }}>
            {index > 0 && <Line />}
            <Text weight="bold" accessibilityRole="header">{title}</Text>
            <Text color="ink2">{body}</Text>
          </View>)}</View>,
        })} />
        {FAQS.map(({ q, a }) => <ProfileRow key={q} icon={CircleHelp} label={q} separated onPress={() => setTopic({ title: q, body: <Text>{a}</Text> })} />)}
        <ProfileRow icon={MessageCircle} label="Contact RetroMobi support" separated onPress={() => router.navigate("/support")} />
      </ProfileGroup>
      <ProfileGroup label="Documents and contacts">
        <ProfileRow icon={FileText} label="Document availability" onPress={() => setTopic({
          title: "Documents and contacts",
          body: <View style={{ gap: space[3] }}>
            <Text color="ink2">These details haven’t been published in the app yet.</Text>
            {documents.map((title) => <View key={title} style={{ gap: space[2] }}><Line /><Text weight="medium">{title}</Text></View>)}
          </View>,
        })} />
      </ProfileGroup>
      <ProfileGroup label="Destination photo credits">
        {photoCredits.map(({ label, page }, index) => <ProfileRow key={page} icon={ImageIcon} label={label} separated={index > 0}
          onPress={() => open(`https://commons.wikimedia.org/wiki/File:${page}`)} />)}
        <ProfileRow icon={FileText} label="CC BY-SA 4.0 · photos resized" separated onPress={() => open("https://creativecommons.org/licenses/by-sa/4.0/")} />
      </ProfileGroup>
      {linkError && <ErrorNote text="Couldn’t open the link." />}
    </View>
    <Sheet open={topic != null} title={topic?.title ?? ""} onClose={() => setTopic(null)}>
      {topic?.body}
    </Sheet>
  </Screen>;
}
