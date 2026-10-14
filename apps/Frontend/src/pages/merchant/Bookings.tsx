import { useEffect, useState } from "react";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { portalFetch, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";

function BookingsBody() {
  const { token, shopId } = useMerchantShop();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    setRows(null);
    portalFetch<{ bookings: Row[] }>("merchant", `/shops/${shopId}/bookings`, { token }).then((r) =>
      setRows(r.bookings),
    );
  }, [shopId, token]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-6">Bookings</h1>
      {rows === null ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : (
        <DataTable
          rows={rows}
          emptyLabel="No bookings for this shop yet."
          columns={[
            { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            { key: "scheduled_pickup_at", label: "Pickup" },
            { key: "scheduled_return_at", label: "Return" },
            { key: "source", label: "Source" },
            { key: "created_at", label: "Booked" },
          ]}
        />
      )}
    </div>
  );
}

export function MerchantBookings() {
  return (
    <MerchantLayout>
      <BookingsBody />
    </MerchantLayout>
  );
}
