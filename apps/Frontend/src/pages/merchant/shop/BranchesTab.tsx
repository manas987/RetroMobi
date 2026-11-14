import { useState } from "react";
import { Plus, Store } from "lucide-react";
import type { Row } from "../../../lib/portal";
import { useT } from "../../../i18n";
import { useMerchantShop } from "../Layout";
import { useMerchantQuery } from "../query";
import { Button, Card, EmptyState } from "../ui/ui";
import { BranchCard } from "./BranchCard";
import { BranchSheet } from "./BranchSheet";

export function BranchesTab({ goPapers }: { goPapers: () => void }) {
  const { token, shops, setShopId, reloadShops } = useMerchantShop();
  const { t } = useT();
  const [adding, setAdding] = useState(false);
  // Licences belong to the merchant, not a shop; each row lists the shops it covers.
  const licences = useMerchantQuery<{ licences: Row[] }>("/licences", token);
  const addButton = <Button icon={Plus} onClick={() => setAdding(true)}>{t("shop.addBranch")}</Button>;

  return (
    <div className="@container">
      {shops.length === 0 ? (
        <Card><EmptyState icon={Store} text={t("shop.noBranches")} action={addButton} /></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2">
            {shops.map((s) => (
              <BranchCard key={String(s.id)} shop={s} token={token} licences={licences.data?.licences ?? []} reloadShops={reloadShops} selectShop={setShopId} goPapers={goPapers} />
            ))}
          </div>
          <div className="mt-4">{addButton}</div>
        </>
      )}
      <BranchSheet open={adding} onClose={() => setAdding(false)} token={token} reloadShops={reloadShops} lockedState={shops[0] ? String(shops[0].state) : undefined} />
    </div>
  );
}
