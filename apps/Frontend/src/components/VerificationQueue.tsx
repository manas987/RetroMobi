import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { usePortalSession, portalFetch, handleSessionExpiry, PortalApiError, type Row } from "../lib/portal";
import { DataTable, StatusPill, type Column } from "./DataTable";
import { dateLabel, enumLabel } from "../lib/format";

export type QueueType =
  | "SHOP"
  | "VEHICLE"
  | "VEHICLE_DOCUMENT"
  | "MERCHANT_DOCUMENT"
  | "SHOP_LICENCE"
  | "RIDER_VERIFICATION";

export interface QueueTypeDef {
  value: QueueType;
  label: string;
  decidePath: (id: string) => string;
  approveStatus: string;
  /** False for SHOP and VEHICLE, whose evidence is their documents rather than a file of their own. */
  hasFile: boolean;
  /** The statuses this type can be reviewed in. A licence goes PENDING -> ACTIVE, not -> VERIFIED. */
  decidedStatuses: string[];
  columns: Column[];
  /**
   * Which body field carries the reviewer's words. The five merchant-side
   * decisions call it `note` and treat it as optional; a rider's driving
   * licence calls it `reason` and requires it on BOTH outcomes, because
   * approving one overrides the automated evidence and has to justify itself.
   */
  reasonField?: "note" | "reason";
  reasonRequiredOnApprove?: boolean;
  /** Defaults to the shared `/verification/:type/:id/document` route. */
  filePath?: (id: string) => string;
  /** The column that says whether there is a file at all. */
  fileKeyColumn?: string;
}

