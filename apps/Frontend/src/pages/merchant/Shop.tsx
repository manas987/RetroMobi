import { MerchantLayout } from "./Layout";
import { useT } from "../../i18n";
import { PageHeader, Tabs } from "./ui/ui";
import { useUrlParam } from "./query";
import { BranchesTab } from "./shop/BranchesTab";
import { PapersTab } from "./shop/PapersTab";

export function MerchantShop() {
  return (
    <MerchantLayout>
      <ShopBody />
    </MerchantLayout>
  );
}

function ShopBody() {
  const { t } = useT();
  const [tab, setTab] = useUrlParam("tab", ["branches", "documents"] as const, "branches");
  return (
    <div className="@container">
      <PageHeader title={t("shop.title")} subtitle={t("shop.subtitle")} />
      <Tabs
        tabs={[{ key: "branches", label: t("shop.tabDetails") }, { key: "documents", label: t("shop.tabPapers") }]}
        value={tab}
        onChange={setTab}
      />
      {tab === "branches" ? <BranchesTab goPapers={() => setTab("documents")} /> : <PapersTab />}
    </div>
  );
}
