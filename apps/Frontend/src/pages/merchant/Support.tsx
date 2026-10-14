import { useEffect, useState } from "react";
import { MerchantLayout } from "./Layout";
import { usePortalSession, portalFetch, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";

function SupportBody() {
  const { session } = usePortalSession("merchant");
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!session) return;
    portalFetch<{ tickets: Row[] }>("merchant", "/tickets", { token: session.accessToken }).then((r) =>
      setRows(r.tickets),
    );
  }, [session?.accessToken]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-6">Support</h1>
      {rows === null ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : (
        <DataTable
          rows={rows}
          emptyLabel="No tickets raised yet."
          columns={[
            { key: "category", label: "Category" },
            { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            { key: "created_at", label: "Opened" },
          ]}
        />
      )}
    </div>
  );
}

export function MerchantSupport() {
  return (
    <MerchantLayout>
      <SupportBody />
    </MerchantLayout>
  );
}
