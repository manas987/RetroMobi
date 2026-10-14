import { useEffect, useState } from "react";
import { AdminLayout } from "./Layout";
import { usePortalSession, portalFetch, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";

function TicketsBody() {
  const { session } = usePortalSession("admin");
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!session) return;
    portalFetch<{ tickets: Row[] }>("admin", "/tickets", { token: session.accessToken }).then((r) =>
      setRows(r.tickets),
    );
  }, [session?.accessToken]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-6">Support tickets</h1>
      {rows === null ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : (
        <DataTable
          rows={rows}
          emptyLabel="No tickets in the queue."
          columns={[
            { key: "category", label: "Category" },
            { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            { key: "assigned_to", label: "Assigned to" },
            { key: "created_at", label: "Opened" },
          ]}
        />
      )}
    </div>
  );
}

export function AdminTickets() {
  return (
    <AdminLayout>
      <TicketsBody />
    </AdminLayout>
  );
}
