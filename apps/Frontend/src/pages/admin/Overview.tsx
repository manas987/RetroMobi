import { Link } from "wouter";
import { AdminLayout } from "./Layout";
import { usePortalSession, usePortalQuery, type Row } from "../../lib/portal";
import { ActivityChart, bucketByDay } from "../../components/ActivityChart";

/** What each list is asked for. The count is only honest up to this. */
const PAGE_LIMIT = 100;

/**
 * No oversight endpoint returns a total, so a count here is the length of one
 * page. Saying "100" when there are 4,000 merchants is worse than saying
 * nothing, so a full page reads as "100+".
 */
function countLabel(rows: Row[] | undefined, error: string | null): string {
  if (error) return "!";
  if (!rows) return "—";
  return rows.length >= PAGE_LIMIT ? `${PAGE_LIMIT}+` : String(rows.length);
}

const QUEUES = [
  { type: "SHOP", label: "Shops", href: "/admin/merchant-review" },
  { type: "SHOP_LICENCE", label: "Licences", href: "/admin/merchant-review" },
  { type: "MERCHANT_DOCUMENT", label: "Merchant documents", href: "/admin/merchant-review" },
  { type: "SHOP_DOCUMENT", label: "Shop papers", href: "/admin/merchant-review" },
  { type: "VEHICLE", label: "Vehicles", href: "/admin/vehicle-review" },
  { type: "VEHICLE_DOCUMENT", label: "Vehicle documents", href: "/admin/vehicle-review" },
] as const;

function OverviewBody() {
  const { session } = usePortalSession("admin");
  const role = session?.role ?? "SUPPORT";
  const canSeeOversight = role === "ADMIN" || role === "SUPER_ADMIN";
  const token = canSeeOversight ? session?.accessToken : undefined;

  const merchants = usePortalQuery<{ merchants: Row[] }>("admin", `/merchants?limit=${PAGE_LIMIT}`, token);
  const shops = usePortalQuery<{ shops: Row[] }>("admin", `/shops?limit=${PAGE_LIMIT}`, token);
  const vehicles = usePortalQuery<{ vehicles: Row[] }>("admin", `/vehicles?limit=${PAGE_LIMIT}`, token);
  const bookings = usePortalQuery<{ bookings: Row[] }>("admin", `/bookings?limit=${PAGE_LIMIT}`, token);

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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {/* No /admin/merchants, /admin/shops or /admin/vehicles page exists,
                so only Bookings drills in. */}
            <StatCard label="Merchants" value={countLabel(merchants.data?.merchants, merchants.error)} error={merchants.error} href="/admin/merchants" />
            <StatCard label="Shops" value={countLabel(shops.data?.shops, shops.error)} error={shops.error} />
            <StatCard label="Vehicles" value={countLabel(vehicles.data?.vehicles, vehicles.error)} error={vehicles.error} />
            <StatCard
              label="Bookings"
              value={countLabel(bookings.data?.bookings, bookings.error)}
              error={bookings.error}
              href="/admin/booking-ops"
            />
          </div>

          <div className="bg-surface rounded-panel border border-line px-5 py-4 mb-6">
            <p className="text-sm font-medium text-ink mb-3">Waiting on review</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {QUEUES.map((q) => (
                <QueueCount key={q.type} type={q.type} label={q.label} href={q.href} token={token} />
              ))}
            </div>
          </div>

          {bookings.error && (
            <p className="text-sm text-danger bg-danger-soft rounded-panel px-4 py-3 mb-6">
              Bookings feed: {bookings.error}
            </p>
          )}

          {bookings.data && (
            <ActivityChart
              data={bucketByDay(bookings.data.bookings.map((b) => ({ dateField: String(b.created_at) })))}
              label="Bookings created — last 7 days, platform-wide"
            />
          )}
        </>
      )}

      {canSeeOversight && (
        <p className="mt-6 text-xs text-ink-4 max-w-md">
          A count shown as {PAGE_LIMIT}+ means the list filled its page — these endpoints return no total, so
          the exact figure is only known below {PAGE_LIMIT}. Review counts are exact.
        </p>
      )}
    </div>
  );
}

/** Verification queues have no paging, so their counts are real totals. */
function QueueCount({
  type,
  label,
  href,
  token,
}: {
  type: string;
  label: string;
  href: string;
  token: string | undefined;
}) {
  const { data, error } = usePortalQuery<{ rows: Row[] }>("admin", `/verification/queue?type=${type}`, token);
  const count = data?.rows.length;

  return (
    <Link
      href={href}
      className="rounded-row bg-surface-2 px-3 py-2.5 hover:bg-surface-3 transition-colors block"
    >
      <p className="text-xs text-ink-3">{label}</p>
      <p
        className={`tnum text-lg font-semibold mt-0.5 ${
          error ? "text-danger" : count ? "text-warning" : "text-ink"
        }`}
        title={error ?? undefined}
      >
        {error ? "!" : (count ?? "—")}
      </p>
    </Link>
  );
}

function StatCard({
  label,
  value,
  error,
  href,
}: {
  label: string;
  value: string;
  error: string | null;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-xs text-ink-3">{label}</p>
      <p className={`tnum text-2xl font-semibold mt-1 ${error ? "text-danger" : "text-ink"}`}>{value}</p>
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </>
  );

  if (href && !error) {
    return (
      <Link
        href={href}
        className="bg-surface rounded-panel border border-line px-5 py-4 hover:border-line-strong transition-colors block"
      >
        {body}
      </Link>
    );
  }

  return <div className="bg-surface rounded-panel border border-line px-5 py-4">{body}</div>;
}

export function AdminOverview() {
  return (
    <AdminLayout>
      <OverviewBody />
    </AdminLayout>
  );
}
