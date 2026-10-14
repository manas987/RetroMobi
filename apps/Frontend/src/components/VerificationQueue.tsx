import { useEffect, useState } from "react";
import { usePortalSession, portalFetch, type Row } from "../lib/portal";
import { DataTable } from "./DataTable";

export type QueueType = "SHOP" | "VEHICLE" | "VEHICLE_DOCUMENT" | "MERCHANT_DOCUMENT" | "SHOP_LICENCE";

export interface QueueTypeDef {
  value: QueueType;
  label: string;
  decidePath: (id: string) => string;
  approveStatus: string;
}

export const QUEUE_TYPES: Record<QueueType, QueueTypeDef> = {
  SHOP: { value: "SHOP", label: "Shops", decidePath: (id) => `/verification/shops/${id}`, approveStatus: "VERIFIED" },
  VEHICLE: {
    value: "VEHICLE",
    label: "Vehicles",
    decidePath: (id) => `/verification/vehicles/${id}`,
    approveStatus: "VERIFIED",
  },
  VEHICLE_DOCUMENT: {
    value: "VEHICLE_DOCUMENT",
    label: "Vehicle documents",
    decidePath: (id) => `/verification/vehicle-documents/${id}`,
    approveStatus: "VERIFIED",
  },
  MERCHANT_DOCUMENT: {
    value: "MERCHANT_DOCUMENT",
    label: "Merchant documents",
    decidePath: (id) => `/verification/merchant-documents/${id}`,
    approveStatus: "VERIFIED",
  },
  SHOP_LICENCE: {
    value: "SHOP_LICENCE",
    label: "Shop licences",
    decidePath: (id) => `/verification/shop-licences/${id}`,
    approveStatus: "ACTIVE",
  },
};

export function VerificationQueue({ types }: { types: QueueType[] }) {
  const { session } = usePortalSession("admin");
  const [type, setType] = useState<QueueType>(types[0]!);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const active = QUEUE_TYPES[type];

  function load() {
    if (!session) return;
    setRows(null);
    portalFetch<{ rows: Row[] }>("admin", `/verification/queue?type=${type}`, {
      token: session.accessToken,
    }).then((r) => setRows(r.rows));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [type, session?.accessToken]);

  async function decide(id: string, status: string) {
    if (!session) return;
    setBusyId(id);
    try {
      await portalFetch("admin", active.decidePath(id), {
        method: "POST",
        token: session.accessToken,
        body: { status },
      });
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {types.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
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

      {rows === null ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : (
        <DataTable
          rows={rows}
          emptyLabel="Nothing pending in this queue."
          columns={[
            ...Object.keys(rows[0] ?? {})
              .filter((k) => k !== "id")
              .map((k) => ({ key: k, label: k.replace(/_/g, " ") })),
            {
              key: "__actions",
              label: "",
              render: (r) => (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => decide(String(r.id), active.approveStatus)}
                    className="rounded-row bg-verified-soft text-verified text-xs font-medium px-2.5 py-1 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => decide(String(r.id), "REJECTED")}
                    className="rounded-row bg-danger-soft text-danger text-xs font-medium px-2.5 py-1 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
