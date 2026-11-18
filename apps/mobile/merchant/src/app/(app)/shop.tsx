import { Store } from "lucide-react-native";
import { View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button, Card, ErrorNote, Screen, Segmented, Switch, Text, api, colors, space, useT } from "@retromobi/mobile-shared";
import { counter, counterStyles } from "../../ui/Counter";
import { art } from "../../ui/art";
import { VehicleThumb } from "../../features/fleet/VehicleThumb";
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
    <Stack.Screen options={{ title: t("shop.title"), headerTitle: "" }} />
    {loading || error ? <Pending error={error} retry={reloadShops} /> : !shopId ? <ErrorNote text={t("shop.noShop")} /> : <>
      <Text color="ink2">{t("shop.subtitle")}</Text>
      {newBranch === "1" && <Text color="info">{t("shop.newShopNote")}</Text>}
      <VehicleThumb vehicleId={null} vehicle={{}} base={`/shops/${shopId}/media`} fallback={art.shop} height={200} />
      <Card style={counterStyles.panel}>
        <View style={counterStyles.row}>
          <View style={{ flex: 1 }}>
            <Text size="xxl" weight="bold" accessibilityRole="header" style={{ color: counter.navy }}>{String(selected?.name ?? "")}</Text>
            {selected?.city != null && <View style={{ ...counterStyles.row, gap: space[1] }}><Store size={15} color={colors.ink2} /><Text size="sm" color="ink2">{String(selected.city)}</Text></View>}
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: space[2], alignItems: "center", minHeight: 48 }}>
          <Text weight="medium" style={{ flex: 1 }}>{t(open ? "common.shopOpen" : "common.shopClosed")}</Text>
          {can("shop:write") && <Switch accessibilityLabel={t("common.shopOpen")} value={open} disabled={write.busy}
            onValueChange={(on) => void write.run(async () => { await api(`/shops/${shopId}`, { method: "PATCH", body: { status: on ? "OPEN" : "CLOSED" } }); })} />}
        </View>
        {write.error && <ErrorNote text={write.error} />}
        {can("shop:write") && selected?.verification_status !== "VERIFIED" && <Button label={t("shop.getListed")} variant="primary" onPress={() => router.push("/setup")} />}
      </Card>
      <Segmented pill value={view} onChange={(next) => router.setParams({ tab: next })}
        options={[{ value: "details", label: t("shop.tabDetails") }, { value: "papers", label: t("shop.tabShopPapers") }]} />
      {view === "details" ? <>
        <ShopDetails key={shopId} shopId={shopId} />
        <PhotosTab id={shopId} basePath={`/shops/${shopId}/media`} canWrite={can("shop:write")} />
      </> : <ShopPapers key={shopId} shopId={shopId} />}
    </>}
  </Screen>;
}
