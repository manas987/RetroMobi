import { useEffect, useState } from "react";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { usePortalQuery, portalFetch, PortalApiError, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";
import { ErrorBox, SubmitButton, TextField } from "../../components/AuthFormBits";
import { DateField } from "../../components/DateTimeField";
import { Modal } from "../../components/Modal";
import { rupees } from "../../lib/format";

/** `/payouts` and `/shops/:id/payouts` answer different questions and are not
 *  subsets of each other, so the page asks which one you want rather than
 *  implying a filter. */
type Scope = "mine" | "shop";

function PayoutsBody() {
  const { token, shopId, shops, can } = useMerchantShop();
  const [reloadKey, setReloadKey] = useState(0);
  const [scope, setScope] = useState<Scope>("mine");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const canReadShop = can("payouts:read");
  const effectiveScope: Scope = canReadShop ? scope : "mine";

  const query = new URLSearchParams({ r: String(reloadKey) });
  if (status) query.set("status", status);
  // `z.coerce.date()` takes anything `new Date()` takes, so a date-only string
  // is sent as a full ISO instant rather than left ambiguous.
  if (from) query.set("from", new Date(`${from}T00:00:00`).toISOString());
  if (to) query.set("to", new Date(`${to}T23:59:59`).toISOString());

  const path =
    effectiveScope === "shop" && shopId
      ? `/shops/${shopId}/payouts?${query}`
      : `/payouts?${query}`;

  const { data: payouts, error } = usePortalQuery<{ payouts: Row[] }>("merchant", path, token);
  const accountState = usePayoutAccount(token, reloadKey);

  const rows = payouts?.payouts ?? [];
  const pendingTotal = rows
    .filter((p) => p.status === "PENDING")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const shopName = shops.find((s) => String(s.id) === shopId)?.name;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1">Payouts</h1>
      <p className="text-sm text-ink-3 mb-6">What RetroMobi owes you, and where it gets sent.</p>

      <PayoutAccountCard
        token={token}
        state={accountState}
        onChanged={() => setReloadKey((k) => k + 1)}
      />

      {canReadShop && (
        <div className="flex gap-1.5 mt-6">
          <ScopeChip
            label="Owed to me"
            hint="Across every shop you're a member of"
            active={effectiveScope === "mine"}
            onClick={() => setScope("mine")}
          />
          <ScopeChip
            label={shopName ? `${String(shopName)}'s bookings` : "This shop's bookings"}
            hint="Every payout for this shop, whoever is paid"
            active={effectiveScope === "shop"}
            onClick={() => setScope("shop")}
          />
        </div>
      )}

      <p className="text-xs text-ink-3 mt-2">
        {effectiveScope === "mine"
          ? "Payouts owed to your account, across every shop you belong to."
          : "Every payout arising from this shop's bookings — including any paid to a different member."}
      </p>

      <div className="flex flex-wrap items-end gap-3 mt-5">
        <div className="flex gap-1.5 mb-4">
          {["", "PENDING", "PAID", "FAILED"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                status === s ? "bg-ink text-surface" : "bg-surface border border-line-strong text-ink-2"
              }`}
            >
              {s === "" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <div className="w-40">
          <DateField label="From" value={from} onChange={setFrom} fromYear={2024} />
        </div>
        <div className="w-40">
          <DateField label="To" value={to} onChange={setTo} fromYear={2024} />
        </div>
      </div>

      {rows.length > 0 && (
        <p className="text-sm text-ink-2 mb-3">
          Pending: <span className="tnum font-semibold text-ink">{rupees(pendingTotal)}</span>
          <span className="text-ink-3"> across {rows.filter((p) => p.status === "PENDING").length} payout(s)</span>
        </p>
      )}

      {error && <ErrorBox text={error} />}
      {!error && payouts === null && <p className="text-sm text-ink-3">Loading…</p>}
      {!error && payouts && (
        <DataTable
          rows={rows}
          emptyLabel="No payouts recorded yet — these are created once a booking is confirmed."
          columns={[
            { key: "stage", label: "Stage", render: (r) => <StatusPill value={r.stage} /> },
            {
              key: "booking_id",
              label: "Booking",
              render: (r) =>
                r.booking_id ? (
                  <span className="text-xs text-ink-3 font-mono">{String(r.booking_id).slice(0, 8)}</span>
                ) : (
                  <span className="text-ink-4">—</span>
                ),
            },
            // bigint arrives as a JSON string, so Number() before formatting.
            { key: "amount", label: "Amount", render: (r) => <span className="tnum">{rupees(Number(r.amount))}</span> },
            { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            { key: "created_at", label: "Created" },
            { key: "paid_at", label: "Paid" },
          ]}
        />
      )}
    </div>
  );
}

type AccountState =
  | { status: "loading" }
  | { status: "ready"; account: Row | null }
  | { status: "failed"; message: string };

/**
 * `GET /payout-account` answers literal `null` for a merchant with no account,
 * and `usePortalQuery` uses `null` as its own "not loaded yet" value — so
 * through that hook the two states are indistinguishable, which is why the red
 * "No payout account on file" warning used to flash on every load. Fetched
 * directly so the three states stay separate, same as `PricingTab` does.
 */
function usePayoutAccount(token: string, reloadKey: number): AccountState {
  const [state, setState] = useState<AccountState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    portalFetch<Row | null>("merchant", "/payout-account", { token })
      .then((account) => {
        if (!cancelled) setState({ status: "ready", account: account ?? null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          status: "failed",
          message: err instanceof Error ? err.message : "Couldn't load your payout account.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  return state;
}

function ScopeChip({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={hint}
      className={`rounded-full px-3 py-1.5 text-sm font-medium ${
        active ? "bg-ink text-surface" : "bg-surface border border-line-strong text-ink-2"
      }`}
    >
      {label}
    </button>
  );
}

/** The server only ever stores the last four digits (migration 0017), so this
 *  is a display shape, not a masking step -- there is nothing to hide. */
function maskedAccount(account: Row): string {
  const last4 = String(account.account_last4 ?? "");
  if (!last4) return String(account.provider_account_ref ?? "—");
  return `•••• ${last4}${account.ifsc ? ` · ${String(account.ifsc)}` : ""}`;
}

function PayoutAccountCard({
  token,
  state,
  onChanged,
}: {
  token: string;
  state: AccountState;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [holderName, setHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const complete = holderName.trim().length >= 3 && accountNumber.trim() && ifsc.trim().length === 11;

  async function save() {
    setBusy(true);
    setSaveError(null);
    try {
      // The account number is sent once, to register the beneficiary with
      // Cashfree, and is not stored afterwards -- only the last four, the IFSC
      // and the beneficiary id come back.
      await portalFetch("merchant", "/payout-account", {
        method: "PUT",
        token,
        body: {
          holderName: holderName.trim(),
          accountNumber: accountNumber.trim(),
          ifsc: ifsc.trim().toUpperCase(),
        },
      });
      setEditing(false);
      setHolderName("");
      setAccountNumber("");
      setIfsc("");
      onChanged();
    } catch (err) {
      setSaveError(err instanceof PortalApiError ? err.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-panel border border-line p-5 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">Payout account</p>

        {/* Three distinct states. Treating "still loading" as "none on file"
            flashed the red warning at every merchant on every page load, and a
            failed fetch was indistinguishable from genuinely having none. */}
        {state.status === "loading" ? (
          <p className="text-sm text-ink-3 mt-0.5">Loading…</p>
        ) : state.status === "failed" ? (
          <p className="text-sm text-danger mt-0.5">Couldn't load your payout account: {state.message}</p>
        ) : state.account ? (
          <>
            <p className="text-sm text-ink-3 mt-0.5 flex items-center gap-2">
              <span className="font-mono">{maskedAccount(state.account)}</span>
              <StatusPill value={state.account.status} />
            </p>
            {state.account.status !== "VERIFIED" && (
              <p className="text-xs text-warning mt-1">
                {state.account.status === "PENDING"
                  ? "Cashfree is still checking this account. Payouts wait until it's verified."
                  : "Cashfree rejected this account, so payouts can't be paid out. Replace it below."}
                {state.account.last_error ? ` (${String(state.account.last_error)})` : ""}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-danger mt-0.5">
            No payout account on file — payouts will accrue but can't be paid out.
          </p>
        )}
      </div>

      {state.status === "ready" && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-sm text-ink font-medium hover:underline shrink-0"
        >
          {state.account ? "Replace" : "Add account"}
        </button>
      )}

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title={state.status === "ready" && state.account ? "Replace payout account" : "Add payout account"}
      >
        {saveError && <ErrorBox text={saveError} />}
        <TextField label="Account holder name" value={holderName} onChange={setHolderName} autoFocus />
        <TextField label="Bank account number" value={accountNumber} onChange={setAccountNumber} />
        <TextField label="IFSC" value={ifsc} onChange={setIfsc} />
        <p className="text-xs text-ink-4 mb-3">
          We pass these to Cashfree once to register the account, then keep only the last four digits
          and the IFSC. Payouts start once Cashfree verifies it.
        </p>
        <div className="flex items-center gap-3">
          <SubmitButton busy={busy} disabled={!complete} onClick={save}>
            Save
          </SubmitButton>
          <button type="button" onClick={() => setEditing(false)} className="text-sm text-ink-3 hover:text-ink">
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}

export function MerchantPayouts() {
  return (
    <MerchantLayout>
      <PayoutsBody />
    </MerchantLayout>
  );
}
