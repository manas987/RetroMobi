import { useState } from "react";
import { useLocation } from "wouter";
import { Plus, Store } from "lucide-react";
import { useT } from "../../../i18n";
import { useMerchantShop } from "../Layout";
import { Button, Card, EmptyState } from "../ui/ui";
import { BranchCard } from "./BranchCard";
import { BranchSheet } from "./BranchSheet";

export function BranchesTab() {
  const { token, shops, setShopId, reloadShops } = useMerchantShop();
  const { t } = useT();
  const [, navigate] = useLocation();
  const [adding, setAdding] = useState(false);
  const addButton = <Button icon={Plus} onClick={() => setAdding(true)}>{t("shop.addBranch")}</Button>;

  return (
    <div className="@container">
      {shops.length === 0 ? (
        <Card><EmptyState icon={Store} text={t("shop.noBranches")} action={addButton} /></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2">
            {shops.map((s) => (
              <BranchCard key={String(s.id)} shop={s} token={token} reloadShops={reloadShops} selectShop={setShopId} />
            ))}
          </div>
          <div className="mt-4">{addButton}</div>
        </>
      )}
      <BranchSheet open={adding} onClose={() => setAdding(false)} token={token} reloadShops={reloadShops} lockedState={shops[0] ? String(shops[0].state) : undefined}
        // A new shop goes straight to its papers: optional now, needed only to list it.
        onSaved={(row) => { setShopId(String(row.id)); navigate("/merchant/shop/papers?new=1"); }} />
    </div>
  );
}
