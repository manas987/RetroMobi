import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useT } from "../../i18n";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { PageHeader } from "./ui/ui";
import { ShopPapersTab } from "./shop/ShopPapersTab";

export function MerchantShopPapers() {
  return (
    <MerchantLayout>
      <ShopPapersBody />
    </MerchantLayout>
  );
}

/** The selected shop's papers, on their own page: five groups from the licence rules. */
function ShopPapersBody() {
  const { t } = useT();
  const { shopId, shops } = useMerchantShop();
  const shop = shops.find((s) => String(s.id) === shopId);
  return (
    <div className="@container">
      <Link href="/merchant/shop" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden />{shop ? String(shop.name) : t("nav.shop")}
      </Link>
      <PageHeader title={t("shop.papersPageTitle")} subtitle={t("shop.papersPageHint")} />
      {shopId && <ShopPapersTab key={shopId} shopId={shopId} />}
    </div>
  );
}
