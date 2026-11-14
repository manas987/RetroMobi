import { MerchantLayout } from "./Layout";
import { useT } from "../../i18n";
import { PageHeader } from "./ui/ui";
import { PapersTab } from "./shop/PapersTab";

export function MerchantPapers() {
  return (
    <MerchantLayout>
      <PapersBody />
    </MerchantLayout>
  );
}

function PapersBody() {
  const { t } = useT();
  return (
    <div className="@container">
      <PageHeader title={t("shop.papersTitle")} subtitle={t("shop.papersSubtitle")} />
      <PapersTab />
    </div>
  );
}
