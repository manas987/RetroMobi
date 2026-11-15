import { Store } from "lucide-react-native";
import { Card, Chip, Text, useT, type Row, type Tone } from "@retromobi/mobile-shared";

const VERIFY_TONE: Record<string, Tone> = { UNVERIFIED: "muted", PENDING: "info", VERIFIED: "good", REJECTED: "bad" };

export function CurrentShop({ shop }: { shop: Row }) {
  const { t, tMaybe } = useT();
  const verification = String(shop.verification_status ?? "UNVERIFIED");
  return <Card title={String(shop.name ?? "")} icon={Store}
    action={<Chip tone={VERIFY_TONE[verification] ?? "muted"} label={tMaybe(`status.verify_${verification}`) ?? verification} />}>
    <Text size="sm" color="ink2">{[shop.address_line1, shop.city].filter(Boolean).map(String).join(", ")}</Text>
    <Text size="sm" color="ink2">{[tMaybe(`common.role_${String(shop.role ?? "")}`),
      shop.status === "OPEN" ? t("common.shopOpen") : t("common.shopClosed")].filter(Boolean).join(" · ")}</Text>
  </Card>;
}
