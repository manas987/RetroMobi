import { useEffect, useState } from "react";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { portalFetch, type Row } from "../../lib/portal";
import { StatusPill } from "../../components/DataTable";

function BranchesBody() {
  const { token, shops } = useMerchantShop();
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    for (const s of shops) {
      const id = String(s.id);
      portalFetch<{ vehicles: Row[] }>("merchant", `/shops/${id}/vehicles`, { token }).then((r) =>
        setCounts((c) => ({ ...c, [id]: r.vehicles.length })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shops, token]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1">Branches</h1>
      <p className="text-sm text-ink-3 mb-6">Every shop this account is an active member of.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {shops.map((s) => (
          <div key={String(s.id)} className="bg-surface rounded-panel border border-line p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">{String(s.name)}</p>
                <p className="text-sm text-ink-3 mt-0.5">
                  {String(s.address_line1)}, {String(s.city)}, {String(s.state)} {String(s.pincode)}
                </p>
              </div>
              <StatusPill value={s.status} />
            </div>
            <div className="mt-4 pt-4 border-t border-line flex items-center justify-between text-sm">
              <span className="text-ink-3">Your role</span>
              <span className="font-medium text-ink">{String(s.role)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-ink-3">Vehicles</span>
              <span className="tnum font-medium text-ink">{counts[String(s.id)] ?? "…"}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-ink-3">Verification</span>
              <StatusPill value={s.verification_status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MerchantBranches() {
  return (
    <MerchantLayout>
      <BranchesBody />
    </MerchantLayout>
  );
}
