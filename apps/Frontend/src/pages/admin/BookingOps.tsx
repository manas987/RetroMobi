import { useEffect, useState } from "react";
import { AdminLayout } from "./Layout";
import { usePortalSession, portalFetch, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";

function BookingOpsBody() {
  const { session } = usePortalSession("admin");
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!session) return;
    portalFetch<{ bookings: Row[] }>("admin", "/bookings?limit=100", { token: session.accessToken }).then((r) =>
      setRows(r.bookings),
    );
  }, [session?.accessToken]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1">Booking ops</h1>
      <p className="text-sm text-ink-3 mb-6">
        Platform-wide bookings, read-only — lifecycle actions (pickup, return, cancel) happen on the merchant
        side, not here.
      </p>
      {rows === null ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : (
        <DataTable
          rows={rows}
          emptyLabel="No bookings yet."
          columns={[
            { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            { key: "source", label: "Source" },
            { key: "scheduled_pickup_at", label: "Pickup" },
            { key: "scheduled_return_at", label: "Return" },
            { key: "created_at", label: "Created" },
          ]}
        />
      )}
    </div>
  );
}

export function AdminBookingOps() {
  return (
    <AdminLayout>
      <BookingOpsBody />
    </AdminLayout>
  );
}
