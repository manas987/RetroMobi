import { useState } from "react";
import { AdminLayout } from "./Layout";
import { usePortalQuery, usePortalSession, portalFetch, PortalApiError, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";
import { ErrorBox, SubmitButton, TextField } from "../../components/AuthFormBits";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { dateLabel, enumLabel, rupees } from "../../lib/format";

function CouponsBody() {
  const { session } = usePortalSession("admin");
  const token = session?.accessToken;
  const [reloadKey, setReloadKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const { data, error } = usePortalQuery<{ coupons: Row[] }>("admin", token ? `/coupons?r=${reloadKey}` : null, token);
  const reload = () => setReloadKey((k) => k + 1);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-semibold text-ink">Coupons</h1>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="text-sm text-ink font-medium hover:underline shrink-0">
            + New coupon
          </button>
        )}
      </div>
      <p className="text-sm text-ink-3 mb-5">
        Discount codes applied at checkout. A platform-funded coupon is paid by RetroMobi (the shop is still credited
        its full price); a shop-funded one comes off that shop's earnings. Shops create their own from the merchant
        portal. Rules and limits are fixed at creation: to change them, pause this code and create a replacement.
      </p>

      {adding && <AddCouponForm token={token!} onCreated={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} />}

      {error && <ErrorBox text={error} />}
      {!error && data === null && <p className="text-sm text-ink-3">Loading…</p>}
      {!error && data && (
        <DataTable
          rows={data.coupons}
          emptyLabel="No coupons yet."
          columns={[
            { key: "code", label: "Code", render: (r) => <span className="text-ink font-medium">{String(r.code)}</span> },
            { key: "type", label: "Type", render: (r) => enumLabel(r.type) },
            { key: "funded_by", label: "Paid by", render: (r) => (r.funded_by === "SHOP" ? "Shop" : "RetroMobi") },
            { key: "value", label: "Value", render: (r) => (r.type === "PERCENT" ? `${r.value}%` : rupees(Number(r.value))) },
            {
              key: "used_count",
              label: "Used",
              // `max_uses` was fetched and never shown, so "3" had no denominator.
              render: (r) => (
                <span className="tabular-nums">
                  {String(r.used_count ?? 0)}
                  {r.max_uses != null ? ` / ${String(r.max_uses)}` : " / ∞"}
                </span>
              ),
            },
            { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            // valid_until is a timestamptz but means a day, so the generic
            // formatter printed a time nobody set under a header reading
            // "Expires".
            { key: "valid_until", label: "Expires", render: (r) => dateLabel(r.valid_until) },
            {
              key: "__actions",
              label: "",
              render: (r) => <CouponRowActions coupon={r} token={token!} onChanged={reload} />,
            },
          ]}
        />
      )}
    </div>
  );
}

function CouponRowActions({ coupon: c, token, onChanged }: { coupon: Row; token: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const active = c.status === "ACTIVE";

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("admin", `/coupons/${c.id}`, { method: "PATCH", token, body: { status: active ? "PAUSED" : "ACTIVE" } });
      onChanged();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't update that.");
      setBusy(false);
    }
  }

  /**
   * Soft keeps the row, so the code stays taken against the unique index on
   * `coupons.code` and every booking that used it keeps its reference. Hard
   * frees the code, but `booking_groups.coupon_id` is ON DELETE SET NULL, so
   * those bookings silently lose which coupon they used — and the server only
   * permits it while `used_count` is 0.
   */
  async function remove(hard: boolean) {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("admin", `/coupons/${c.id}${hard ? "/hard" : ""}`, { method: "DELETE", token });
      onChanged();
    } catch (err) {
      if (err instanceof PortalApiError && err.status === 409) {
        setError("Already used by a booking — pause or soft-delete it instead.");
      } else {
        setError(err instanceof PortalApiError ? err.message : "Couldn't remove that.");
      }
      setBusy(false);
      setConfirming(false);
    }
  }

  const used = Number(c.used_count ?? 0) > 0;

  if (confirming) {
    return (
      <div className="flex flex-col gap-1.5 text-xs">
        {error && <span className="text-danger">{error}</span>}
        <button
          type="button"
          disabled={busy}
          onClick={() => remove(false)}
          className="text-left text-danger font-medium hover:underline disabled:opacity-40"
        >
          Hide it — keeps the history, code stays reserved
        </button>
        {used ? (
          <span className="text-ink-4">Can't purge: already used by a booking.</span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => remove(true)}
            className="text-left text-danger font-medium hover:underline disabled:opacity-40"
          >
            Purge it — frees the code to reuse, erases it from any booking
          </button>
        )}
        <button type="button" onClick={() => setConfirming(false)} className="text-left text-ink-3 hover:text-ink">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      {error && <span className="text-xs text-danger">{error}</span>}
      <button type="button" disabled={busy} onClick={toggle} className="text-xs font-medium text-ink hover:underline disabled:opacity-40">
        {active ? "Pause" : "Activate"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => setConfirming(true)}
        className="text-xs text-danger font-medium hover:underline disabled:opacity-40"
      >
        Remove
      </button>
    </div>
  );
}

