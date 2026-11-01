import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AdminLayout } from "./Layout";
import { usePortalSession, usePortalQuery, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";
import { ErrorBox, TextField } from "../../components/AuthFormBits";
import { dateLabel } from "../../lib/format";

/**
 * Looking a merchant up. `GET /merchants` and `GET /merchants/:id` both
 * existed with no page to reach them from — the Overview fetched the list
 * only to count it and threw the rows away, so an admin had no way to find
 * one account.
 */
function MerchantsBody() {
  const { session } = usePortalSession("admin");
  const token = session?.accessToken;
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The server matches `name` and `phone` only — not email — so say so
  // rather than letting an email search look broken.
  const params = new URLSearchParams({ limit: "50" });
  if (q.trim()) params.set("q", q.trim());

  const { data, error } = usePortalQuery<{ merchants: Row[] }>(
    "admin",
    token ? `/merchants?${params.toString()}` : null,
    token,
  );

  if (selectedId && token) {
    return <MerchantDetail merchantId={selectedId} token={token} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1">Merchants</h1>
      <p className="text-sm text-ink-3 mb-5">Every shop-owning account on the platform.</p>

      <div className="w-72 mb-1">
        <TextField label="Search by name or phone" value={q} onChange={setQ} />
      </div>

      {error && <ErrorBox text={error} />}
      {!error && data === null && <p className="text-sm text-ink-3">Loading…</p>}
      {!error && data && (
        <DataTable
          rows={data.merchants}
          emptyLabel={q ? "No merchant matches that name or phone." : "No merchants yet."}
          columns={[
            {
              key: "name",
              label: "Name",
              render: (r) =>
                r.name ? (
                  <span className="text-ink font-medium">{String(r.name)}</span>
                ) : (
                  <span className="text-ink-4">Not set</span>
                ),
            },
            { key: "phone", label: "Phone" },
            { key: "email", label: "Email" },
            { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            { key: "created_at", label: "Joined", render: (r) => dateLabel(r.created_at) },
            {
              key: "__open",
              label: "",
              render: (r) => (
                <button
                  type="button"
                  onClick={() => setSelectedId(String(r.id))}
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

function MerchantDetail({
  merchantId,
  token,
  onBack,
}: {
  merchantId: string;
  token: string;
  onBack: () => void;
}) {
  // The response is the merchant row spread flat with a nested `shops` array,
  // not wrapped in a `merchant` key.
  const { data, error } = usePortalQuery<Row & { shops?: Row[] }>(
    "admin",
    `/merchants/${merchantId}`,
    token,
  );

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All merchants
      </button>

      {error && <ErrorBox text={error} />}
      {!error && data === null && <p className="text-sm text-ink-3">Loading…</p>}

      {data && (
        <>
          <div className="flex items-start justify-between gap-4 mb-1">
            <h1 className="text-xl font-semibold text-ink">{String(data.name ?? "Unnamed merchant")}</h1>
            <StatusPill value={data.status} />
          </div>
          <p className="text-sm text-ink-3 mb-5">
            {String(data.phone ?? "")}
            {data.email ? ` · ${String(data.email)}` : ""}
            {data.created_at ? ` · joined ${dateLabel(data.created_at)}` : ""}
          </p>

          <h2 className="text-sm font-semibold text-ink mb-2">Branches</h2>
          <DataTable
            rows={data.shops ?? []}
            emptyLabel="This merchant has no shops."
            columns={[
              { key: "name", label: "Shop", render: (r) => <span className="text-ink font-medium">{String(r.name)}</span> },
              { key: "city", label: "City" },
              {
                key: "verification_status",
                label: "Verification",
                render: (r) => <StatusPill value={r.verification_status} />,
              },
            ]}
          />

          {/* Said rather than linked: the drill-down returns the merchant and
              their shops only — no vehicles, bookings, payouts or licences. */}
          <p className="text-xs text-ink-4 mt-3">
            Vehicles, bookings and payouts are not part of this record — find them by shop under Booking ops
            and Payments.
          </p>
        </>
      )}
    </div>
  );
}

export function AdminMerchants() {
  return (
    <AdminLayout>
      <MerchantsBody />
    </AdminLayout>
  );
}
