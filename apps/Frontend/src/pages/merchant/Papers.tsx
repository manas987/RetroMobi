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
    // Wide screens: one screen, three tiles side by side, each scrolling inside.
    <div className="@container flex flex-col xl:h-[calc(100dvh-3rem)]">
      <PageHeader title={t("shop.papersTitle")} subtitle={t("shop.papersSubtitle")} />
      <PapersTab />
    </div>
  );
}
