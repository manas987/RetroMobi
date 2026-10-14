import { useEffect, useState } from "react";
import { MerchantLayout } from "./Layout";
import { usePortalSession, portalFetch, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";

function ComplianceBody() {
  const { session } = usePortalSession("merchant");
  const [licences, setLicences] = useState<Row[] | null>(null);
  const [documents, setDocuments] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!session) return;
    const token = session.accessToken;
    portalFetch<{ licences: Row[] }>("merchant", "/licences", { token }).then((r) => setLicences(r.licences));
    portalFetch<{ documents: Row[] }>("merchant", "/merchant-documents", { token }).then((r) =>
      setDocuments(r.documents),
    );
  }, [session?.accessToken]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1">Compliance</h1>
      <p className="text-sm text-ink-3 mb-6">Rent-a-Motorcycle licences and merchant-level documents.</p>

      <h2 className="text-sm font-semibold text-ink mb-3">Licences</h2>
      {licences === null ? (
        <p className="text-sm text-ink-3 mb-8">Loading…</p>
      ) : (
        <div className="mb-8">
          <DataTable
            rows={licences}
            emptyLabel="No licences on file yet."
            columns={[
              { key: "licence_number", label: "Licence number" },
              { key: "issuing_authority", label: "Issuing authority" },
              { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
              { key: "expires_at", label: "Expires" },
            ]}
          />
        </div>
      )}

      <h2 className="text-sm font-semibold text-ink mb-3">Merchant documents</h2>
      {documents === null ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : (
        <DataTable
          rows={documents}
          emptyLabel="No documents on file yet."
          columns={[
            { key: "type", label: "Type" },
            { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            { key: "created_at", label: "Uploaded" },
          ]}
        />
      )}
    </div>
  );
}

export function MerchantCompliance() {
  return (
    <MerchantLayout>
      <ComplianceBody />
    </MerchantLayout>
  );
}
