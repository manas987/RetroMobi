import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Button, Card, Chip, ErrorNote, Screen, Tabs, Text, api, queryClient, space, useT, type Permission,
} from "@retromobi/mobile-shared";
import { useMerchantShop } from "../../state/shop";
import { useCounterWrite } from "../../features/bookings/common";
import { useSetup, type SetupData } from "../../features/fleet/listing";
import { ListingChecklist } from "../../features/fleet/SetupBoard";
import { Fields, Pending } from "../../features/fleet/tabs/Fields";
import { ShopDetails } from "../../features/shop/ShopDetails";
import { ShopPapers } from "../../features/shop/ShopPapers";
import { PayoutAccount } from "../../features/money/PayoutAccount";

const STEPS = ["shop", "licence", "vehicles", "payout", "submit"] as const;
const CHECKS = STEPS.slice(0, 4) as readonly ("shop" | "licence" | "vehicles" | "payout")[];
type Step = (typeof STEPS)[number];
const NEEDS: Record<Step, Permission> = { shop: "shop:write", licence: "shop:write", vehicles: "fleet:write", payout: "payouts:write", submit: "shop:write" };

export default function SetupPage() {
  const { t } = useT();
  const { shopId, loading, error, reloadShops } = useMerchantShop();
  const q = useSetup(shopId);
  return <Screen background="canvas" edges={["bottom", "left", "right"]} contentStyle={{ gap: space[3] }}>
    <Stack.Screen options={{ title: t("setup.title") }} />
    <Text color="ink2">{t("setup.subtitle")}</Text>
    {loading || error ? <Pending error={error} retry={reloadShops} />
      : !shopId ? <ErrorNote text={t("shop.noShop")} /> : !q.isSuccess ? <Pending error={q.error} retry={q.refetch} />
      : <Wizard key={shopId} shopId={shopId} data={q.data} />}
  </Screen>;
}

function Wizard({ data, shopId }: { data: SetupData; shopId: string }) {
  const { t, date } = useT();
  const { can } = useMerchantShop();
  const router = useRouter();
  const params = useLocalSearchParams<{ step?: string }>();
  const write = useCounterWrite();
  const done = { ...data.steps, submit: data.steps.submitted };
  const current = STEPS.find((step) => step === params.step) ?? STEPS.find((step) => !done[step]);
  const go = (step: Step | "") => router.setParams({ step });
  const next = () => { if (current) go(STEPS[STEPS.indexOf(current) + 1] ?? ""); };
  const status = data.shop.verificationStatus;
  if (!current) return <Card title={t(status === "VERIFIED" ? "setup.statusApproved" : status === "REJECTED" ? "setup.statusRejected" : "setup.statusChecking")}>
    <Fields>
      {data.shop.rejectionNote && <Text color="danger">{data.shop.rejectionNote}</Text>}
      {status === "REJECTED" && can("shop:write") && <Button label={t("setup.fixAndSend")} onPress={() => go("shop")} />}
      <Button label={t("setup.openFleet")} onPress={() => router.push({ pathname: "/vehicles", params: { view: "setup" } })} />
    </Fields>
  </Card>;

  const progress = STEPS.filter((step) => done[step]).length;
  const editable = can(NEEDS[current]);
  const licence = data.licence;
  return <Fields>
    <Text weight="bold" accessibilityRole="header">{t("setup.stepOf", { n: STEPS.indexOf(current) + 1 })} · {t(`setup.step_${current}`)}</Text>
    <Text color="ink2">{t("setup.chipProgress", { n: progress })}</Text>
    <Tabs value={current} onChange={go} options={STEPS.map((value) => ({ value, label: t(`setup.step_${value}`) }))} />
    {!editable ? <Card><Text>{t("common.askOwner")}</Text></Card>
      : current === "shop" ? <ShopDetails shopId={shopId} setup onDone={next} />
      : current === "licence" ? <>
        <Card title={t("setup.licenceTitle")}><Fields>
          <Text color="ink2">{t("setup.licenceWhy")}</Text>
          {licence.status !== "NONE" && <Chip tone={licence.status === "ACTIVE" ? "good" : licence.status === "PENDING" ? "info" : "bad"}
            label={licence.status === "ACTIVE" ? t("setup.licenceActive", { date: date(licence.expiresAt) })
              : t(`setup.st_licence_${licence.status}`)} />}
          {licence.rejectionNote && <Text color="danger">{licence.rejectionNote}</Text>}
        </Fields></Card>
        <ShopPapers shopId={shopId} mode="setup" />
      </> : current === "vehicles" ? <Card title={t("setup.vehiclesTitle")}>
        <Fields>
          <Text color="ink2">{t("setup.vehiclesWhy")}</Text>
          <Text weight="medium">{t("setup.vehiclesTop", { min: data.minVehiclesForShop, n: data.completeVehicles })}</Text>
          <Button label={t("setup.allVehicles")} onPress={() => router.push({ pathname: "/vehicles", params: { view: "setup" } })} />
          {data.vehicles.slice(0, 5).map((item) => <Card key={item.id} title={`${item.make} ${item.model} · ${item.registrationNumber}`}>
            <ListingChecklist item={item} openTab={(tab) => router.push({ pathname: "/vehicle/[id]", params: { id: item.id, tab, shopId } })} />
          </Card>)}
        </Fields>
      </Card> : current === "payout" ? <Card title={t("setup.payoutTitle")}>
        <Fields><Text color="ink2">{t("setup.payoutWhy")}</Text><PayoutAccount /></Fields>
      </Card> : <Card title={t("setup.submitTitle")}><Fields>
        <Text color="ink2">{t("setup.submitWhy")}</Text>
        {CHECKS.map((step) => <Button key={step} label={`${t(`setup.step_${step}`)} · ${t(done[step] ? "setup.st_done" : "setup.st_todo")}`} onPress={() => go(step)} />)}
        {done.submit && <Text color="verified">{t("setup.alreadySent")}</Text>}
        {write.error && <ErrorNote text={write.error} />}
        {!done.submit && <Button label={t("setup.sendShop")} variant="primary" busy={write.busy} disabled={!CHECKS.every((step) => done[step])}
          onPress={() => void write.run(async () => {
            try {
              await api(`/shops/${shopId}/verification`, { method: "POST" });
              for (const vehicle of data.vehicles.filter((item) => item.canSubmit)) await api(`/vehicles/${vehicle.id}/verification`, { method: "POST" });
              go("");
            } finally { void queryClient.invalidateQueries({ queryKey: ["merchant"] }); }
          })} />}
      </Fields></Card>}
    {current !== "submit" && <Button label={t("setup.nextStep")} onPress={next} />}
    {current === "submit" && done.submit && <Button label={t("common.done")} onPress={() => go("")} />}
    {current !== "shop" && <Button variant="ghost" label={t("common.back")} onPress={() => go(STEPS[STEPS.indexOf(current) - 1]!)} />}
  </Fields>;
}
