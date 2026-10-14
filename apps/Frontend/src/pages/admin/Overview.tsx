import { useEffect, useState } from "react";
import { AdminLayout } from "./Layout";
import { usePortalSession, portalFetch, type Row } from "../../lib/portal";
import { ActivityChart, bucketByDay } from "../../components/ActivityChart";

function OverviewBody() {
  const { session } = usePortalSession("admin");
  const role = session?.role ?? "SUPPORT";
  const canSeeOversight = role === "ADMIN" || role === "SUPER_ADMIN";

  const [merchants, setMerchants] = useState<Row[] | null>(null);
  const [shops, setShops] = useState<Row[] | null>(null);
  const [vehicles, setVehicles] = useState<Row[] | null>(null);
  const [bookings, setBookings] = useState<Row[] | null>(null);
  const [verificationPending, setVerificationPending] = useState<number | null>(null);

  useEffect(() => {
    if (!session || !canSeeOversight) return;
    const token = session.accessToken;
    portalFetch<{ merchants: Row[] }>("admin", "/merchants?limit=100", { token }).then((r) => setMerchants(r.merchants));
    portalFetch<{ shops: Row[] }>("admin", "/shops?limit=100", { token }).then((r) => setShops(r.shops));
    portalFetch<{ vehicles: Row[] }>("admin", "/vehicles?limit=100", { token }).then((r) => setVehicles(r.vehicles));
    portalFetch<{ bookings: Row[] }>("admin", "/bookings?limit=100", { token }).then((r) => setBookings(r.bookings));
    portalFetch<{ rows: Row[] }>("admin", "/verification/queue?type=SHOP", { token }).then((r) =>
      setVerificationPending(r.rows.length),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-6">Control room</h1>

      {!canSeeOversight ? (
        <p className="text-sm text-ink-3 bg-surface rounded-panel border border-line px-5 py-4 max-w-md">
          Operational counts need the ADMIN role or above. As SUPPORT, head to{" "}
          <span className="font-medium text-ink">Support tickets</span> instead.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
            <StatCard label="Merchants" value={merchants?.length ?? null} />
            <StatCard label="Shops" value={shops?.length ?? null} />
            <StatCard label="Vehicles" value={vehicles?.length ?? null} />
            <StatCard label="Bookings" value={bookings?.length ?? null} />
            <StatCard label="Pending shop verifications" value={verificationPending} />
          </div>

          {bookings && (
            <ActivityChart
              data={bucketByDay(bookings.map((b) => ({ dateField: String(b.created_at) })))}
              label="Bookings created — last 7 days, platform-wide"
            />
          )}
        </>
      )}

      <p className="mt-6 text-xs text-ink-4 max-w-md">
        Counts reflect the first 100 rows per list endpoint, not a true total — pagination for these
        feeds isn't wired up yet.
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="bg-surface rounded-panel border border-line px-5 py-4">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="tnum text-2xl font-semibold text-ink mt-1">{value ?? "—"}</p>
    </div>
  );
}

export function AdminOverview() {
  return (
    <AdminLayout>
      <OverviewBody />
    </AdminLayout>
  );
}
