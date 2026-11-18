import type { ReactNode } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { CheckCircle2, ChevronRight, Rocket, Wrench, XCircle } from "lucide-react-native";
import { Button, Card, EmptyState, ErrorNote, Text, api, colors, space, useT, type TKey } from "@retromobi/mobile-shared";
import { CounterRowLink, counter, counterStyles } from "../../ui/Counter";
import { VehicleThumb } from "./VehicleThumb";
import { useMerchantShop } from "../../state/shop";
import { useCounterWrite } from "../bookings/common";
import { Fields, Pending } from "./tabs/Fields";
import { Listing, STAGES, useSetup, type SetupVehicle, type VehicleStage } from "./listing";

const labels: Record<string, TKey> = { price: "fleet.item_price", photo: "fleet.item_photo",
  "doc:RC": "fleet.item_RC", "doc:INSURANCE": "fleet.item_INSURANCE", "doc:PERMIT": "fleet.item_PERMIT",
  "doc:PUC": "fleet.item_PUC", "doc:FITNESS": "fleet.item_FITNESS", "doc:TAX": "fleet.item_TAX" };

export function ListingChecklist({ item, openTab, listing = true }: { item: SetupVehicle; openTab: (tab: string) => void; /** False where the switch is already on screen. */ listing?: boolean }) {
  const { t, tMaybe } = useT();
  const { can } = useMerchantShop();
  const write = useCounterWrite();
  const docs = item.requiredDocs.map((doc) => `doc:${doc}`);
  const list = ["price", "photo", ...docs];
  const bad = Object.entries(item.docs).find(([, row]) => row.state === "REJECTED" || row.state === "EXPIRED");
  const reason = item.rejectionNote || (bad?.[1].state === "EXPIRED"
    ? t("fleet.docExpired", { doc: tMaybe(`fleet.doc_${bad[0]}`) ?? bad[0] })
    : bad?.[1].note ?? t("fleet.fixGeneric"));
  return <Fields>
    {item.stage === "NEEDS_INFO" && list.map((key) => {
      const missing = item.missing.includes(key);
      const label = labels[key] ? t(labels[key]) : key;
      const allowed = key !== "price" || can("pricing:read");
      const Icon = missing ? XCircle : CheckCircle2;
      return missing && allowed ? <CounterRowLink key={key} icon={Icon} title={label} onPress={() => openTab(key === "price" ? "price" : key === "photo" ? "photos" : "documents")} />
        : <View key={key} style={{ flexDirection: "row", gap: space[2], alignItems: "center" }}>
          <Icon size={16} color={missing ? colors.danger : colors.verified} accessible={false} /><Text>{label}</Text>
        </View>;
    })}
    {item.stage === "NEEDS_FIXING" && <>
      <Text color="danger">{reason}</Text>
      {can("fleet:write") && <Button variant="primary" icon={Wrench} label={t("fleet.fix")} onPress={() => openTab("documents")} />}
    </>}
    {item.stage === "CHECKING" && <Text color="ink2">{t("fleet.checkingText")}</Text>}
    {item.waitingFor.map((key) => <Text key={key} color="ink2">{t(key === "shop" ? "fleet.waitingShop" : "fleet.waitingLicence")}</Text>)}
    {item.stage === "READY" && <Text color="ink2">{t("fleet.readyText")}</Text>}
    {listing && <Listing item={item} toggleOnly />}
    {item.canSubmit && can("fleet:write") && <Button label={t("fleet.sendForChecking")} busy={write.busy} variant="primary"
      onPress={() => void write.run(async () => { await api(`/vehicles/${item.id}/verification`, { method: "POST" }); })} />}
    {write.error && <ErrorNote text={write.error} />}
  </Fields>;
}

export function SetupBoard({ shopId, header }: { shopId: string; header: ReactNode }) {
  const { t } = useT();
  const router = useRouter();
  const q = useSetup(shopId);
  const s = q.data;
  const list = STAGES.flatMap((stage) => {
    const group = s?.vehicles.filter((item) => item.stage === stage) ?? [];
    return group.map((item, i) => ({ item, heading: i === 0 ? { stage, n: group.length } : null }));
  });
  const stepLabels = [["shop", "fleet.stepShop"], ["licence", "fleet.stepLicence"], ["payout", "fleet.stepBank"], ["submitted", "fleet.stepSent"]] as const;
  const title = (stage: VehicleStage) => t(`fleet.stage_${stage}`);
  return <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={list} keyExtractor={({ item }) => item.id} contentContainerStyle={{ padding: space[4], gap: space[3] }}
    onRefresh={() => void q.refetch()} refreshing={q.isRefetching}
    ListHeaderComponent={<Fields>
      {header}
      {s && !s.done && <Card style={counterStyles.panel} title={t("fleet.boardTitle")} icon={Rocket}>
        <Fields>
          {stepLabels.map(([key, label]) => <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
            {s.steps[key] ? <CheckCircle2 color={colors.verified} size={18} accessible={false} /> : <XCircle color={colors.danger} size={18} accessible={false} />}
            <Text>{t(label)} · {t(s.steps[key] ? "setup.st_done" : "setup.st_todo")}</Text>
          </View>)}
          <Text color="ink2">{t("fleet.readyCount", { n: s.completeVehicles, min: s.minVehiclesForShop })}</Text>
          <Button label={t("fleet.continueSetup")} onPress={() => router.push("/setup")} />
        </Fields>
      </Card>}
    </Fields>}
    ListEmptyComponent={!s ? <Pending error={q.error} retry={q.refetch} /> : <EmptyState text={t("fleet.boardEmpty")} />}
    renderItem={({ item: { item, heading } }) => {
      const open = (tab?: string) => router.push({ pathname: "/vehicle/[id]", params: { id: item.id, tab, shopId } });
      return <Fields>
        {heading && <Text weight="bold" size="lg" accessibilityRole="header">{title(heading.stage)} · {heading.n}</Text>}
        <Card style={{ ...counterStyles.panel, padding: space[3] }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${item.make} ${item.model} · ${item.registrationNumber} · ${t("fleet.manage")}`}
            onPress={() => open()} style={({ pressed }) => [counterStyles.row, pressed && { opacity: 0.7 }]}>
            <VehicleThumb vehicleId={item.id} vehicle={item} size={64} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text weight="bold" style={{ color: counter.navy }}>{item.make} {item.model}</Text>
              <Text size="sm" color="ink2" tnum>{item.registrationNumber}</Text>
            </View>
            <ChevronRight size={18} color={colors.ink2} />
          </Pressable>
          <ListingChecklist item={item} openTab={open} />
        </Card>
      </Fields>;
    }} />;
}
