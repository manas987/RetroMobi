import { Stack } from "expo-router";
import { useT } from "@retromobi/mobile-shared";
import { Conversations } from "../../features/support/Conversations";

export default function Support() {
  const { t } = useT();
  return <>
    <Stack.Screen options={{ title: t("nav.support"), headerTitle: "" }} />
    <Conversations />
  </>;
}
