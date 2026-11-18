import { View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Mail, Phone, UserRound } from "lucide-react-native";
import { Button, ErrorNote, LoadingRows, Screen, Text, errorMessage, phoneLabel, space, useSession } from "@retromobi/mobile-shared";
import { EmptyState, Headline } from "../../features/RiderSurface";
import { trail } from "../../ui/trail";
import { ProfileAvatar, ProfileGroup, ProfileRow, profileStyles, type Account } from "../../features/profile/ProfileSurface";
import { usePrivate } from "../../state/private";

export default function PersonalInformation() {
  const router = useRouter();
  const session = useSession();
  const account = usePrivate<Account>("/auth/me");
  return <Screen edges={["left", "right", "bottom"]} onRefresh={session ? () => void account.refetch() : undefined} refreshing={account.isRefetching}>
    <Stack.Screen options={{ title: "" }} />
    {!session ? <EmptyState title="Sign in to see your account" action={<Button label="Sign in" onPress={() => router.push("/login")} />} />
      : account.isPending ? <LoadingRows label="Loading personal information" />
      : account.error ? <ErrorNote text={errorMessage(account.error, "Couldn't load personal information.")} onRetry={() => void account.refetch()} />
      : <View style={profileStyles.page}>
        <Headline kicker="Your account" title="Personal info" />
        <View style={[profileStyles.identity, { backgroundColor: trail.forestSoft, borderRadius: 28, paddingHorizontal: space[4] }]}>
          <ProfileAvatar name={account.data.name} />
          <Text size="xxl" weight="bold" center accessibilityRole="header">{account.data.name || "Your account"}</Text>
        </View>
        <ProfileGroup label="Account details">
          <ProfileRow icon={UserRound} label="Full name" detail={account.data.name || "Not provided"} />
          <ProfileRow icon={Phone} label="Sign-in number" detail={phoneLabel(account.data.phone)} separated />
          <ProfileRow icon={Mail} label="Email address" detail={account.data.email || "Not provided"} separated />
        </ProfileGroup>
      </View>}
  </Screen>;
}
