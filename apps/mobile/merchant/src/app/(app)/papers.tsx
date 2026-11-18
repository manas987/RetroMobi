import { Store } from "lucide-react-native";
import { View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { ErrorNote, Screen, space, useT } from "@retromobi/mobile-shared";
import { CounterRowLink, PageTitle, counterStyles } from "../../ui/Counter";
import { ShopPapers } from "../../features/shop/ShopPapers";
import { Pending } from "../../features/fleet/tabs/Fields";
import { useMerchantShop } from "../../state/shop";

export default function Papers() {
  const { t } = useT();
  const router = useRouter();
  const { shopId, loading, error, reloadShops } = useMerchantShop();
  return <Screen background="canvas" edges={["bottom", "left", "right"]} contentStyle={{ gap: space[3] }}>
    <Stack.Screen options={{ title: t("shop.papersTitle"), headerTitle: "" }} />
    <PageTitle title={t("shop.papersTitle")} subtitle={t("shop.papersSubtitle")} />
    {loading || error ? <Pending error={error} retry={reloadShops} /> : shopId ? <ShopPapers key={shopId} shopId={shopId} mode="all" />
      : <ErrorNote text={t("shop.noShop")} />}
    {shopId && <View style={counterStyles.group}><CounterRowLink icon={Store} title={t("nav.allBranches")} onPress={() => router.push("/branches")} /></View>}
  </Screen>;
}
