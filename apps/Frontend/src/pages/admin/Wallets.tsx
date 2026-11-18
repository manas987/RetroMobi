import { useState } from "react";
import { AdminLayout } from "./Layout";
import { usePortalQuery, usePortalSession, portalFetch, PortalApiError, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";
import { ErrorBox, SubmitButton, TextField } from "../../components/AuthFormBits";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { dateLabel, rupees } from "../../lib/format";

// Every shop's wallet (Routes/admin/Wallets). Pay a shop directly -- cash at the
// counter, a transfer made outside the platform -- or correct a wallet with a reason.

type WalletRow = {
  shopId: string;
  shopName: string;
  city: string;
  credited: number;
  adjusted: number;
  paidOut: number;
  inFlight: number;
  available: number;
};

function WalletsBody() {
  const { session } = usePortalSession("admin");
  const token = session?.accessToken;
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<WalletRow | null>(null);
  const { data, error } = usePortalQuery<{ wallets: WalletRow[] }>("admin", token ? `/wallets?r=${reloadKey}` : null, token);
  const reload = () => setReloadKey((k) => k + 1);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1">Shop wallets</h1>
      <p className="text-sm text-ink-3 mb-5">
        Every online booking credits its shop's wallet. Money leaves through withdrawals the shop asks for, or a
        payment you record here.
      </p>
      {error && <ErrorBox text={error} />}
      {!error && data === null && <p className="text-sm text-ink-3">Loading…</p>}
      {!error && data && (
        <DataTable
          rows={data.wallets as unknown as Row[]}
          emptyLabel="No shops yet."
          columns={[
            { key: "shopName", label: "Shop", render: (r) => <span className="text-ink font-medium">{String(r.shopName)}</span> },
            { key: "city", label: "City", render: (r) => String(r.city ?? "") },
            { key: "credited", label: "Earned", render: (r) => <span className="tabular-nums">{rupees(Number(r.credited) + Number(r.adjusted))}</span> },
            { key: "paidOut", label: "Paid out", render: (r) => <span className="tabular-nums">{rupees(Number(r.paidOut))}</span> },
            { key: "inFlight", label: "Being paid", render: (r) => <span className="tabular-nums">{rupees(Number(r.inFlight))}</span> },
            { key: "available", label: "Balance", render: (r) => <span className="tabular-nums font-semibold text-ink">{rupees(Number(r.available))}</span> },
            {
              key: "__open",
              label: "",
              render: (r) => (
                <button type="button" onClick={() => setSelected(r as unknown as WalletRow)} className="text-xs font-medium text-ink hover:underline">
                  Open
                </button>
              ),
            },
          ]}
        />
      )}
      {selected && token && (
        <ShopWallet
          key={selected.shopId}
          shop={selected}
          token={token}
          onChanged={reload}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function ShopWallet({ shop, token, onChanged, onClose }: { shop: WalletRow; token: string; onChanged: () => void; onClose: () => void }) {
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error } = usePortalQuery<Row>("admin", `/wallets/${shop.shopId}?r=${reloadKey}`, token);
  const changed = () => {
    setReloadKey((k) => k + 1);
    onChanged();
  };

  return (
    <div className="mt-8 rounded-panel border border-line p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">{shop.shopName}</h2>
          {data && <p className="text-sm text-ink-3">Balance {rupees(Number(data.available))}</p>}
        </div>
        <button type="button" onClick={onClose} className="text-sm text-ink-3 hover:text-ink">Close</button>
      </div>
      {error && <ErrorBox text={error} />}
      <div className="grid gap-5 lg:grid-cols-2 mb-6">
        <PayShopForm shopId={shop.shopId} token={token} onDone={changed} />
        <AdjustForm shopId={shop.shopId} token={token} onDone={changed} />
      </div>
      {data && (
        <div className="grid gap-6">
          <section>
            <h3 className="text-sm font-semibold text-ink mb-2">Withdrawals and payments</h3>
            <DataTable
              rows={(data.withdrawals as Row[]) ?? []}
              emptyLabel="None yet."
              columns={[
                { key: "created_at", label: "Date", render: (r) => dateLabel(r.created_at) },
                { key: "amount", label: "Amount", render: (r) => rupees(Number(r.amount)) },
                { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
                { key: "method", label: "Via", render: (r) => `${String(r.method ?? "")}${r.reference ? ` · ${String(r.reference)}` : ""}` },
                { key: "requested_by", label: "Asked by", render: (r) => (r.requested_by ? "Shop" : "Admin") },
              ]}
            />
          </section>
          <section>
            <h3 className="text-sm font-semibold text-ink mb-2">Adjustments</h3>
            <DataTable
              rows={(data.adjustments as Row[]) ?? []}
              emptyLabel="None."
              columns={[
                { key: "created_at", label: "Date", render: (r) => dateLabel(r.created_at) },
                { key: "amount", label: "Amount", render: (r) => `${Number(r.amount) > 0 ? "+" : "−"}${rupees(Math.abs(Number(r.amount)))}` },
                { key: "reason", label: "Reason", render: (r) => String(r.reason) },
              ]}
            />
          </section>
          <section>
            <h3 className="text-sm font-semibold text-ink mb-2">Earnings by booking</h3>
            <DataTable
              rows={(data.credits as Row[]) ?? []}
              emptyLabel="No earnings yet."
              columns={[
                { key: "created_at", label: "Date", render: (r) => dateLabel(r.created_at) },
                { key: "booking_id", label: "Booking", render: (r) => `#${String(r.booking_id).slice(0, 8).toUpperCase()}` },
                { key: "stage", label: "Stage", render: (r) => String(r.stage) },
                { key: "amount", label: "Amount", render: (r) => rupees(Number(r.amount)) },
                {
                  key: "coupon_code",
                  label: "Coupon",
                  render: (r) =>
                    r.coupon_code ? `${String(r.coupon_code)} (${r.coupon_funded_by === "SHOP" ? "shop pays" : "RetroMobi pays"})` : "",
                },
              ]}
            />
          </section>
        </div>
      )}
    </div>
  );
}

const METHODS = [
  ["CASH", "Cash"],
  ["UPI", "UPI (sent outside the platform)"],
  ["BANK_TRANSFER", "Bank transfer (sent outside the platform)"],
  ["OTHER", "Other"],
  ["CASHFREE_PAYOUT", "Cashfree Payouts (to their verified bank account)"],
] as const;

function PayShopForm({ shopId, token, onDone }: { shopId: string; token: string; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offline = method !== "CASHFREE_PAYOUT";

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("admin", `/wallets/${shopId}/payouts`, {
        method: "POST",
        token,
        body: {
          amount: Math.round(Number(amount) * 100),
          method,
          ...(offline ? { reference: reference.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      setAmount("");
      setReference("");
      setNote("");
      onDone();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't record that payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-panel border border-line p-4">
      <h3 className="text-sm font-semibold text-ink mb-3">Pay this shop</h3>
      {error && <ErrorBox text={error} />}
      <TextField label="Amount (₹)" type="number" value={amount} onChange={setAmount} />
      <label className="flex flex-col gap-1.5 mb-4">
        <span className="text-xs font-medium text-ink-3">How</span>
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {METHODS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
      </label>
      {offline && <TextField label="Reference (UTR, UPI ref or receipt no.)" value={reference} onChange={setReference} />}
      <TextField label="Note (optional)" value={note} onChange={setNote} />
      <SubmitButton busy={busy} disabled={!(Number(amount) > 0) || (offline && reference.trim().length < 3)} onClick={submit}>
        {offline ? "Record payment" : "Send through Cashfree"}
      </SubmitButton>
    </div>
  );
}

function AdjustForm({ shopId, token, onDone }: { shopId: string; token: string; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const paise = Math.round(Number(amount) * 100);
    try {
      await portalFetch("admin", `/wallets/${shopId}/adjustments`, {
        method: "POST",
        token,
        body: { amount: direction === "credit" ? paise : -paise, reason: reason.trim() },
      });
      setAmount("");
      setReason("");
      onDone();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't save that adjustment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-panel border border-line p-4">
      <h3 className="text-sm font-semibold text-ink mb-3">Adjust balance</h3>
      {error && <ErrorBox text={error} />}
      <label className="flex flex-col gap-1.5 mb-4">
        <span className="text-xs font-medium text-ink-3">Direction</span>
        <Select value={direction} onValueChange={(v) => setDirection(v as "credit" | "debit")}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="credit">Add to the wallet</SelectItem>
            <SelectItem value="debit">Take from the wallet</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <TextField label="Amount (₹)" type="number" value={amount} onChange={setAmount} />
      <TextField label="Reason (the shop sees this)" value={reason} onChange={setReason} />
      <SubmitButton busy={busy} disabled={!(Number(amount) > 0) || reason.trim().length < 3} onClick={submit}>
        Save adjustment
      </SubmitButton>
    </div>
  );
}

export function AdminWallets() {
  return (
    <AdminLayout>
      <WalletsBody />
    </AdminLayout>
  );
}
