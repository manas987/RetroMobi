import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking } from "react-native";
import { ExternalLink, LogOut, User } from "lucide-react-native";
import { Button, Card, Screen, Text, can as roleCan, logout, space, useT, useToast } from "@retromobi/mobile-shared";
import { ShopHeader, ShopSwitcher } from "../../../features/shop/ShopHeader";
import { InvitesForYou } from "../../../features/shop/InvitesForYou";
import { useSetup } from "../../../features/fleet/listing";
import { useMerchantShop } from "../../../state/shop";

export default function More() {
  const { t } = useT();
  const toast = useToast();
  const router = useRouter();
  const { shopId, myName, role, reloadShops, can, shops } = useMerchantShop();
  const [signingOut, setSigningOut] = useState(false);
  const setup = useSetup(can("fleet:read") ? shopId : null);
  const web = process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/$/, "");
  return <Screen background="canvas" contentStyle={{ gap: space[4] }}>
    <ShopHeader title={t("common.more")} />
    <ShopSwitcher />
    {setup.data && !setup.data.done && <Button variant="primary" label={t("setup.chipTitle")} onPress={() => router.push("/setup")} />}
    {shopId && <>
      {can("payouts:read") && <Button label={t("nav.reports")} onPress={() => router.push("/reports")} />}
      {can("payouts:read") && <Button label={t("nav.support")} onPress={() => router.push("/chats")} />}
      <Button label={t("nav.shop")} onPress={() => router.push("/shop")} />
      <Button label={t("nav.allBranches")} onPress={() => router.push("/branches")} />
      <Button label={t("nav.documents")} onPress={() => router.push("/papers")} />
      {shops.filter((shop) => roleCan(String(shop.role), "fleet:read")).length > 1 && <Button label={t("nav.allVehicles")} onPress={() => router.push("/all-vehicles")} />}
      {can("members:read") && <>
        <Button label={t("nav.staff")} onPress={() => router.push("/staff")} />
        <Button label={t("nav.activity")} onPress={() => router.push("/activity")} />
      </>}
    </>}
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
