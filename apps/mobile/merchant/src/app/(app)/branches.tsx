import { useState } from "react";
import { FlatList, View } from "react-native";
import { Plus, Store } from "lucide-react-native";
import { Stack, useRouter } from "expo-router";
import {
  Button, Card, ConfirmSheet, EmptyState, ErrorNote, Line, Screen, Sheet, Switch, Text,
  api, can, space, useT, type Row, type Tone,
} from "@retromobi/mobile-shared";
import { CounterRowLink, IconAction, PageTitle, StatusBadge, counterStyles } from "../../ui/Counter";
import { useMerchantShop } from "../../state/shop";
import { useCounterWrite } from "../../features/bookings/common";
import { Fields, FormButtons, LabelInput, Pending } from "../../features/fleet/tabs/Fields";
import { MapPin, type ShopPin } from "../../features/shop/MapPin";

const tones: Record<string, Tone> = { VERIFIED: "good", PENDING: "info", REJECTED: "bad", UNVERIFIED: "muted" };

export default function Branches() {
  const { t } = useT();
  const { shops, loading, error, reloadShops, can, refreshing } = useMerchantShop();
  const [add, setAdd] = useState(false);
  return <Screen scroll={false} padded={false} background="canvas" edges={["bottom", "left", "right"]}>
    <Stack.Screen options={{ title: t("shop.branchesTitle"), headerTitle: "" }} />
    <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={loading || error ? [] : shops} keyExtractor={(shop) => String(shop.id)}
      contentContainerStyle={{ padding: space[4], gap: space[3] }}
      ListHeaderComponent={<Fields>
        <PageTitle title={t("shop.branchesTitle")} subtitle={t("shop.branchesSubtitle")}
          action={(can("shop:write") || (!loading && !error && shops.length === 0)) &&
            <IconAction icon={Plus} label={t("shop.addBranch")} primary onPress={() => setAdd(true)} />} />
      </Fields>}
      ListEmptyComponent={loading || error ? <Pending error={error} retry={reloadShops} /> : <EmptyState text={t("shop.noBranches")} />}
      refreshing={refreshing} onRefresh={() => void reloadShops()} renderItem={({ item }) => <BranchCard shop={item} />} />
    {add && <NewBranch close={() => setAdd(false)} />}
  </Screen>;
}

function BranchCard({ shop }: { shop: Row }) {
  const { t, tMaybe } = useT();
  const router = useRouter();
  const { setShopId } = useMerchantShop();
  const id = String(shop.id);
  const write = useCounterWrite();
  const [remove, setRemove] = useState(false);
  const role = String(shop.role ?? "");
  const status = String(shop.verification_status ?? "UNVERIFIED");
  const open = shop.status === "OPEN";
  return <Card style={counterStyles.panel}>
    <CounterRowLink icon={Store} title={String(shop.name)} detail={[shop.address_line1, shop.city].filter(Boolean).map(String).join(", ")}
      onPress={() => { setShopId(id); router.push("/shop"); }} />
    <Line />
    <Fields>
      <StatusBadge tone={tones[status] ?? "muted"} label={tMaybe(`status.verify_${status}`) ?? status} />
      {can(role, "shop:write") && <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 48 }}>
        <Text style={{ flex: 1 }}>{t(open ? "common.shopOpen" : "common.shopClosed")}</Text>
        <Switch accessibilityLabel={t("common.shopOpen")} value={open} disabled={write.busy}
          onValueChange={(next) => void write.run(async () => { await api(`/shops/${id}`, { method: "PATCH", body: { status: next ? "OPEN" : "CLOSED" } }); })} />
      </View>}
      {(can(role, "shop:delete") || (can(role, "shop:write") && status !== "VERIFIED")) &&
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
          {can(role, "shop:write") && status !== "VERIFIED" && <Button label={t("shop.getListed")} onPress={() => { setShopId(id); router.push("/setup"); }} />}
          {can(role, "shop:delete") && <Button variant="ghost" label={t("shop.removeBranch")} onPress={() => setRemove(true)} />}
        </View>}
      {!remove && write.error && <ErrorNote text={write.error} />}
      <ConfirmSheet open={remove} title={t("shop.removeTitle", { name: String(shop.name) })} body={t("shop.removeBody")}
        confirmLabel={t("shop.removeConfirm")} cancelLabel={t("common.cancel")} danger busy={write.busy} error={write.error}
        onClose={() => setRemove(false)} onConfirm={() => void write.run(async () => { await api(`/shops/${id}`, { method: "DELETE" }); setRemove(false); })} />
    </Fields>
  </Card>;
}

const fields = [["name", "common.shopName"], ["phone", "setup.shopPhone"], ["addressLine1", "common.address"], ["landmark", "shop.landmark"],
  ["city", "common.city"], ["state", "common.state"], ["pincode", "common.pincode"]] as const;

function NewBranch({ close }: { close: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const { shops, reloadShops, setShopId } = useMerchantShop();
  const write = useCounterWrite();
  const [form, setForm] = useState({ name: "", phone: "", addressLine1: "", landmark: "", city: "", state: String(shops[0]?.state ?? "Uttarakhand"), pincode: "" });
  const [pin, setPin] = useState<ShopPin | null>(null);
  const valid = [form.name, form.addressLine1, form.city, form.state].every((value) => !!value.trim()) && /^\d{6}$/.test(form.pincode);

  return <Sheet open title={t("shop.addTitle")} onClose={close} busy={write.busy} footer={
      <FormButtons busy={write.busy} error={write.error} valid={valid} label={t("common.createShop")} save={() => {
        if (!valid) return;
        void write.run(async () => {
          const result = await api<Row>("/shops", { method: "POST", body: {
            name: form.name.trim(), phone: form.phone.trim() || undefined, addressLine1: form.addressLine1.trim(), landmark: form.landmark.trim() || undefined,
            city: form.city.trim(), state: form.state.trim(), pincode: form.pincode, latitude: pin?.[1], longitude: pin?.[0],
          } });
          await reloadShops();
          setShopId(String(result.id));
          close();
          router.push({ pathname: "/shop", params: { tab: "papers", newBranch: "1" } });
        });
      }} />}>
    <Fields>
      {fields.map(([key, label]) => <LabelInput key={key} label={t(label)} value={form[key]}
        editable={!write.busy && (key !== "state" || shops.length === 0)}
        maxLength={key === "pincode" ? 6 : undefined} keyboardType={key === "pincode" ? "number-pad" : key === "phone" ? "phone-pad" : "default"}
        onChangeText={(value) => setForm((prev) => ({ ...prev, [key]: key === "pincode" ? value.replace(/\D/g, "") : value }))} />)}
      <MapPin value={pin} onChange={setPin} />
    </Fields>
  </Sheet>;
}
