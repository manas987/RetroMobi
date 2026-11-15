import { View } from "react-native";
import { Languages } from "lucide-react-native";
import { Button, SelectField, Text, setLang, space, useT } from "@retromobi/mobile-shared";
import { useMerchantShop } from "../../state/shop";

export function LanguageButton() {
  const { t, lang } = useT();
  return <Button label={t("common.otherLang")} icon={Languages} accessibilityLabel={t("common.otherLangLabel")}
    onPress={() => setLang(lang === "en" ? "hi" : "en")} />;
}

export function ShopHeader({ title }: { title: string }) {
  return <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
    <Text size="xl" weight="bold" style={{ flex: 1 }} accessibilityRole="header">{title}</Text>
    <LanguageButton />
  </View>;
}

export function ShopSwitcher() {
  const { t, tMaybe } = useT();
  const { shopId, shops, setShopId } = useMerchantShop();
  if (shops.length < 2) return null;
  return <SelectField label={t("common.shop")} value={shopId} onChange={setShopId} closeLabel={t("common.close")}
    options={shops.map((shop) => {
      const status = shop.status === "OPEN" ? t("common.shopOpen") : t("common.shopClosed");
      const verification = tMaybe(`status.verify_${String(shop.verification_status ?? "UNVERIFIED")}`);
      return { value: String(shop.id), label: [shop.name, shop.city, status, verification].filter(Boolean).map(String).join(" · ") };
    })} />;
}
