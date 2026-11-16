import { Stack, useRouter } from "expo-router";
import { Button, ErrorNote, Screen, Text, space, useT } from "@retromobi/mobile-shared";
import { ShopPapers } from "../../features/shop/ShopPapers";
import { Pending } from "../../features/fleet/tabs/Fields";
import { useMerchantShop } from "../../state/shop";

export default function Papers() {
  const { t } = useT();
  const router = useRouter();
  const { shopId, loading, error, reloadShops } = useMerchantShop();
  return <Screen background="canvas" edges={["bottom", "left", "right"]} contentStyle={{ gap: space[3] }}>
    <Stack.Screen options={{ title: t("shop.papersTitle") }} />
    <Text color="ink2">{t("shop.papersSubtitle")}</Text>
    {loading || error ? <Pending error={error} retry={reloadShops} /> : shopId ? <ShopPapers key={shopId} shopId={shopId} mode="all" />
      : <ErrorNote text={t("shop.noShop")} />}
    {shopId && <Button variant="ghost" label={t("nav.allBranches")} onPress={() => router.push("/branches")} />}
  </Screen>;
}
