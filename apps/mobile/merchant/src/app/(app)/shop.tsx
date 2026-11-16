import { View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button, Card, ErrorNote, Screen, Segmented, Switch, Text, api, space, useT } from "@retromobi/mobile-shared";
import { useMerchantShop } from "../../state/shop";
import { ShopDetails } from "../../features/shop/ShopDetails";
import { ShopPapers } from "../../features/shop/ShopPapers";
import { PhotosTab } from "../../features/fleet/tabs/PhotosTab";
import { Pending } from "../../features/fleet/tabs/Fields";
import { useCounterWrite } from "../../features/bookings/common";

export default function ShopPage() {
  const { t } = useT();
  const router = useRouter();
  const { tab, newBranch } = useLocalSearchParams<{ tab?: string; newBranch?: string }>();
  const view = tab === "papers" ? "papers" : "details";
  const { shopId, shops, can, loading, error, reloadShops } = useMerchantShop();
  const selected = shops.find((shop) => shop.id === shopId);
  const write = useCounterWrite();
  const open = selected?.status === "OPEN";
  return <Screen background="canvas" edges={["bottom", "left", "right"]} contentStyle={{ gap: space[4] }}>
    <Stack.Screen options={{ title: t("shop.title") }} />
    {loading || error ? <Pending error={error} retry={reloadShops} /> : !shopId ? <ErrorNote text={t("shop.noShop")} /> : <>
      <Text color="ink2">{t("shop.subtitle")}</Text>
      {newBranch === "1" && <Text color="info">{t("shop.newShopNote")}</Text>}
      <Card title={String(selected?.name ?? "")}>
        <View style={{ flexDirection: "row", gap: space[2], alignItems: "center", minHeight: 48 }}>
          <Text weight="medium" style={{ flex: 1 }}>{t(open ? "common.shopOpen" : "common.shopClosed")}</Text>
          {can("shop:write") && <Switch accessibilityLabel={t("common.shopOpen")} value={open} disabled={write.busy}
            onValueChange={(on) => void write.run(async () => { await api(`/shops/${shopId}`, { method: "PATCH", body: { status: on ? "OPEN" : "CLOSED" } }); })} />}
        </View>
        {write.error && <ErrorNote text={write.error} />}
        {can("shop:write") && selected?.verification_status !== "VERIFIED" && <Button label={t("shop.getListed")} onPress={() => router.push("/setup")} />}
      </Card>
      <Segmented value={view} onChange={(next) => router.setParams({ tab: next })}
        options={[{ value: "details", label: t("shop.tabDetails") }, { value: "papers", label: t("shop.tabShopPapers") }]} />
      {view === "details" ? <>
        <ShopDetails key={shopId} shopId={shopId} />
        <PhotosTab id={shopId} basePath={`/shops/${shopId}/media`} canWrite={can("shop:write")} />
      </> : <ShopPapers key={shopId} shopId={shopId} />}
    </>}
  </Screen>;
}
