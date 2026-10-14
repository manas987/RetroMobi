import type { Row } from "../lib/portal";

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

export function StatusPill({ value }: { value: unknown }) {
  const s = String(value ?? "").toUpperCase();
  const tone: Record<string, string> = {
    ACTIVE: "bg-verified-soft text-verified",
    VERIFIED: "bg-verified-soft text-verified",
    CONFIRMED: "bg-verified-soft text-verified",
    COMPLETED: "bg-verified-soft text-verified",
    PAID: "bg-verified-soft text-verified",
    PENDING: "bg-warning-soft text-warning",
    HOLD: "bg-warning-soft text-warning",
    OPEN: "bg-warning-soft text-warning",
    UNVERIFIED: "bg-surface-3 text-ink-3",
    INACTIVE: "bg-surface-3 text-ink-3",
    REJECTED: "bg-danger-soft text-danger",
    CANCELLED: "bg-danger-soft text-danger",
    SUSPENDED: "bg-danger-soft text-danger",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tone[s] ?? "bg-surface-3 text-ink-3"}`}>
      {s || "—"}
    </span>
  );
}