const num = (text: string) => (text.trim() ? Number(text) : undefined);

function AddCouponForm({ token, onCreated, onCancel }: { token: string; onCreated: () => void; onCancel: () => void }) {
  const [code, setCode] = useState("");
  const [type, setType] = useState<"PERCENT" | "FLAT">("PERCENT");
  const [value, setValue] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [description, setDescription] = useState("");
  const [fundedBy, setFundedBy] = useState<"PLATFORM" | "SHOP">("PLATFORM");
  const [shopIds, setShopIds] = useState<string[]>([]);
  const [shopFilter, setShopFilter] = useState("");
  // The wallets list doubles as the shop directory (Routes/admin/Wallets).
  const { data: shopsData } = usePortalQuery<{ wallets: Array<{ shopId: string; shopName: string; city: string }> }>(
    "admin",
    "/wallets",
    token,
  );
  const shops = (shopsData?.wallets ?? []).filter((s) =>
    `${s.shopName} ${s.city}`.toLowerCase().includes(shopFilter.trim().toLowerCase()),
  );
  const toggleShop = (id: string) =>
    setShopIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const [maxDiscount, setMaxDiscount] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [perUser, setPerUser] = useState("");
  const [perShop, setPerShop] = useState("");
  const [firstBookingOnly, setFirstBookingOnly] = useState(false);
  const [minRentals, setMinRentals] = useState("");
  const [maxRentals, setMaxRentals] = useState("");
  const [minDays, setMinDays] = useState("");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [birthday, setBirthday] = useState("");
  const [newUserDays, setNewUserDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("admin", "/coupons", {
        method: "POST",
        token,
        body: {
          code: code.toUpperCase(),
          type,
          value: type === "PERCENT" ? Number(value) : Math.round(Number(value) * 100),
          validFrom: new Date().toISOString(),
          validUntil: new Date(validUntil).toISOString(),
          maxUses: maxUses ? Number(maxUses) : undefined,
          description: description.trim() || undefined,
          fundedBy,
          shopIds: shopIds.length ? shopIds : undefined,
          maxDiscount: maxDiscount ? Math.round(Number(maxDiscount) * 100) : undefined,
          minOrderAmount: minOrder ? Math.round(Number(minOrder) * 100) : undefined,
          perUserLimit: num(perUser),
          perShopLimit: num(perShop),
          conditions: Object.fromEntries(
            Object.entries({
              firstBookingOnly: firstBookingOnly || undefined,
              minCompletedRentals: num(minRentals),
              maxCompletedRentals: num(maxRentals),
              minRentalDays: num(minDays),
              minRiderAge: num(minAge),
              maxRiderAge: num(maxAge),
              birthdayWindowDays: num(birthday),
              newUserWithinDays: num(newUserDays),
            }).filter(([, v]) => v !== undefined),
          ),
        },
      });
      onCreated();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't create that coupon.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-panel border border-line p-5 mb-5 max-w-md">
      {error && <ErrorBox text={error} />}
      <TextField label="Code" value={code} onChange={setCode} autoFocus />
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 mb-4">
          <span className="text-xs font-medium text-ink-3">Type</span>
          <Select value={type} onValueChange={(v) => setType(v as "PERCENT" | "FLAT")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PERCENT">Percent off</SelectItem>
              <SelectItem value="FLAT">Flat amount (₹)</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <TextField label={type === "PERCENT" ? "Percent (0-100)" : "Amount (₹)"} type="number" value={value} onChange={setValue} />
      </div>
      <TextField label="Valid until" type="date" value={validUntil} onChange={setValidUntil} />
      <TextField label="Max uses (optional)" type="number" value={maxUses} onChange={setMaxUses} />
      <TextField label="Shown to customers (optional)" value={description} onChange={setDescription} />
      <label className="flex flex-col gap-1.5 mb-4">
        <span className="text-xs font-medium text-ink-3">Who pays for the discount</span>
        <Select value={fundedBy} onValueChange={(v) => setFundedBy(v as "PLATFORM" | "SHOP")}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PLATFORM">RetroMobi (shop credited full price)</SelectItem>
            <SelectItem value="SHOP">The shop (off its earnings)</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <div className="mb-4">
        <span className="text-xs font-medium text-ink-3">
          {fundedBy === "SHOP" ? "Shops that pay for it (pick at least one)" : "Only at these shops (leave empty for every shop)"}
        </span>
        <input
          aria-label="Filter shops"
          placeholder="Filter by name or city"
          value={shopFilter}
          onChange={(e) => setShopFilter(e.target.value)}
          className="mt-1.5 mb-2 h-9 w-full rounded-row border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-ink"
        />
        <div className="max-h-44 overflow-y-auto rounded-row border border-line p-2">
          {shops.length === 0 && <p className="text-xs text-ink-3 p-1">No shops match.</p>}
          {shops.map((shop) => (
            <label key={shop.shopId} className="flex items-center gap-2 px-1 py-1 text-sm text-ink">
              <input type="checkbox" checked={shopIds.includes(shop.shopId)} onChange={() => toggleShop(shop.shopId)} />
              {shop.shopName}
              <span className="text-xs text-ink-3">{shop.city}</span>
            </label>
          ))}
        </div>
        {shopIds.length > 0 && <p className="mt-1 text-xs text-ink-3">{shopIds.length} selected</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {type === "PERCENT" && <TextField label="Max discount (₹)" type="number" value={maxDiscount} onChange={setMaxDiscount} />}
        <TextField label="Min rental total (₹)" type="number" value={minOrder} onChange={setMinOrder} />
        <TextField label="Uses per customer" type="number" value={perUser} onChange={setPerUser} />
        <TextField label="Uses per shop" type="number" value={perShop} onChange={setPerShop} />
      </div>
      <p className="text-xs font-medium text-ink-3 mb-2">Who qualifies (all optional)</p>
      <label className="mb-3 flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={firstBookingOnly} onChange={(e) => setFirstBookingOnly(e.target.checked)} />
        First booking only
      </label>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Completed rides at least" type="number" value={minRentals} onChange={setMinRentals} />
        <TextField label="Completed rides at most" type="number" value={maxRentals} onChange={setMaxRentals} />
        <TextField label="Rental days at least" type="number" value={minDays} onChange={setMinDays} />
        <TextField label="Account younger than (days)" type="number" value={newUserDays} onChange={setNewUserDays} />
        <TextField label="Rider age at least" type="number" value={minAge} onChange={setMinAge} />
        <TextField label="Rider age at most" type="number" value={maxAge} onChange={setMaxAge} />
      </div>
      <TextField label="Birthday: pickup within (days)" type="number" value={birthday} onChange={setBirthday} />
      <div className="flex items-center gap-3">
        <SubmitButton busy={busy} disabled={!code || !value || !validUntil || (fundedBy === "SHOP" && shopIds.length === 0)} onClick={submit}>
          Create coupon
        </SubmitButton>
        <button type="button" onClick={onCancel} className="text-sm text-ink-3 hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function AdminCoupons() {
  return (
    <AdminLayout>
      <CouponsBody />
    </AdminLayout>
  );
}
