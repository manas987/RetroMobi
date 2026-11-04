import { useState } from "react";
import { AdminLayout } from "./Layout";
import { usePortalSession, usePortalQuery, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";
import { DateField } from "../../components/DateTimeField";
import { enumLabel, rupees } from "../../lib/format";

const LIMIT = 25;

const PAYMENT_STATUSES = ["", "PENDING", "AUTHORIZED", "SUCCEEDED", "FAILED", "CANCELLED"];
const PAYOUT_STATUSES = ["", "PENDING", "PAID", "FAILED"];
const PAYOUT_STAGES = ["", "UPFRONT", "BALANCE", "CANCELLATION", "DEPOSIT_CLAIM"];

function PaymentsBody() {
  const [tab, setTab] = useState<"in" | "out">("in");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1">Money</h1>
      <p className="text-sm text-ink-3 mb-5">
        Provider-confirmed states only. No raw card data ever passes through here.
      </p>

      <div className="flex gap-1 mb-5 border-b border-line">
        <TabButton active={tab === "in"} onClick={() => setTab("in")} label="Payments in" />
        <TabButton active={tab === "out"} onClick={() => setTab("out")} label="Payouts out" />
      </div>

      {tab === "in" ? <PaymentsTab /> : <PayoutsTab />}
    </div>
  );
}

function PaymentsTab() {
  const { session } = usePortalSession("admin");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const query = new URLSearchParams({ limit: String(LIMIT), page: String(page) });
  if (status) query.set("status", status);
  if (from) query.set("from", from);
  if (to) query.set("to", to);

  const { data, error } = usePortalQuery<{ payments: Row[] }>(
    "admin",
    `/payments?${query.toString()}`,
    session?.accessToken,
  );
  const rows = data?.payments ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-5">
        {/* `status` is an unvalidated free string server-side, so a typo
            returns an empty list rather than an error — fixed choices only. */}
        <Chips values={PAYMENT_STATUSES} active={status} onPick={(v) => { setStatus(v); setPage(1); }} />
        <div className="w-44">
          <DateField label="Created from" value={from} onChange={(v) => { setFrom(v); setPage(1); }} fromYear={2024} />
        </div>
        <div className="w-44">
          <DateField label="Created to" value={to} onChange={(v) => { setTo(v); setPage(1); }} fromYear={2024} />
        </div>
      </div>

      {error && <p className="text-sm text-danger bg-danger-soft rounded-panel px-4 py-3">{error}</p>}
      {!error && data === null && <p className="text-sm text-ink-3">Loading…</p>}
      {!error && data && (
        <>
          <DataTable
            rows={rows}
            emptyLabel="No payments match these filters."
            columns={[
              { key: "type", label: "Type", render: (r) => enumLabel(r.type) },
              {
                key: "amount",
                label: "Amount",
                render: (r) => <span className="tnum">{rupees(Number(r.amount))}</span>,
              },
              { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
              { key: "provider", label: "Provider", render: (r) => enumLabel(r.provider) },
              { key: "created_at", label: "Created" },
            ]}
          />
          <Pager page={page} short={rows.length < LIMIT} onPage={setPage} />
        </>
      )}
    </div>
  );
}

/**
 * `GET /payouts` exists, is SUPER_ADMIN-gated, and was consumed only by the
 * merchant portal — so an admin could see money arriving and had no view of
 * money leaving.
 */
function PayoutsTab() {
  const { session } = usePortalSession("admin");
  const [status, setStatus] = useState("");
  const [stage, setStage] = useState("");
  const [page, setPage] = useState(1);

  const query = new URLSearchParams({ limit: String(LIMIT), page: String(page) });
  if (status) query.set("status", status);
  if (stage) query.set("stage", stage);

  const { data, error } = usePortalQuery<{ payouts: Row[] }>(
    "admin",
    `/payouts?${query.toString()}`,
    session?.accessToken,
  );
  const rows = data?.payouts ?? [];

  return (
    <div>
      {/* This route takes no date range, unlike payments. */}
      <div className="flex flex-col gap-2 mb-5">
        <Chips values={PAYOUT_STATUSES} active={status} onPick={(v) => { setStatus(v); setPage(1); }} />
        <Chips values={PAYOUT_STAGES} active={stage} onPick={(v) => { setStage(v); setPage(1); }} />
      </div>

      {error && <p className="text-sm text-danger bg-danger-soft rounded-panel px-4 py-3">{error}</p>}
      {!error && data === null && <p className="text-sm text-ink-3">Loading…</p>}
      {!error && data && (
        <>
          <DataTable
            rows={rows}
            emptyLabel="No payouts match these filters."
            columns={[
              { key: "stage", label: "Stage", render: (r) => <StatusPill value={r.stage} /> },
              {
                key: "amount",
                label: "Amount",
                render: (r) => <span className="tnum">{rupees(Number(r.amount))}</span>,
              },
              { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
              {
                key: "merchant_user_id",
                label: "Merchant",
                render: (r) => <span className="text-xs font-mono text-ink-2">{String(r.merchant_user_id)}</span>,
              },
              { key: "created_at", label: "Created" },
              { key: "paid_at", label: "Paid" },
              // Why a payout has not been paid. The sweep retries on its own, so
              // visibility is the whole requirement here -- a payout stuck
              // because the merchant's account was never verified used to be
              // indistinguishable from one Cashfree had simply not settled yet.
              {
                key: "last_error",
                label: "Last error",
                render: (r) =>
                  r.last_error ? (
                    <span className="text-xs text-warning">{String(r.last_error)}</span>
                  ) : (
                    <span className="text-ink-4">—</span>
                  ),
              },
            ]}
          />
          <Pager page={page} short={rows.length < LIMIT} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active}
      className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function Chips({
  values,
  active,
  onPick,
}: {
  values: string[];
  active: string;
  onPick: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onPick(v)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            active === v ? "bg-ink text-surface" : "bg-surface border border-line-strong text-ink-2"
          }`}
        >
          {v === "" ? "All" : enumLabel(v)}
        </button>
      ))}
    </div>
  );
}

/** No endpoint returns a total, so there is no page count — "next" is
 *  disabled once a short page comes back. */
function Pager({ page, short, onPage }: { page: number; short: boolean; onPage: (p: number) => void }) {
  return (
    <div className="flex items-center gap-3 mt-4">
      <button
        type="button"
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
        className="text-sm text-ink-2 hover:text-ink disabled:opacity-40"
      >
        ← Previous
      </button>
      <span className="text-sm text-ink-3">Page {page}</span>
      <button
        type="button"
        disabled={short}
        onClick={() => onPage(page + 1)}
        className="text-sm text-ink-2 hover:text-ink disabled:opacity-40"
      >
        Next →
      </button>
    </div>
  );
}

export function AdminPayments() {
  return (
    <AdminLayout>
      <PaymentsBody />
    </AdminLayout>
  );
}
