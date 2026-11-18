import { SectionList, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Plus, UsersRound } from "lucide-react-native";
import {
  Button, ErrorNote, LoadingRows, Screen, Text, colors, errorMessage, radius, space, useSession, type Row,
} from "@retromobi/mobile-shared";
import { EmptyState, IconAction } from "../../../features/RiderSurface";
import { ProfileRow, profileStyles } from "../../../features/profile/ProfileSurface";
import { usePrivate } from "../../../state/private";

export default function Riders() {
  const router = useRouter();
  const session = useSession();
  const riders = usePrivate<{ riders: Row[] }>("/riders");
  const add = () => router.push({ pathname: "/rider/[riderId]", params: { riderId: "new" } });
  const rows = riders.data?.riders ?? [];
  const sections = rows.length ? [{ title: "Riders on your account", data: rows }] : [];

  return <Screen scroll={false} edges={["left", "right", "bottom"]}>
    <Stack.Screen options={{
      title: "Riders",
      headerRight: rows.length && session ? () => <IconAction icon={Plus} tone="soft" label="Add a rider" onPress={add} /> : undefined,
    }} />
    {!session ? <EmptyState title="Sign in to manage riders" action={<Button label="Sign in" onPress={() => router.push("/login")} />} />
      : riders.isPending ? <LoadingRows label="Loading riders" />
      : riders.error ? <ErrorNote text={errorMessage(riders.error, "Couldn't load your riders.")} onRetry={() => void riders.refetch()} />
      : !rows.length ? <EmptyState title="No riders yet" text="Add yourself or someone you’ll book for."
        action={<Button label="Add a rider" variant="primary" onPress={add} />} />
      : <SectionList
        sections={sections} keyExtractor={(rider) => String(rider.id)}
        showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        stickySectionHeadersEnabled={false} refreshing={riders.isRefetching} onRefresh={() => void riders.refetch()}
        contentContainerStyle={[profileStyles.page, { gap: 0 }]}
        ListHeaderComponent={<View style={[profileStyles.lead, { marginBottom: space[3] }]}>
          <UsersRound size={28} color={colors.verified} />
          <View style={profileStyles.leadText}>
            <Text size="lg" weight="bold">{rows.length} {rows.length === 1 ? "saved rider" : "saved riders"}</Text>
            <Text size="sm" color="ink2">Each rider shows their original driving licence at pickup.</Text>
          </View>
        </View>}
        renderSectionHeader={({ section }) => <Text size="sm" weight="medium" color="ink2" accessibilityRole="header"
          style={{ marginTop: space[2], marginBottom: space[2], paddingHorizontal: space[2] }}>{section.title}</Text>}
        renderSectionFooter={() => <View style={{ height: space[3] }} />}
        renderItem={({ item, index, section }) => {
          const top = index === 0 ? radius.card : 0;
          const bottom = index === section.data.length - 1 ? radius.card : 0;
          return <View style={{
            backgroundColor: colors.surface2, overflow: "hidden",
            borderTopLeftRadius: top, borderTopRightRadius: top, borderBottomLeftRadius: bottom, borderBottomRightRadius: bottom,
          }}>
            <ProfileRow avatar={String(item.name)} label={String(item.name)} separated={index > 0}
              onPress={() => router.push({ pathname: "/account/riders/[id]", params: { id: String(item.id) } })} />
          </View>;
        }} />}
  </Screen>;
}
