import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AdminLayout } from "./Layout";
import { usePortalSession, usePortalQuery, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";
import { enumLabel } from "../../lib/format";

const LIMIT = 25;

const ACTOR_TYPES = ["", "CUSTOMER", "MERCHANT", "ADMIN", "SYSTEM"];

export interface FieldChange {
  key: string;
  before: unknown;
  after: unknown;
}

/**
 * What actually changed, rather than two JSON blobs side by side. A create has
 * no `before` and a delete no `after`, so each is reported as every field
 * appearing or disappearing; an update reports only the keys whose value moved.
 *
 * Values are compared by their JSON form, which is how they arrived — enough
 * to tell a changed field from an untouched one without walking nested shapes.
 */
export function diffRows(before: unknown, after: unknown): FieldChange[] {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort();

  const changes: FieldChange[] = [];
  for (const key of keys) {
    if (JSON.stringify(b[key]) === JSON.stringify(a[key])) continue;
    changes.push({ key, before: b[key], after: a[key] });
  }
  return changes;
}

function AuditBody() {
  const { session } = usePortalSession("admin");
  const [actorType, setActorType] = useState("");
  const [actorId, setActorId] = useState("");
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [page, setPage] = useState(1);

  const query = new URLSearchParams({ limit: String(LIMIT), page: String(page) });
  if (actorType) query.set("actorType", actorType);
  // Both id filters are uuid-validated server-side, so a partial paste would
  // 400 — only sent once it looks like a full uuid.
  if (isUuid(actorId)) query.set("actorId", actorId.trim());
  if (entityType.trim()) query.set("entityType", entityType.trim());
  if (isUuid(entityId)) query.set("entityId", entityId.trim());

  const { data, error } = usePortalQuery<{ auditLogs: Row[] }>(
    "admin",
    `/audit-logs?${query.toString()}`,
    session?.accessToken,
  );
  const rows = data?.auditLogs ?? [];

  const badId = (actorId.trim() !== "" && !isUuid(actorId)) || (entityId.trim() !== "" && !isUuid(entityId));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1">Audit</h1>
      <p className="text-sm text-ink-3 mb-5">
        Every write the platform records: who acted, on what, and what changed. Expand a row for the diff.
      </p>

      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {ACTOR_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setActorType(t);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              actorType === t ? "bg-ink text-surface" : "bg-surface border border-line-strong text-ink-2"
            }`}
          >
            {t === "" ? "All actors" : enumLabel(t)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
        <FilterInput label="Entity type (e.g. coupon)" value={entityType} onChange={(v) => { setEntityType(v); setPage(1); }} />
        <FilterInput label="Entity id" value={entityId} onChange={(v) => { setEntityId(v); setPage(1); }} />
        <FilterInput label="Actor id" value={actorId} onChange={(v) => { setActorId(v); setPage(1); }} />
      </div>
      {badId && <p className="text-xs text-warning mb-3">Ids filter only once a full UUID is entered.</p>}
      {/* This route takes no date range — only actor and entity. */}

      {error && <p className="text-sm text-danger bg-danger-soft rounded-panel px-4 py-3">{error}</p>}
      {!error && data === null && <p className="text-sm text-ink-3">Loading…</p>}
      {!error && data && (
        <>
          <div className="rounded-panel border border-line overflow-hidden">
            {rows.length === 0 ? (
              <p className="text-sm text-ink-3 py-10 text-center bg-surface-2">No audit events match these filters.</p>
            ) : (
              <ul className="divide-y divide-line">
                {rows.map((r) => (
                  <AuditRow key={String(r.id)} row={r} />
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="text-sm text-ink-2 hover:text-ink disabled:opacity-40"
            >
              ← Previous
            </button>
            <span className="text-sm text-ink-3">Page {page}</span>
            <button
              type="button"
              disabled={rows.length < LIMIT}
              onClick={() => setPage(page + 1)}
              className="text-sm text-ink-2 hover:text-ink disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function AuditRow({ row: r }: { row: Row }) {
  const [open, setOpen] = useState(false);
  const changes = diffRows(r.before, r.after);
  const kind = r.before == null ? "Created" : r.after == null ? "Deleted" : "Updated";

  return (
    <li className="bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-surface-2 transition-colors"
      >
        <span className="text-ink-4 mt-0.5 shrink-0">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            {/* Readable, with the raw dotted key kept beside it so the log
                stays greppable against the code that writes it. */}
            <span className="text-sm text-ink font-medium">{actionLabel(r.action)}</span>
            <code className="text-xs text-ink-4">{String(r.action)}</code>
            <StatusPill value={r.actor_type} />
          </span>
          <span className="block text-xs text-ink-3 mt-1">
            {kind} {String(r.entity_type)}
            {r.entity_id ? <> · <span className="font-mono">{String(r.entity_id)}</span></> : null}
            {r.actor_id ? <> · by <span className="font-mono">{String(r.actor_id)}</span></> : <> · no actor recorded</>}
          </span>
        </span>
        <span className="text-xs text-ink-4 shrink-0 whitespace-nowrap">
          {new Date(String(r.created_at)).toLocaleString("en-IN", {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 pl-11">
          {changes.length === 0 ? (
            <p className="text-xs text-ink-3">
              No field-level record for this event — the action was logged without a before/after snapshot.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-ink-3">
                  <th className="font-medium py-1 pr-3">Field</th>
                  <th className="font-medium py-1 pr-3">Before</th>
                  <th className="font-medium py-1">After</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.key} className="border-t border-line align-top">
                    <td className="py-1 pr-3 text-ink-2 font-mono">{c.key}</td>
                    <td className="py-1 pr-3 text-ink-3 break-all">{renderValue(c.before)}</td>
                    <td className="py-1 text-ink break-all">{renderValue(c.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </li>
  );
}

/** "coupon.hard_deleted" -> "Coupon hard deleted" */
function actionLabel(action: unknown): string {
  return enumLabel(String(action ?? "").replace(/\./g, "_"));
}

function renderValue(value: unknown): React.ReactNode {
  if (value === undefined) return <span className="text-ink-4">absent</span>;
  if (value === null) return <span className="text-ink-4">null</span>;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID.test(value.trim());
}

function FilterInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-3">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-row border border-line-strong px-3 py-2 text-sm outline-none focus:border-ink"
      />
    </label>
  );
}

export function AdminAudit() {
  return (
    <AdminLayout>
      <AuditBody />
    </AdminLayout>
  );
}
