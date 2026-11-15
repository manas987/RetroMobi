import { CurrentShop } from "../../../features/shop/CurrentShop";
import { FirstShop } from "../../../features/shop/FirstShop";
import { InvitesForYou } from "../../../features/shop/InvitesForYou";
import { ShopHeader, ShopSwitcher } from "../../../features/shop/ShopHeader";
import { useMerchantShop } from "../../../state/shop";
import { ErrorNote, LoadingRows, Screen, errorText, space, useT } from "@retromobi/mobile-shared";

export default function Home() {
  const { t, lang } = useT();
  const { shops, shopId, myName, loading, error, refreshing, reloadShops } = useMerchantShop();
  const current = shops.find((shop) => shop.id === shopId);
  return <Screen background="canvas" contentStyle={{ gap: space[4] }} refreshing={refreshing} onRefresh={() => void reloadShops()}>
    <ShopHeader title={myName ? t("overview.greeting", { name: myName.split(" ")[0]! }) : t("overview.greetingNoName")} />
    {loading ? <LoadingRows label={t("common.loading")} /> : error
      ? <ErrorNote text={errorText(lang, error)} retryLabel={t("common.retry")} onRetry={() => void reloadShops()} />
      : current ? <><ShopSwitcher /><CurrentShop shop={current} /></>
      : <><InvitesForYou onAccepted={reloadShops} /><FirstShop onCreated={reloadShops} /></>}
  </Screen>;
}
