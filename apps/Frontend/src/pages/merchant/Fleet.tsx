import { useEffect, useState } from "react";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { portalFetch, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";

function FleetBody() {
  const { token, shopId } = useMerchantShop();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    setRows(null);
    portalFetch<{ vehicles: Row[] }>("merchant", `/shops/${shopId}/vehicles`, { token }).then((r) =>
      setRows(r.vehicles),
    );
  }, [shopId, token]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-6">Fleet</h1>
      {rows === null ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : (
        <DataTable
          rows={rows}
          emptyLabel="No vehicles added to this shop yet."
          columns={[
            {
              key: "model",
              label: "Model",
              render: (r) => (
                <span className="text-ink font-medium">
                  {String(r.make ?? "")} {String(r.model ?? "")}
                </span>
              ),
            },
            { key: "registration_number", label: "Registration" },
            { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            { key: "verification_status", label: "Verification", render: (r) => <StatusPill value={r.verification_status} /> },
          ]}
        />
      )}
    </div>
  );
}

export function MerchantFleet() {
  return (
    <MerchantLayout>
      <FleetBody />
    </MerchantLayout>
  );
}
