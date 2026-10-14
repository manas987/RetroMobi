import { useEffect, useState } from "react";
import { MerchantLayout } from "./Layout";
import { usePortalSession, portalFetch, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";
import { rupees } from "../../lib/format";

function PayoutsBody() {
  const { session } = usePortalSession("merchant");
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!session) return;
    portalFetch<{ payouts: Row[] }>("merchant", "/payouts", { token: session.accessToken }).then((r) =>
      setRows(r.payouts),
    );
  }, [session?.accessToken]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-6">Payouts</h1>
      {rows === null ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : (
        <DataTable
          rows={rows}
          emptyLabel="No payouts recorded yet — these are created once a booking is confirmed."
          columns={[
            { key: "stage", label: "Stage" },
            { key: "amount", label: "Amount", render: (r) => <span className="tnum">{rupees(Number(r.amount))}</span> },
            { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            { key: "created_at", label: "Created" },
            { key: "paid_at", label: "Paid" },
          ]}
        />
      )}
    </div>
  );
}

export function MerchantPayouts() {
  return (
    <MerchantLayout>
      <PayoutsBody />
    </MerchantLayout>
  );
}
