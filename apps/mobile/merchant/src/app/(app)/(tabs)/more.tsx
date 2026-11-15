import { useState } from "react";
import { Linking } from "react-native";
import { ExternalLink, LogOut, User } from "lucide-react-native";
import { Button, Card, Screen, Text, logout, space, useT, useToast } from "@retromobi/mobile-shared";
import { ShopHeader, ShopSwitcher } from "../../../features/shop/ShopHeader";
import { InvitesForYou } from "../../../features/shop/InvitesForYou";
import { useMerchantShop } from "../../../state/shop";

export default function More() {
  const { t } = useT();
  const toast = useToast();
  const { shopId, myName, role, reloadShops } = useMerchantShop();
  const [signingOut, setSigningOut] = useState(false);
  const web = process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/$/, "");
  return <Screen background="canvas" contentStyle={{ gap: space[4] }}>
    <ShopHeader title={t("common.more")} />
    <ShopSwitcher />
    {shopId && <InvitesForYou onAccepted={reloadShops} />}
    {web && shopId && <Button label={t("common.yourShopPage")} icon={ExternalLink} accessibilityLabel={t("common.viewPublicPage")}
      onPress={() => { void Linking.openURL(`${web}/shops/${encodeURIComponent(shopId)}`).catch(() => toast(t("common.couldntLoad"))); }} />}
    <Card title={myName ?? t("common.you")} icon={User}>
      {role && <Text size="sm" color="ink2" style={{ marginBottom: space[2] }}>{t(`common.role_${role as "OWNER" | "MANAGER" | "STAFF"}`)}</Text>}
      <Button label={t("common.signOut")} icon={LogOut} variant="ghost" busy={signingOut}
        onPress={() => { if (!signingOut) { setSigningOut(true); void logout(); } }} />
    </Card>
  </Screen>;
}
