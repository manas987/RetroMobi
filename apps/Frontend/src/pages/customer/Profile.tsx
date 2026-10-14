import { useEffect, useState } from "react";
import { Header } from "../../components/Header";
import { Footer } from "../../components/Footer";
import { usePortalSession, portalFetch, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";

function ProfileBody() {
  const { session } = usePortalSession("user");
  const [riders, setRiders] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!session) return;
    portalFetch<{ riders: Row[] }>("user", "/riders", { token: session.accessToken }).then((r) =>
      setRiders(r.riders),
    );
  }, [session?.accessToken]);

  return (
    <div className="max-w-[900px] w-full mx-auto px-5 py-10 flex-1">
      <h1 className="text-2xl font-semibold text-ink mb-1">Riders & profile</h1>
      <p className="text-sm text-ink-3 mb-6">Everyone verified to ride under this account.</p>

      {riders === null ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : (
        <DataTable
          rows={riders}
          emptyLabel="No riders added yet — you'll add one at checkout."
          columns={[
            { key: "name", label: "Name" },
            { key: "dob", label: "Date of birth" },
          ]}
        />
      )}
    </div>
  );
}

export function CustomerProfile() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <ProfileBody />
      <Footer />
    </div>
  );
}

function SupportBody() {
  const { session } = usePortalSession("user");
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!session) return;
    portalFetch<{ tickets: Row[] }>("user", "/tickets", { token: session.accessToken }).then((r) =>
      setRows(r.tickets),
    );
  }, [session?.accessToken]);

  return (
    <div className="max-w-[900px] w-full mx-auto px-5 py-10 flex-1">
      <h1 className="text-2xl font-semibold text-ink mb-1">Support</h1>
      <p className="text-sm text-ink-3 mb-6">Tickets you've raised about a booking.</p>

      {rows === null ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : (
        <DataTable
          rows={rows}
          emptyLabel="No support tickets yet."
          columns={[
            { key: "category", label: "Category" },
            { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            { key: "created_at", label: "Opened" },
          ]}
        />
      )}
    </div>
  );
}

export function CustomerSupport() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <SupportBody />
      <Footer />
    </div>
  );
}
