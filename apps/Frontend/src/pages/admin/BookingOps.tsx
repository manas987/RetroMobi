import { isValidElement, useState } from "react";
import { AdminLayout } from "./Layout";
import { usePortalSession, usePortalQuery, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";
import { DateField } from "../../components/DateTimeField";
import { enumLabel, rupees } from "../../lib/format";

const LIMIT = 25;

// No CANCELLED: a cancelled booking is soft-deleted and absent from the list
// entirely, so offering it as a filter would promise rows that never arrive.
const STATUSES = ["", "HOLD", "CONFIRMED", "COMPLETED"];

function BookingOpsBody() {
  const { session } = usePortalSession("admin");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Row | null>(null);

  const query = new URLSearchParams({ limit: String(LIMIT), page: String(page) });
  if (status) query.set("status", status);
  if (from) query.set("from", from);
  if (to) query.set("to", to);

  const { data, error } = usePortalQuery<{ bookings: Row[] }>(
    "admin",
    `/bookings?${query.toString()}`,
    session?.accessToken,
  );

  const rows = data?.bookings ?? [];

  function setFilter(fn: () => void) {
    fn();
    setPage(1);
    setSelected(null);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1">Booking ops</h1>
      <p className="text-sm text-ink-3 mb-5">
        Platform-wide bookings, read-only — lifecycle actions (pickup, return, cancel) happen on the merchant
        side, not here.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div className="flex gap-1.5 mb-4">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(() => setStatus(s))}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                status === s ? "bg-ink text-surface" : "bg-surface border border-line-strong text-ink-2"
              }`}
            >
              {s === "" ? "All" : enumLabel(s)}
            </button>
          ))}
        </div>
        <div className="w-44">
          <DateField label="Pickup from" value={from} onChange={(v) => setFilter(() => setFrom(v))} fromYear={2024} />
        </div>
        <div className="w-44">
          <DateField label="Pickup to" value={to} onChange={(v) => setFilter(() => setTo(v))} fromYear={2024} />
        </div>
        {(from || to || status) && (
          <button
            type="button"
            onClick={() => setFilter(() => {
              setStatus("");
              setFrom("");
              setTo("");
            })}
            className="text-sm text-ink-3 hover:text-ink mb-4"
          >
            Clear
          </button>
        )}
      </div>

      {error && <p className="text-sm text-danger bg-danger-soft rounded-panel px-4 py-3">{error}</p>}
      {!error && data === null && <p className="text-sm text-ink-3">Loading…</p>}
      {!error && data && (
        <>
          <DataTable
            rows={rows}
            emptyLabel="No bookings match these filters."
            columns={[
              { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
              { key: "source", label: "Source", render: (r) => enumLabel(r.source) },
              { key: "scheduled_pickup_at", label: "Pickup" },
              { key: "scheduled_return_at", label: "Return" },
              {
                key: "total_amount",
                label: "Total",
                render: (r) => <span className="tnum">{rupees(Number(r.total_amount))}</span>,
              },
              {
                key: "__open",
                label: "",
                render: (r) => (
                  <button
                    type="button"
                    onClick={() => setSelected((prev) => (prev?.id === r.id ? null : r))}
                    className="text-xs font-medium text-ink hover:underline"
                  >
                    Detail
                  </button>
                ),
              },
            ]}
          />

          {/* These endpoints return no total, so there is no page count to
              show — "next" is simply disabled once a short page arrives. */}
          <div className="flex items-center gap-3 mt-4">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => {
                setPage((p) => p - 1);
                setSelected(null);
              }}
              className="text-sm text-ink-2 hover:text-ink disabled:opacity-40"
            >
              ← Previous
            </button>
            <span className="text-sm text-ink-3">Page {page}</span>
            <button
              type="button"
              disabled={rows.length < LIMIT}
              onClick={() => {
                setPage((p) => p + 1);
                setSelected(null);
              }}
              className="text-sm text-ink-2 hover:text-ink disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </>
      )}

      {selected && <BookingDetail booking={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

/**
 * Everything the admin list already carries. There is no admin
 * booking-detail endpoint and no vehicle/customer join on this route, so the
 * vehicle and renter are identified by id only.
 */
function BookingDetail({ booking: b, onClose }: { booking: Row; onClose: () => void }) {
  const walkin = b.source === "OFFLINE";

  return (
    <div className="rounded-panel border border-line bg-surface p-5 mt-5 max-w-xl">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-sm font-semibold text-ink">Booking detail</p>
          <p className="text-xs text-ink-4 mt-0.5">{String(b.id)}</p>
        </div>
        <button type="button" onClick={onClose} className="text-sm text-ink-3 hover:text-ink">
          Close
        </button>
      </div>

      <dl className="text-sm flex flex-col gap-1.5 mb-4">
        <Pair label="Status" value={<StatusPill value={b.status} />} />
        <Pair label="Source" value={enumLabel(b.source)} />
        <Pair label="Vehicle id" value={<Mono value={b.vehicle_id} />} />
        {walkin ? (
          <>
            <Pair label="Walk-in name" value={b.walkin_name} />
            <Pair label="Walk-in phone" value={b.walkin_phone} />
            <Pair label="Licence number" value={b.walkin_dl_number} />
          </>
        ) : (
          <>
            <Pair label="Booking group id" value={<Mono value={b.group_id} />} />
            <Pair label="Rider id" value={<Mono value={b.rider_id} />} />
          </>
        )}
        <Pair label="Picked up at" value={b.actual_pickup_at ?? "Not yet"} />
        <Pair label="Returned at" value={b.actual_return_at ?? "Not yet"} />
      </dl>

      <div className="border-t border-line pt-4">
        <p className="text-xs text-ink-3 mb-2">Money</p>
        <dl className="text-sm flex flex-col gap-1.5">
          <Pair label="Rental" value={rupees(Number(b.rental_amount))} />
          <Pair label="Platform fee" value={rupees(Number(b.platform_fee))} />
          <Pair label="Tax (within the total)" value={rupees(Number(b.tax_amount))} />
          <Pair label="Discount" value={rupees(Number(b.discount_amount))} />
          <Pair label="Deposit (held by the shop)" value={rupees(Number(b.security_deposit_amount))} />
          <Pair label="Total" value={<span className="font-semibold">{rupees(Number(b.total_amount))}</span>} />
        </dl>
      </div>
    </div>
  );
}

/** `value` is `unknown` because every field comes off a `Row`; an already-built
 *  element passes through, anything else is stringified. */
function Pair({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-ink text-right">
        {value == null || value === "" ? (
          <span className="text-ink-4">—</span>
        ) : isValidElement(value) ? (
          value
        ) : (
          String(value)
        )}
      </dd>
    </div>
  );
}

function Mono({ value }: { value: unknown }) {
  if (value == null) return <span className="text-ink-4">—</span>;
  return <span className="text-xs font-mono text-ink-2">{String(value)}</span>;
}

export function AdminBookingOps() {
  return (
    <AdminLayout>
      <BookingOpsBody />
    </AdminLayout>
  );
}
