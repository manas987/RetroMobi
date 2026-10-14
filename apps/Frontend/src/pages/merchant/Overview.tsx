import { useEffect, useState } from "react";
import { Link } from "wouter";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { portalFetch, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";
import { ActivityChart, bucketByDay } from "../../components/ActivityChart";

function OverviewBody() {
  const { token, shopId, shops } = useMerchantShop();
  const shop = shops.find((s) => s.id === shopId);
  const [vehicles, setVehicles] = useState<Row[] | null>(null);
  const [bookings, setBookings] = useState<Row[] | null>(null);
  const [payouts, setPayouts] = useState<Row[] | null>(null);
  const [licences, setLicences] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!shopId) return;
    setVehicles(null);
    setBookings(null);
    setPayouts(null);
    portalFetch<{ vehicles: Row[] }>("merchant", `/shops/${shopId}/vehicles`, { token }).then((r) =>
      setVehicles(r.vehicles),
    );
    portalFetch<{ bookings: Row[] }>("merchant", `/shops/${shopId}/bookings`, { token }).then((r) =>
      setBookings(r.bookings),
    );
    portalFetch<{ payouts: Row[] }>("merchant", "/payouts", { token }).then((r) => setPayouts(r.payouts));
    portalFetch<{ licences: Row[] }>("merchant", "/licences", { token }).then((r) => setLicences(r.licences));
  }, [shopId, token]);

  const activeVehicles = vehicles?.filter((v) => v.status === "ACTIVE").length ?? null;
  const upcoming = bookings?.filter((b) => b.status === "CONFIRMED" || b.status === "HOLD") ?? null;
  const pendingPayouts = payouts?.filter((p) => p.status === "PENDING") ?? null;

  const needsAttention = [
    ...(vehicles ?? [])
      .filter((v) => v.verification_status === "REJECTED" || v.verification_status === "PENDING")
      .map((v) => ({
        label: `${v.registration_number} verification ${String(v.verification_status).toLowerCase()}`,
        href: "/merchant/fleet",
      })),
    ...(licences ?? [])
      .filter((l) => l.status !== "ACTIVE")
      .map((l) => ({ label: `Licence ${l.licence_number} is ${String(l.status).toLowerCase()}`, href: "/merchant/compliance" })),
  ];

  const chartData = bookings
    ? bucketByDay(bookings.map((b) => ({ dateField: String(b.created_at) })))
    : [];

  return (
    <div>
      <p className="text-xs font-medium text-ink-3 tracking-wide uppercase">{String(shop?.name ?? "")}</p>
      <h1 className="text-2xl font-semibold text-ink mt-1 mb-6">Overview</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Active vehicles" value={activeVehicles} />
        <StatCard label="Upcoming bookings" value={upcoming?.length ?? null} />
        <StatCard label="Pending payouts" value={pendingPayouts?.length ?? null} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mb-8 items-start">
        {bookings && <ActivityChart data={chartData} label="Bookings created — last 7 days" />}

        <div className="bg-surface rounded-panel border border-line px-5 py-4">
          <p className="text-sm font-medium text-ink mb-3">Needs attention</p>
          {needsAttention.length === 0 ? (
            <p className="text-sm text-ink-3">Nothing flagged right now.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {needsAttention.slice(0, 5).map((n) => (
                <li key={n.label}>
                  <Link href={n.href} className="text-sm text-ink-2 hover:text-ink transition-colors">
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <h2 className="text-sm font-semibold text-ink mb-3">Upcoming bookings</h2>
      {bookings === null ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : (
        <DataTable
          rows={(upcoming ?? []).slice(0, 8)}
          emptyLabel="No upcoming bookings for this shop."
          columns={[
            { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            { key: "scheduled_pickup_at", label: "Pickup" },
            { key: "scheduled_return_at", label: "Return" },
            { key: "source", label: "Source" },
          ]}
        />
      )}
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

export function MerchantOverview() {
  return (
    <MerchantLayout>
      <OverviewBody />
    </MerchantLayout>
  );
}
