import { useLocation } from "wouter";
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
  const [, navigate] = useLocation();
  return (
    <div className="@container">
      <PageHeader title={t("shop.branchesTitle")} subtitle={t("shop.branchesSubtitle")} />
      <BranchesTab goPapers={() => navigate("/merchant/papers")} />
    </div>
  );
}
