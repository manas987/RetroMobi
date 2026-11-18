import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, View } from "react-native";
import { Bike, ChartNoAxesCombined, ExternalLink, Files, History, LogOut, MapPin, MessageCircle, Store, Users } from "lucide-react-native";
import { Button, Line, Screen, colors, radius, Text, can as roleCan, logout, space, useT, useToast } from "@retromobi/mobile-shared";
import { CounterRowLink, counter, counterStyles } from "../../../ui/Counter";
import { LanguageButton, ShopSwitcher } from "../../../features/shop/ShopHeader";
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
  const accountName = myName ?? t("common.you");
  const initials = accountName.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase();
  return <Screen background="canvas" contentStyle={{ gap: space[4] }}>
    <View style={{ ...counterStyles.row, padding: space[4], backgroundColor: counter.navy, borderRadius: radius.card }}>
      <View style={{ backgroundColor: colors.amber, borderRadius: 15, padding: space[3], minWidth: 46 }}>
        <Text weight="bold" center color="onAmber">{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text size="xl" weight="bold" color="surface" accessibilityRole="header">{accountName}</Text>
        {role && <Text size="sm" style={{ color: counter.muted }}>{t(`common.role_${role as "OWNER" | "MANAGER" | "STAFF"}`)}</Text>}
      </View>
      <LanguageButton />
    </View>
    <ShopSwitcher />
    {setup.data && !setup.data.done && <Button variant="primary" label={t("setup.chipTitle")} onPress={() => router.push("/setup")} />}
    {shopId && <>
      <View style={counterStyles.group}>
        <CounterRowLink icon={Store} title={t("nav.shop")} onPress={() => router.push("/shop")} />
        <Line />
        <CounterRowLink icon={MapPin} title={t("nav.allBranches")} onPress={() => router.push("/branches")} />
        <Line />
        <CounterRowLink icon={Files} title={t("nav.documents")} onPress={() => router.push("/papers")} />
        {shops.filter((shop) => roleCan(String(shop.role), "fleet:read")).length > 1 && <>
          <Line /><CounterRowLink icon={Bike} title={t("nav.allVehicles")} onPress={() => router.push("/all-vehicles")} />
        </>}
        {web && <>
          <Line /><CounterRowLink icon={ExternalLink} title={t("common.yourShopPage")}
            onPress={() => { void Linking.openURL(`${web}/shops/${encodeURIComponent(shopId)}`).catch(() => toast(t("common.couldntLoad"))); }} />
        </>}
      </View>
      {(can("payouts:read") || can("members:read")) && <View style={counterStyles.group}>
        {can("payouts:read") && <>
          <CounterRowLink icon={ChartNoAxesCombined} title={t("nav.reports")} onPress={() => router.push("/reports")} />
          <Line /><CounterRowLink icon={MessageCircle} title={t("nav.support")} onPress={() => router.push("/support")} />
        </>}
        {can("members:read") && <>
          {can("payouts:read") && <Line />}
          <CounterRowLink icon={Users} title={t("nav.staff")} onPress={() => router.push("/staff")} />
          <Line /><CounterRowLink icon={History} title={t("nav.activity")} onPress={() => router.push("/activity")} />
        </>}
      </View>}
      <InvitesForYou onAccepted={reloadShops} />
    </>}
    <Button label={t("common.signOut")} icon={LogOut} variant="ghost" busy={signingOut}
      onPress={() => { if (!signingOut) { setSigningOut(true); void logout(); } }} />
  </Screen>;
}
