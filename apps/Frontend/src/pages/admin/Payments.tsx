import { useEffect, useState } from "react";
import { AdminLayout } from "./Layout";
import { usePortalSession, portalFetch, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";
import { rupees } from "../../lib/format";

function PaymentsBody() {
  const { session } = usePortalSession("admin");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    portalFetch<{ payments: Row[] }>("admin", "/payments?limit=100", { token: session.accessToken })
      .then((r) => setRows(r.payments))
      .catch(() => setError("SUPER_ADMIN role required to view payments."));
  }, [session?.accessToken]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1">Payments</h1>
      <p className="text-sm text-ink-3 mb-6">Provider-confirmed payment states. No raw card data ever passes through here.</p>
      {error && <p className="text-sm text-danger bg-danger-soft rounded-panel px-4 py-3">{error}</p>}
      {!error && rows === null && <p className="text-sm text-ink-3">Loading…</p>}
      {!error && rows && (
        <DataTable
          rows={rows}
          emptyLabel="No payments recorded yet."
          columns={[
            { key: "type", label: "Type" },
            { key: "amount", label: "Amount", render: (r) => <span className="tnum">{rupees(Number(r.amount))}</span> },
            { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            { key: "provider", label: "Provider" },
            { key: "created_at", label: "Created" },
          ]}
        />
      )}
    </div>
  );
}

export function AdminPayments() {
  return (
    <AdminLayout>
      <PaymentsBody />
    </AdminLayout>
  );
}
