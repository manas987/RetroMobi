import { Link } from "wouter";
import { Card } from "../ui/ui";
import { useT } from "../../../i18n";

/** Filled in by the named paper slots (docs/shop-page-plan.md step 6). */
export function ShopPapersTab(_: { shopId: string }) {
  const { t } = useT();
  return <Card><Link href="/merchant/papers" className="text-base font-semibold text-ink underline">{t("nav.documents")}</Link></Card>;
}
