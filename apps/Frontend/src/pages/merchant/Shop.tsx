import { MerchantLayout, useMerchantShop } from "./Layout";
import { useT } from "../../i18n";
import { PageHeader, Tabs } from "./ui/ui";
import { useUrlParam } from "./query";
import { can as hasPermission } from "../../lib/permissions";
import { BranchesTab } from "./shop/BranchesTab";
import { PapersTab } from "./shop/PapersTab";
import { AllVehiclesTab } from "./shop/AllVehiclesTab";

export function MerchantShop() {
  return (
    <MerchantLayout>
      <ShopBody />
    </MerchantLayout>
  );
}

function ShopBody() {
  const { t } = useT();
  const { shops } = useMerchantShop();
  // With one branch, the Vehicles page already lists everything.
  const multi = shops.filter((s) => hasPermission(String(s.role ?? ""), "fleet:read")).length > 1;
  const [raw, setTab] = useUrlParam("tab", ["branches", "documents", "vehicles"] as const, "branches");
  const tab = raw === "vehicles" && !multi ? "branches" : raw;
  return (
    <div className="@container">
      <PageHeader title={t("shop.title")} subtitle={t("shop.subtitle")} />
      <Tabs
        tabs={[
          { key: "branches", label: t("shop.tabDetails") },
          { key: "documents", label: t("shop.tabPapers") },
          ...(multi ? [{ key: "vehicles" as const, label: t("shop.tabVehicles") }] : []),
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "branches" ? <BranchesTab goPapers={() => setTab("documents")} /> : tab === "documents" ? <PapersTab /> : <AllVehiclesTab />}
    </div>
  );
}
