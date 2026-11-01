import type { Row } from "../lib/portal";
import { enumLabel } from "../lib/format";

export interface Column {
  key: string;
  label: string;
  render?: (row: Row) => React.ReactNode;
}

export function DataTable({
  rows,
  columns,
  emptyLabel = "Nothing here yet.",
  rowKey = "id",
}: {
  rows: Row[];
  columns: Column[];
  emptyLabel?: string;
  rowKey?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-ink-3 py-10 text-center bg-surface-2 rounded-panel">{emptyLabel}</p>;
  }

  return (
    <div className="rounded-panel border border-line overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-3">
            {columns.map((c) => (
              <th key={c.key} className="px-4 py-3 font-medium whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row[rowKey])} className="border-b border-line last:border-0 hover:bg-surface-2">
              {columns.map((c) => (
                <td key={c.key} className="px-4 py-3 text-ink-2 whitespace-nowrap">
                  {c.render ? c.render(row) : fallbackCell(row[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fallbackCell(value: unknown): React.ReactNode {
  if (value == null) return <span className="text-ink-4">—</span>;
  if (value instanceof Date) return value.toLocaleString("en-IN");
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  }
  return String(value);
}

const GOOD = "bg-verified-soft text-verified";
const WARN = "bg-warning-soft text-warning";
const BAD = "bg-danger-soft text-danger";
const MUTED = "bg-surface-3 text-ink-3";

// Every status string either portal can render. A value missing from here is
// not cosmetic: it falls back to MUTED, which is how a FAILED payment used to
// render identically to an AUTHORIZED one.
const TONE: Record<string, string> = {
  // shops / vehicles / models / admins / coupons
  ACTIVE: GOOD,
  VERIFIED: GOOD,
  OPEN: GOOD,
  PENDING: WARN,
  UNVERIFIED: MUTED,
  INACTIVE: MUTED,
  PAUSED: WARN,
  CLOSED: MUTED,
  REJECTED: BAD,
  SUSPENDED: BAD,
  EXPIRED: BAD,
  DELETED: BAD,
  // bookings
  HOLD: WARN,
  CONFIRMED: GOOD,
  COMPLETED: GOOD,
  CANCELLED: BAD,
  // payments / payouts / refunds
  PAID: GOOD,
  SUCCEEDED: GOOD,
  AUTHORIZED: WARN,
  FAILED: BAD,
  // security deposits
  HELD: WARN,
  CLAIMED: WARN,
  RELEASED: GOOD,
  PARTIALLY_DEDUCTED: WARN,
  // tickets
  IN_PROGRESS: WARN,
  RESOLVED: GOOD,
  // payout stages — not statuses, but rendered in the same column position
  UPFRONT: MUTED,
  BALANCE: MUTED,
  CANCELLATION: MUTED,
  DEPOSIT_CLAIM: MUTED,
  // roles, shown as pills by Team/Admins
  OWNER: "bg-amber-soft text-amber-edge",
  MANAGER: MUTED,
  STAFF: MUTED,
  SUPER_ADMIN: "bg-amber-soft text-amber-edge",
  ADMIN: MUTED,
  SUPPORT: MUTED,
};

// Only where the generic enum formatter would read badly. Everything else
// falls through to `enumLabel`.
const LABEL: Record<string, string> = {
  IN_PROGRESS: "In progress",
  PARTIALLY_DEDUCTED: "Partly deducted",
  SUPER_ADMIN: "Super admin",
  DEPOSIT_CLAIM: "Deposit claim",
  UNVERIFIED: "Not verified",
  GSTIN: "GSTIN",
  PAN: "PAN",
  RC: "RC",
  PUC: "PUC",
};

export function StatusPill({ value }: { value: unknown }) {
  const s = String(value ?? "").toUpperCase();
  if (!s) return <span className="text-ink-4">—</span>;
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONE[s] ?? MUTED}`}>
      {LABEL[s] ?? enumLabel(s)}
    </span>
  );
}
