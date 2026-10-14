import { Link, useParams } from "wouter";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { useVehicleDetail } from "../lib/api";
import { rupees } from "../lib/format";

export function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: v, isLoading, isError } = useVehicleDetail(id);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="max-w-[1100px] w-full mx-auto px-5 py-8 flex-1">
        <Link href="/browse" className="text-sm text-ink-3 hover:text-ink transition-colors">
          ← Back to browse
        </Link>

        {isLoading && <p className="mt-8 text-sm text-ink-3">Loading…</p>}

        {isError && (
          <p className="mt-8 text-sm text-danger bg-danger-soft rounded-panel px-4 py-3">
            Couldn't load this listing. It may have been removed.
          </p>
        )}

        {v && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-10 items-start">
            <div>
              <div className="aspect-[16/9] rounded-panel bg-surface-3 flex items-center justify-center text-ink-4 text-sm mb-6">
                Photo pending
              </div>

              <h1 className="text-3xl font-bold text-ink">
                {v.make} {v.model}
              </h1>
              <p className="mt-1.5 text-ink-2">
                {v.shopName} · {v.shopAddress}
                {v.rating != null && v.reviewCount > 0 ? ` · ★ ${v.rating.toFixed(1)} (${v.reviewCount})` : " · No reviews yet"}
              </p>

              {v.licence ? (
                <div className="mt-6 rounded-panel bg-verified-soft border border-verified/20 px-5 py-4">
                  <p className="text-verified font-semibold flex items-center gap-1.5">
                    <CheckIcon /> Licensed to rent
                  </p>
                  <p className="mt-1 text-sm text-ink-2">
                    Named on {v.shopName}'s Rent-a-Motorcycle licence {v.licence.licenceNumber}
                    {v.licence.issuingAuthority ? ` (${v.licence.issuingAuthority})` : ""}
                    {v.licence.validUntil ? `, valid to ${formatDate(v.licence.validUntil)}.` : "."}
                  </p>
                </div>
              ) : (
                <div className="mt-6 rounded-panel bg-warning-soft border border-warning/20 px-5 py-4">
                  <p className="text-warning font-semibold">Licence not yet confirmed</p>
                  <p className="mt-1 text-sm text-ink-2">
                    This vehicle isn't currently named on an active rental licence.
                  </p>
                </div>
              )}

              <section className="mt-8 rounded-panel border border-line divide-y divide-line">
                <h2 className="px-5 py-4 font-semibold text-ink">Specs & pricing</h2>
                <Row label="Fuel" value={v.fuelType ?? "—"} />
                {v.engineCc != null && <Row label="Engine" value={`${v.engineCc} cc`} />}
                {v.bodyType && <Row label="Body type" value={v.bodyType} />}
                {v.seatingCapacity != null && <Row label="Seating" value={`${v.seatingCapacity}`} />}
                <Row label="Weekday rate" value={`${rupees(v.amount)} / day`} />
                <Row label="Weekend rate" value={`${rupees(v.weekendAmount)} / day`} />
                {v.lateFeeAmount > 0 && <Row label="Late return" value={`${rupees(v.lateFeeAmount)} / hour`} />}
              </section>

              <section className="mt-8 rounded-panel border border-line divide-y divide-line">
                <h2 className="px-5 py-4 font-semibold text-ink">Shop identity</h2>
                <Row label="Name" value={v.shopName} />
                <Row label="Address" value={v.shopAddress} />
                {v.shopPhone && <Row label="Phone" value={v.shopPhone} />}
              </section>
            </div>

            <aside className="rounded-panel border border-line p-6 lg:sticky lg:top-24">
              <div className="tnum text-3xl font-bold text-ink">
                {rupees(v.amount)}
                <span className="text-base font-normal text-ink-3"> /day</span>
              </div>

              <div className="mt-4 rounded-row bg-surface-2 px-4 py-3">
                <p className="text-sm font-medium text-ink">Refundable deposit: {rupees(v.securityDeposit)}</p>
                <p className="mt-1 text-xs text-ink-3">
                  Held by {v.shopName}, not RetroMobi. Returned per the shop's stated condition after
                  the vehicle is checked in.
                </p>
              </div>

              <button
                type="button"
                className="mt-5 w-full h-11 rounded-row bg-amber text-on-amber font-semibold hover:brightness-95 transition-[filter]"
              >
                Book this scooter
              </button>
              <p className="mt-2 text-center text-xs text-ink-4">
                Full price breakdown before you pay. No hidden fees.
              </p>
            </aside>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-3 flex items-center justify-between gap-4 text-sm">
      <span className="text-ink-3">{label}</span>
      <span className="text-ink font-medium text-right">{value}</span>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12.5l5 5L20 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
