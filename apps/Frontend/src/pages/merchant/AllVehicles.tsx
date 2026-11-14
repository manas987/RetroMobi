import { MerchantLayout } from "./Layout";
import { useT } from "../../i18n";
import { PageHeader } from "./ui/ui";
import { AllVehiclesTab } from "./shop/AllVehiclesTab";

export function MerchantAllVehicles() {
  return (
    <MerchantLayout>
      <AllVehiclesBody />
    </MerchantLayout>
  );
}

function AllVehiclesBody() {
  const { t } = useT();
  return (
    <div className="@container">
      <PageHeader title={t("shop.tabVehicles")} subtitle={t("shop.allVehiclesSubtitle")} />
      <AllVehiclesTab />
    </div>
  );
}
