import { useEffect, useState } from "react";
import { AdminLayout } from "./Layout";
import { usePortalSession, portalFetch, type Row } from "../../lib/portal";
import { DataTable } from "../../components/DataTable";

function AuditBody() {
  const { session } = usePortalSession("admin");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    portalFetch<{ auditLogs: Row[] }>("admin", "/audit-logs?limit=100", { token: session.accessToken })
      .then((r) => setRows(r.auditLogs))
      .catch(() => setError("SUPER_ADMIN role required to view the audit trail."));
  }, [session?.accessToken]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1">Audit</h1>
      <p className="text-sm text-ink-3 mb-6">Actor, action, entity and time — a read-only event trail.</p>
      {error && <p className="text-sm text-danger bg-danger-soft rounded-panel px-4 py-3">{error}</p>}
      {!error && rows === null && <p className="text-sm text-ink-3">Loading…</p>}
      {!error && rows && (
        <DataTable
          rows={rows}
          emptyLabel="No audit events yet."
          columns={[
            { key: "actor_type", label: "Actor" },
            { key: "action", label: "Action" },
            { key: "entity_type", label: "Entity" },
            { key: "created_at", label: "When" },
          ]}
        />
      )}
    </div>
  );
}

export function AdminAudit() {
  return (
    <AdminLayout>
      <AuditBody />
    </AdminLayout>
  );
}