function shopColumns(): Column[] {
  return [
    { key: "name", label: "Shop", render: (r) => <span className="text-ink font-medium">{String(r.name)}</span> },
    { key: "city", label: "City" },
    { key: "merchant_name", label: "Owner" },
    { key: "merchant_phone", label: "Phone" },
    { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
  ];
}

function vehicleColumns(): Column[] {
  return [
    {
      key: "registration_number",
      label: "Registration",
      render: (r) => <span className="text-ink font-medium">{String(r.registration_number)}</span>,
    },
    { key: "model", label: "Model", render: (r) => `${String(r.make ?? "")} ${String(r.model ?? "")}` },
    { key: "shop_name", label: "Shop" },
    { key: "merchant_name", label: "Owner" },
    { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
  ];
}

function documentColumns(owner: { key: string; label: string }[]): Column[] {
  return [
    { key: "type", label: "Document", render: (r) => <span className="text-ink font-medium">{enumLabel(r.type)}</span> },
    { key: "document_number", label: "Number" },
    ...owner,
    // `issued_at`/`expires_at` are `date` columns, so the generic cell
    // formatter would print a misleading midnight time.
    { key: "expires_at", label: "Expires", render: (r) => dateLabel(r.expires_at) },
    { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
  ];
}

export const QUEUE_TYPES: Record<QueueType, QueueTypeDef> = {
  SHOP: {
    value: "SHOP",
    label: "Shops",
    decidePath: (id) => `/verification/shops/${id}`,
    approveStatus: "VERIFIED",
    hasFile: false,
    decidedStatuses: ["VERIFIED", "REJECTED"],
    columns: shopColumns(),
  },
  VEHICLE: {
    value: "VEHICLE",
    label: "Vehicles",
    decidePath: (id) => `/verification/vehicles/${id}`,
    approveStatus: "VERIFIED",
    hasFile: false,
    decidedStatuses: ["VERIFIED", "REJECTED"],
    columns: vehicleColumns(),
  },
  VEHICLE_DOCUMENT: {
    value: "VEHICLE_DOCUMENT",
    label: "Vehicle documents",
    decidePath: (id) => `/verification/vehicle-documents/${id}`,
    approveStatus: "VERIFIED",
    hasFile: true,
    decidedStatuses: ["VERIFIED", "REJECTED", "EXPIRED"],
    columns: documentColumns([
      { key: "registration_number", label: "Vehicle" },
      { key: "shop_name", label: "Shop" },
    ]),
  },
  MERCHANT_DOCUMENT: {
    value: "MERCHANT_DOCUMENT",
    label: "Merchant documents",
    decidePath: (id) => `/verification/merchant-documents/${id}`,
    approveStatus: "VERIFIED",
    hasFile: true,
    decidedStatuses: ["VERIFIED", "REJECTED", "EXPIRED"],
    columns: documentColumns([{ key: "merchant_name", label: "Merchant" }]),
  },
  RIDER_VERIFICATION: {
    value: "RIDER_VERIFICATION",
    label: "Rider licences",
    decidePath: (id) => `/verification/rider/${id}/review`,
    approveStatus: "VERIFIED",
    hasFile: true,
    filePath: (id) => `/verification/rider/${id}/photo`,
    fileKeyColumn: "photo_key",
    reasonField: "reason",
    reasonRequiredOnApprove: true,
    // "Pending" here is MANUAL_REVIEW_REQUIRED, which the server supplies as
    // this type's default -- a session's pending state is not called PENDING.
    decidedStatuses: ["VERIFIED", "REJECTED", "PHOTO_PENDING", "DOCUMENT_FAILED", "EXPIRED"],
    columns: riderColumns(),
  },
  SHOP_LICENCE: {
    value: "SHOP_LICENCE",
    label: "Shop licences",
    decidePath: (id) => `/verification/shop-licences/${id}`,
    // A licence is approved into ACTIVE, not VERIFIED — the only type that differs.
    approveStatus: "ACTIVE",
    hasFile: true,
    decidedStatuses: ["ACTIVE", "REJECTED", "EXPIRED"],
    columns: [
      {
        key: "licence_number",
        label: "Licence",
        render: (r) => <span className="text-ink font-medium">{String(r.licence_number)}</span>,
      },
      { key: "issuing_authority", label: "Authority" },
      { key: "merchant_name", label: "Holder" },
      {
        key: "shops",
        label: "Covers",
        render: (r) => {
          const shops = (r.shops ?? []) as { name?: string }[];
          if (!Array.isArray(shops) || shops.length === 0) {
            return <span className="text-ink-4">No branch linked</span>;
          }
          return shops.map((sh) => sh.name).join(", ");
        },
      },
      { key: "expires_at", label: "Expires", render: (r) => dateLabel(r.expires_at) },
      { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
    ],
  },
};

function riderColumns(): Column[] {
  return [
    {
      key: "rider_name",
      label: "Rider",
      render: (r) => <span className="text-ink font-medium">{String(r.rider_name ?? "")}</span>,
    },
    { key: "account_phone", label: "Account" },
    { key: "licence_number_masked", label: "Licence" },
    {
      key: "categories",
      label: "Entitled to",
      render: (r) => {
        const cats = (r.categories ?? []) as { code?: string }[];
        if (!Array.isArray(cats) || cats.length === 0) {
          return <span className="text-warning">No category data</span>;
        }
        return cats.map((c) => c.code).join(", ");
      },
    },
    { key: "licence_expires_on", label: "Expires", render: (r) => dateLabel(r.licence_expires_on) },
    {
      key: "photo_source",
      label: "Photo",
      render: (r) =>
        r.photo_source ? (
          // SELF_UPLOADED is the case where there is nothing to verify the
          // photo against, which is the whole reason this row is in a queue.
          <span className={r.photo_source === "SELF_UPLOADED" ? "text-warning" : undefined}>
            {enumLabel(r.photo_source)}
          </span>
        ) : (
          <span className="text-warning">None</span>
        ),
    },
    {
      key: "__why",
      label: "Why",
      render: (r) => {
        const flags = [
          r.rejection_code ? enumLabel(r.rejection_code) : null,
          Number(r.other_accounts ?? 0) > 0 ? `Also on ${r.other_accounts} other account(s)` : null,
          r.policy_version === "legacy" ? "Verified before the current checks" : null,
        ].filter(Boolean);
        return flags.length ? flags.join(" · ") : <span className="text-ink-4">Flagged</span>;
      },
    },
    { key: "status", label: "State", render: (r) => <StatusPill value={r.status} /> },
  ];
}

export function VerificationQueue({ types }: { types: QueueType[] }) {
  const { session } = usePortalSession("admin");
  const [type, setType] = useState<QueueType>(types[0]!);
  /** Which status to review. `null` is the pending queue — the default job. */
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** The row awaiting a typed reason, and which way it is going. */
  const [deciding, setDeciding] = useState<{ id: string; status: string } | null>(null);
  const [note, setNote] = useState("");

  const active = QUEUE_TYPES[type];
  const isPendingView = reviewStatus === null;

  function load() {
    if (!session) return;
    setRows(null);
    setError(null);
    const query = reviewStatus ? `?type=${type}&status=${reviewStatus}` : `?type=${type}`;
    portalFetch<{ rows: Row[] }>("admin", `/verification/queue${query}`, {
      token: session.accessToken,
    })
      .then((r) => setRows(r.rows))
      .catch((err) => {
        if (handleSessionExpiry("admin", err)) return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
      });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [type, reviewStatus, session?.accessToken]);

  // Reviewing a decided status that this type does not use would always be
  // empty, so the view resets when the type changes.
  useEffect(() => setReviewStatus(null), [type]);

  async function decide(id: string, status: string, reason?: string) {
    if (!session) return;
    setBusyId(id);
    try {
      const field = active.reasonField ?? "note";
      await portalFetch("admin", active.decidePath(id), {
        method: "POST",
        token: session.accessToken,
        body: reason ? { status, [field]: reason } : { status },
      });
      setDeciding(null);
      setNote("");
      load();
    } catch (err) {
      if (!handleSessionExpiry("admin", err)) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      setBusyId(null);
    }
  }

  const columns: Column[] = [
    ...active.columns,
    ...(active.hasFile
      ? [
          {
            key: "__file",
            label: "Document",
            render: (r: Row) => (
              <DocumentLink
                type={type}
                id={String(r.id)}
                path={active.filePath?.(String(r.id))}
                hasKey={r[active.fileKeyColumn ?? "storage_key"] != null}
              />
            ),
          } as Column,
        ]
      : []),
    ...(isPendingView
      ? [
          {
            key: "__actions",
            label: "",
            render: (r: Row) => {
              const id = String(r.id);
              const approving = deciding?.status !== "REJECTED";
              if (deciding?.id === id) {
                return (
                  <span className="inline-flex items-center gap-2">
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={approving ? "Why this is being approved" : "Reason for rejection"}
                      autoFocus
                      className="rounded-row border border-line-strong px-2 py-1 text-xs outline-none focus:border-ink"
                    />
                    <button
                      type="button"
                      // 10 characters, matching the server's own minimum for a
                      // rider review, so "ok" fails here rather than at the API.
                      disabled={busyId === id || note.trim().length < 10}
                      onClick={() => decide(id, deciding.status, note.trim())}
                      className={`text-xs font-medium hover:underline disabled:opacity-40 ${
                        approving ? "text-verified" : "text-danger"
                      }`}
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeciding(null);
                        setNote("");
                      }}
                      className="text-xs text-ink-3 hover:text-ink"
                    >
                      Cancel
                    </button>
                  </span>
                );
              }
              return (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === id}
                    onClick={() => {
                      if (active.reasonRequiredOnApprove) {
                        setDeciding({ id, status: active.approveStatus });
                        setNote("");
                      } else {
                        decide(id, active.approveStatus);
                      }
                    }}
                    className="rounded-row bg-verified-soft text-verified text-xs font-medium px-2.5 py-1 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === id}
                    onClick={() => {
                      setDeciding({ id, status: "REJECTED" });
                      setNote("");
                    }}
                    className="rounded-row bg-danger-soft text-danger text-xs font-medium px-2.5 py-1 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              );
            },
          } as Column,
        ]
      : []),
  ];

  return (
    <div>
      {types.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {types.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                type === t ? "bg-ink text-surface" : "bg-surface border border-line-strong text-ink-2"
              }`}
            >
              {QUEUE_TYPES[t].label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 mb-5">
        <span className="text-xs uppercase tracking-wide text-ink-3 mr-1">Showing</span>
        <ReviewChip label="Pending" active={isPendingView} onClick={() => setReviewStatus(null)} />
        {active.decidedStatuses.map((st) => (
          <ReviewChip
            key={st}
            label={enumLabel(st)}
            active={reviewStatus === st}
            onClick={() => setReviewStatus(st)}
          />
        ))}
      </div>

      {/* A decision is final server-side — there is no un-decide endpoint — so
          say so rather than implying the decided views are editable. */}
      {isPendingView ? (
        <p className="text-xs text-ink-3 mb-3">
          Approving or rejecting is final and cannot be undone. Verification is a trust badge, not a gate: a
          rejected shop stays searchable.
        </p>
      ) : (
        <p className="text-xs text-ink-3 mb-3">Already decided — shown for reference, no further action here.</p>
      )}

      {error && <p className="text-sm text-danger bg-danger-soft rounded-panel px-4 py-3 mb-4">{error}</p>}

      {!error && rows === null ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : rows ? (
        <DataTable
          rows={rows}
          emptyLabel={isPendingView ? "Nothing pending in this queue." : "Nothing decided in this queue yet."}
          columns={columns}
        />
      ) : null}
    </div>
  );
}

function ReviewChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        active ? "bg-ink text-surface" : "bg-surface border border-line-strong text-ink-2"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * The file being judged. Until this existed the decision was made against a
 * row of metadata and a UUID, with no way to look at the actual paper.
 *
 * The URL is fetched on click rather than up front: it is a short-lived
 * presigned GET, and pre-signing one per row on every page load would both
 * waste them and expire the ones nobody opened.
 */
function DocumentLink({
  type,
  id,
  hasKey,
  path,
}: {
  type: QueueType;
  id: string;
  hasKey: boolean;
  /** Overrides the shared document route; a rider's evidence is a photo. */
  path?: string;
}) {
  const { session } = usePortalSession("admin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hasKey) {
    return <span className="text-xs text-warning">No file uploaded</span>;
  }

  async function open() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const { downloadUrl } = await portalFetch<{ downloadUrl: string }>(
        "admin",
        path ?? `/verification/${type}/${id}/document`,
        { token: session.accessToken },
      );
      window.open(downloadUrl, "_blank", "noopener");
    } catch (err) {
      // A 404 here means the row's file is genuinely missing, which is
      // different from the request having failed.
      if (err instanceof PortalApiError && err.status === 404) setError("File is missing from storage.");
      else setError(err instanceof Error ? err.message : "Couldn't open that file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={open}
        className="inline-flex items-center gap-1 text-xs font-medium text-ink hover:underline disabled:opacity-40"
      >
        <FileText className="h-3.5 w-3.5" />
        {busy ? "Opening…" : "View"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
