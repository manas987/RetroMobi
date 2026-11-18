import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronsUpDown, Languages, Store } from "lucide-react-native";
import { SelectOptions, Sheet, Text, colors, radius, setLang, space, useT } from "@retromobi/mobile-shared";
import { IconAction, PageTitle, counter } from "../../ui/Counter";
import { useMerchantShop } from "../../state/shop";

export function LanguageButton() {
  const { t, lang } = useT();
  return <IconAction label={t("common.otherLangLabel")} icon={Languages}
    onPress={() => setLang(lang === "en" ? "hi" : "en")} />;
}

export function ShopHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return <PageTitle title={title} subtitle={subtitle} action={<LanguageButton />} />;
}

export function ShopSwitcher({ compact = false }: { compact?: boolean }) {
  const { t, tMaybe } = useT();
  const { shopId, shops, setShopId } = useMerchantShop();
  const [open, setOpen] = useState(false);
  const current = shops.find((shop) => shop.id === shopId);
  if (!current) return null;
  const label = (shop: typeof current) => [
    shop.city,
    shop.status === "OPEN" ? t("common.shopOpen") : t("common.shopClosed"),
    tMaybe(`status.verify_${String(shop.verification_status ?? "UNVERIFIED")}`),
  ].filter(Boolean).join(" · ");
  const multiple = shops.length > 1;
  const location = [current.city, tMaybe(`status.verify_${String(current.verification_status ?? "UNVERIFIED")}`)].filter(Boolean).join(" · ");
  const isOpen = current.status === "OPEN";
  return <>
    <Pressable accessibilityRole={multiple ? "button" : undefined}
      accessibilityLabel={`${t("common.shop")}: ${current.name}, ${label(current)}`}
      accessibilityState={multiple ? { expanded: open } : undefined}
      disabled={!multiple} onPress={() => setOpen(true)} style={({ pressed }) => [styles.shop, compact && styles.compact, pressed && styles.pressed]}>
      <View style={[styles.mark, compact && styles.compactMark]}><Store size={20} color={colors.surface} strokeWidth={1.8} /></View>
      <View style={styles.body}>
        <Text size="md" weight="bold" style={{ color: counter.navy }}>{String(current.name)}</Text>
        <View style={styles.meta}>
          {location ? <Text size="xs" color="ink2" style={{ flexShrink: 1 }}>{location}</Text> : null}
          <View style={styles.status}>
            <View style={[styles.dot, { backgroundColor: isOpen ? colors.verified : colors.ink3 }]} />
            <Text size="xs" weight="medium" color={isOpen ? "verified" : "ink2"}>{t(isOpen ? "common.shopOpen" : "common.shopClosed")}</Text>
          </View>
        </View>
      </View>
      {multiple && <View style={styles.arrows}><ChevronsUpDown size={17} color={counter.navy} strokeWidth={1.8} /></View>}
    </Pressable>
    <Sheet open={open} onClose={() => setOpen(false)} title={t("common.shop")} scroll={false}>
      <SelectOptions value={shopId} options={shops.map((shop) => ({
        value: String(shop.id), label: String(shop.name), detail: label(shop),
      }))}
        onChange={(id) => { setShopId(id); setOpen(false); }} />
    </Sheet>
  </>;
}

const styles = StyleSheet.create({
  shop: { flexDirection: "row", alignItems: "center", gap: space[3], backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, padding: space[3], minHeight: 68 },
  compact: { paddingHorizontal: 0, paddingVertical: space[1], borderWidth: 0, backgroundColor: "transparent", borderRadius: 0 },
  compactMark: { height: 36, width: 36, borderRadius: 12 },
  pressed: { backgroundColor: counter.pale },
  mark: { height: 42, width: 42, borderRadius: 14, backgroundColor: counter.navy, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, minWidth: 0, gap: space[1] },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: space[2], rowGap: space[1] },
  status: { flexDirection: "row", alignItems: "center", gap: space[1], flexShrink: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  arrows: { height: 32, width: 32, borderRadius: 11, backgroundColor: counter.pale, alignItems: "center", justifyContent: "center" },
});
