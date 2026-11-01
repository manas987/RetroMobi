import { useState } from "react";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { portalFetch, usePortalQuery, PortalApiError, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";
import { ErrorBox, SubmitButton, TextField } from "../../components/AuthFormBits";
import { DateField } from "../../components/DateTimeField";
import { dateLabel, enumLabel } from "../../lib/format";
import { uploadFile, UploadFailedError } from "../../lib/upload";
import { Modal } from "../../components/Modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

// `merchant_documents.type` is free text server-side, so this is a convenience
// list rather than the allowed set.
const DOC_TYPES = ["PAN", "GSTIN", "AADHAAR", "BANK_PROOF", "OTHER"];

// `enumLabel` sentence-cases, which turns acronyms into "Pan" and "Gstin".
// Anything not listed here falls through to it unchanged.
const DOC_LABEL: Record<string, string> = { PAN: "PAN", GSTIN: "GSTIN" };

function docLabel(type: unknown): string {
  const key = String(type ?? "").toUpperCase();
  return DOC_LABEL[key] ?? enumLabel(type);
}

function ComplianceBody() {
  const { token } = useMerchantShop();
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  const { data: licences, error: licencesError } = usePortalQuery<{ licences: Row[] }>(
    "merchant",
    `/licences?r=${reloadKey}`,
    token,
  );
  const { data: documents, error: documentsError } = usePortalQuery<{ documents: Row[] }>(
    "merchant",
    `/merchant-documents?r=${reloadKey}`,
    token,
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1">Compliance</h1>
      <p className="text-sm text-ink-3 mb-6">Rent-a-Motorcycle licences and merchant-level documents.</p>

      <h2 className="text-sm font-semibold text-ink mb-3">Licences</h2>
      <AddLicenceForm token={token} onAdded={reload} />
      {licencesError && (
        <div className="mb-8">
          <ErrorBox text={licencesError} />
        </div>
      )}
      {!licencesError && licences === null && <p className="text-sm text-ink-3 mb-8">Loading…</p>}
      {!licencesError && licences && (
        <div className="mb-8">
          <DataTable
            rows={licences.licences}
            emptyLabel="No licences on file yet."
            columns={[
              {
                key: "licence_number",
                label: "Licence number",
                render: (r) => <span className="text-ink font-medium">{String(r.licence_number)}</span>,
              },
              { key: "issuing_authority", label: "Issuing authority" },
              { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
              // `expires_at` is a `date`, so the generic cell formatter would
              // append a meaningless midnight time.
              { key: "expires_at", label: "Expires", render: (r) => dateLabel(r.expires_at) },
              {
                key: "__file",
                label: "File",
                render: (r) => (
                  <FileCell base={`/licences/${r.id}`} hasFile={r.storage_key != null} token={token} onChanged={reload} />
                ),
              },
              {
                key: "__actions",
                label: "",
                render: (r) => (
                  <DeleteButton
                    path={`/licences/${r.id}`}
                    token={token}
                    label="Remove"
                    confirmText={`Remove licence ${String(r.licence_number)}? This does not unlink the branches it covers — those links stay behind.`}
                    onDone={reload}
                  />
                ),
              },
            ]}
          />
        </div>
      )}

      <h2 className="text-sm font-semibold text-ink mb-3">Merchant documents</h2>
      <AddDocumentForm token={token} onAdded={reload} />
      {documentsError && <ErrorBox text={documentsError} />}
      {!documentsError && documents === null && <p className="text-sm text-ink-3">Loading…</p>}
      {!documentsError && documents && (
        <DataTable
          rows={documents.documents}
          emptyLabel="No documents on file yet."
          columns={[
            {
              key: "type",
              label: "Type",
              render: (r) => <span className="text-ink font-medium">{docLabel(r.type)}</span>,
            },
            { key: "document_number", label: "Number" },
            { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            { key: "expires_at", label: "Expires", render: (r) => dateLabel(r.expires_at) },
            {
              key: "__file",
              label: "File",
              render: (r) => (
                <FileCell
                  base={`/merchant-documents/${r.id}`}
                  hasFile={r.storage_key != null}
                  token={token}
                  onChanged={reload}
                />
              ),
            },
            {
              key: "__actions",
              label: "",
              render: (r) => (
                <DeleteButton
                  path={`/merchant-documents/${r.id}`}
                  token={token}
                  label="Remove"
                  confirmText={`Remove this ${docLabel(r.type)} document?`}
                  onDone={reload}
                />
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

/**
 * Whether a row's file exists, a way to open it, and a way to attach one
 * later. Licences and merchant documents share the same `/upload`,
 * `/confirm`, `/download` suffixes under different bases, so one component
 * covers both.
 */
function FileCell({
  base,
  hasFile,
  token,
  onChanged,
}: {
  base: string;
  hasFile: boolean;
  token: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const { downloadUrl } = await portalFetch<{ downloadUrl: string }>("merchant", `${base}/download`, { token });
      window.open(downloadUrl, "_blank", "noopener");
    } catch (err) {
      if (err instanceof PortalApiError && err.status === 404) setError("File is missing from storage.");
      else setError(err instanceof Error ? err.message : "Couldn't open that file.");
    } finally {
      setBusy(false);
    }
  }

  async function attach(file: File) {
    setBusy(true);
    setError(null);
    try {
      await uploadFile({
        portal: "merchant",
        token,
        file,
        presignPath: `${base}/upload`,
        confirmPath: `${base}/confirm`,
      });
      onChanged();
    } catch (err) {
      if (err instanceof UploadFailedError || err instanceof PortalApiError) setError(err.message);
      else setError("Couldn't upload that file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      {hasFile ? (
        <button
          type="button"
          disabled={busy}
          onClick={open}
          className="text-xs font-medium text-ink hover:underline disabled:opacity-40"
        >
          {busy ? "Opening…" : "View"}
        </button>
      ) : (
        <span className="text-xs text-warning">No file</span>
      )}
      <label className="text-xs font-medium text-ink-3 hover:text-ink cursor-pointer">
        {hasFile ? "Replace" : "Attach"}
        <input
          type="file"
          disabled={busy}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) attach(file);
          }}
        />
      </label>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

function DeleteButton({
  path,
  token,
  label,
  confirmText,
  onDone,
}: {
  path: string;
  token: string;
  label: string;
  confirmText: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", path, { method: "DELETE", token });
      onDone();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't remove that.");
      setBusy(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <span className="text-xs text-ink-2 max-w-xs">{confirmText}</span>
        <button
          type="button"
          disabled={busy}
          onClick={go}
          className="text-xs text-danger font-medium hover:underline disabled:opacity-40"
        >
          Confirm
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="text-xs text-ink-3 hover:text-ink">
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-danger">{error}</span>}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-danger font-medium hover:underline"
      >
        {label}
      </button>
    </span>
  );
}

function AddLicenceForm({ token, onAdded }: { token: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [licenceNumber, setLicenceNumber] = useState("");
  const [issuingAuthority, setIssuingAuthority] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidRange = issuedAt !== "" && expiresAt !== "" && expiresAt < issuedAt;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const licence = await portalFetch<Row>("merchant", "/licences", {
        method: "POST",
        token,
        body: {
          licenceNumber,
          issuingAuthority: issuingAuthority || undefined,
          issuedAt: issuedAt || undefined,
          expiresAt: expiresAt || undefined,
        },
      });
      // The licence exists once the POST returns; a failed upload must not
      // read as "the licence was not created", so it is reported separately.
      if (file) {
        await uploadFile({
          portal: "merchant",
          token,
          file,
          presignPath: `/licences/${licence.id}/upload`,
          confirmPath: `/licences/${licence.id}/confirm`,
        });
      }
      setLicenceNumber("");
      setIssuingAuthority("");
      setIssuedAt("");
      setExpiresAt("");
      setFile(null);
      setOpen(false);
      onAdded();
    } catch (err) {
      if (err instanceof UploadFailedError) {
        setError(`Licence saved, but the file didn't upload: ${err.message} Attach it from the table.`);
        onAdded();
        setOpen(false);
      } else {
        setError(err instanceof PortalApiError ? err.message : "Couldn't add that licence.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-ink font-medium hover:underline mb-4 block"
      >
        + Add licence
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Add licence">
        {error && <ErrorBox text={error} />}
        <TextField label="Licence number" value={licenceNumber} onChange={setLicenceNumber} autoFocus />
        <TextField label="Issuing authority (optional)" value={issuingAuthority} onChange={setIssuingAuthority} />
        <div className="grid grid-cols-2 gap-3">
          <DateField label="Issued on" value={issuedAt} onChange={setIssuedAt} fromYear={2000} />
          <DateField label="Expires on" value={expiresAt} onChange={setExpiresAt} fromYear={2000} />
        </div>
        {invalidRange && <p className="text-xs text-danger -mt-2 mb-3">Expiry cannot be before the issue date.</p>}
        <label className="flex flex-col gap-1.5 mb-4">
          <span className="text-xs font-medium text-ink-3">Scan / photo (optional)</span>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
        </label>
        <div className="flex items-center gap-3">
          <SubmitButton busy={busy} disabled={!licenceNumber || invalidRange} onClick={submit}>
            Add licence
          </SubmitButton>
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-ink-3 hover:text-ink">
            Cancel
          </button>
        </div>
      </Modal>
    </>
  );
}

function AddDocumentForm({ token, onAdded }: { token: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(DOC_TYPES[0]!);
  const [documentNumber, setDocumentNumber] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const doc = await portalFetch<Row>("merchant", "/merchant-documents", {
        method: "POST",
        token,
        body: {
          type,
          documentNumber: documentNumber || undefined,
          expiresAt: expiresAt || undefined,
        },
      });
      if (file) {
        await uploadFile({
          portal: "merchant",
          token,
          file,
          presignPath: `/merchant-documents/${doc.id}/upload`,
          confirmPath: `/merchant-documents/${doc.id}/confirm`,
        });
      }
      setDocumentNumber("");
      setExpiresAt("");
      setFile(null);
      setOpen(false);
      onAdded();
    } catch (err) {
      if (err instanceof UploadFailedError) {
        setError(`Document saved, but the file didn't upload: ${err.message} Attach it from the table.`);
        onAdded();
        setOpen(false);
      } else {
        setError(err instanceof PortalApiError ? err.message : "Couldn't add that document.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-ink font-medium hover:underline mb-4 block"
      >
        + Add document
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Add document">
        {error && <ErrorBox text={error} />}
        <label className="flex flex-col gap-1.5 mb-4">
          <span className="text-xs font-medium text-ink-3">Type</span>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOC_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {docLabel(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <TextField label="Document number (optional)" value={documentNumber} onChange={setDocumentNumber} />
        <DateField label="Expires on (optional)" value={expiresAt} onChange={setExpiresAt} fromYear={2000} />
        <label className="flex flex-col gap-1.5 mb-4">
          <span className="text-xs font-medium text-ink-3">Scan / photo (optional)</span>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
        </label>
        <div className="flex items-center gap-3">
          <SubmitButton busy={busy} onClick={submit}>
            Add document
          </SubmitButton>
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-ink-3 hover:text-ink">
            Cancel
          </button>
        </div>
      </Modal>
    </>
  );
}

export function MerchantCompliance() {
  return (
    <MerchantLayout>
      <ComplianceBody />
    </MerchantLayout>
  );
}
