import { MerchantLayout } from "./Layout";
import { useT } from "../../i18n";
import { PageHeader } from "./ui/ui";
import { BranchesTab } from "./shop/BranchesTab";

export function MerchantBranches() {
  return (
    <MerchantLayout>
      <BranchesBody />
    </MerchantLayout>
  );
}

function BranchesBody() {
  const { t } = useT();
  return (
    <div className="@container">
      <PageHeader title={t("shop.branchesTitle")} subtitle={t("shop.branchesSubtitle")} />
      <BranchesTab />
    </div>
  );
}
