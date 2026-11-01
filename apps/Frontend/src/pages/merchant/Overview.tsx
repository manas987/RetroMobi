import { Link, useLocation } from "wouter";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { usePortalQuery, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";
import { ErrorBox } from "../../components/AuthFormBits";
import { ActivityChart, bucketByDay } from "../../components/ActivityChart";
import { enumLabel } from "../../lib/format";

function OverviewBody() {
  const { token, shopId, shops } = useMerchantShop();
  const [, navigate] = useLocation();
  const shop = shops.find((s) => String(s.id) === shopId);

  // Every one of these used to drop its error, so a failed fetch left a "—" in
  // the card forever, identical to still loading.
  const { data: vehiclesRes, error: vehiclesError } = usePortalQuery<{ vehicles: Row[] }>(
    "merchant",
    shopId ? `/shops/${shopId}/vehicles` : null,
    token,
  );
  const { data: bookingsRes, error: bookingsError } = usePortalQuery<{ bookings: Row[] }>(
    "merchant",
    shopId ? `/shops/${shopId}/bookings` : null,
    token,
  );
  const { data: payoutsRes, error: payoutsError } = usePortalQuery<{ payouts: Row[] }>(
    "merchant",
    "/payouts",
    token,
  );
  const { data: licencesRes, error: licencesError } = usePortalQuery<{ licences: Row[] }>(
    "merchant",
    "/licences",
    token,
  );

  const firstError = vehiclesError ?? bookingsError ?? payoutsError ?? licencesError;

  const vehicles = vehiclesRes?.vehicles ?? null;
  const bookings = bookingsRes?.bookings ?? null;
  const payouts = payoutsRes?.payouts ?? null;
  const licences = licencesRes?.licences ?? null;

  const activeVehicles = vehicles?.filter((v) => v.status === "ACTIVE").length ?? null;
  const upcoming = bookings?.filter((b) => b.status === "CONFIRMED" || b.status === "HOLD") ?? null;
  const pendingPayouts = payouts?.filter((p) => p.status === "PENDING") ?? null;

  const needsAttention = [
    ...(vehicles ?? [])
      .filter((v) => v.verification_status === "REJECTED" || v.verification_status === "PENDING")
      .map((v) => ({
        label: `${String(v.registration_number)} verification ${enumLabel(v.verification_status).toLowerCase()}`,
        href: "/merchant/fleet",
      })),
    ...(licences ?? [])
      .filter((l) => l.status !== "ACTIVE")
      .map((l) => ({
        label: `Licence ${String(l.licence_number)} is ${enumLabel(l.status).toLowerCase()}`,
        href: "/merchant/compliance",
      })),
  ];

  const chartData = bookings
    ? bucketByDay(bookings.map((b) => ({ dateField: String(b.created_at) })))
    : [];

  return (
    <div>
      <p className="text-xs font-medium text-ink-3 tracking-wide uppercase">{String(shop?.name ?? "")}</p>
      <h1 className="text-2xl font-semibold text-ink mt-1 mb-6">Overview</h1>

      {firstError && <ErrorBox text={firstError} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Active vehicles" value={activeVehicles} failed={vehiclesError != null} />
        <StatCard label="Upcoming bookings" value={upcoming?.length ?? null} failed={bookingsError != null} />
        {/* Payouts are merchant-wide while everything beside them is scoped to
            the shop in the switcher, so the label has to say so. */}
        <StatCard
          label="Pending payouts (all shops)"
          value={pendingPayouts?.length ?? null}
          failed={payoutsError != null}
        />
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
      {bookingsError ? (
        <ErrorBox text={bookingsError} />
      ) : bookings === null ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : (
        <DataTable
          rows={(upcoming ?? []).slice(0, 8)}
          emptyLabel="No upcoming bookings for this shop."
          columns={[
            { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            {
              key: "vehicle",
              label: "Vehicle",
              render: (r) =>
                r.registration_number ? (
                  `${String(r.make ?? "")} ${String(r.model ?? "")} · ${String(r.registration_number)}`
                ) : (
                  <span className="text-ink-4">—</span>
                ),
            },
            { key: "scheduled_pickup_at", label: "Pickup" },
            { key: "scheduled_return_at", label: "Return" },
            { key: "source", label: "Source", render: (r) => enumLabel(r.source) },
            {
              key: "__open",
              label: "",
              render: () => (
                <button
                  type="button"
                  onClick={() => navigate("/merchant/bookings")}
                  className="text-xs font-medium text-ink hover:underline"
                >
                  Open
                </button>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, failed }: { label: string; value: number | null; failed: boolean }) {
  return (
    <div className="bg-surface rounded-panel border border-line px-5 py-4">
      <p className="text-xs text-ink-3">{label}</p>
      {failed ? (
        <p className="text-sm text-danger mt-2">Couldn't load</p>
      ) : (
        <p className="tnum text-2xl font-semibold text-ink mt-1">{value ?? "—"}</p>
      )}
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
