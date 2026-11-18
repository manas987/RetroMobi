import { Overview } from "../../../features/overview/Overview";
import { FirstShop } from "../../../features/shop/FirstShop";
import { InvitesForYou } from "../../../features/shop/InvitesForYou";
import { ShopHeader } from "../../../features/shop/ShopHeader";
import { useMerchantShop } from "../../../state/shop";
import { ErrorNote, LoadingRows, Screen, errorText, space, useT } from "@retromobi/mobile-shared";

export default function Home() {
  const { t, lang } = useT();
  const { shops, shopId, myName, loading, error, refreshing, reloadShops } = useMerchantShop();
  const current = shops.find((shop) => shop.id === shopId);
  if (current && shopId && !loading && !error) return <Overview key={shopId} shopId={shopId} />;
  return <Screen background="canvas" contentStyle={{ gap: space[4] }} refreshing={refreshing} onRefresh={() => void reloadShops()}>
    <ShopHeader title={myName ? t("overview.greeting", { name: myName.split(" ")[0]! }) : t("overview.greetingNoName")} />
    {loading ? <LoadingRows label={t("common.loading")} /> : error
      ? <ErrorNote text={errorText(lang, error)} retryLabel={t("common.retry")} onRetry={() => void reloadShops()} />
      : <><InvitesForYou onAccepted={reloadShops} /><FirstShop onCreated={reloadShops} /></>}
  </Screen>;
}
