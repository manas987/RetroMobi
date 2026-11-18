import { useState } from "react";
import { portalFetch, type Row } from "../../../lib/portal";
import { LocationPicker } from "../../../components/LocationPicker";
import { useT } from "../../../i18n";
import { errorText, useInvalidateMerchant } from "../query";
import { Button, ErrorNote, Field, INPUT, PHONE, Sheet } from "../ui/ui";
import { E164Input } from "../../../components/PhoneInput";

/** Edit a shop's details, or (no `shop`) add another branch. */
export function BranchSheet({ open, onClose, shop, token, reloadShops, lockedState, onSaved }: {
  open: boolean; onClose: () => void; shop?: Row; token: string; reloadShops: () => void; lockedState?: string; onSaved?: (shop: Row) => void;
}) {
  const { t } = useT();
  return (
    <Sheet open={open} onClose={onClose} title={shop ? t("shop.editTitle") : t("shop.addTitle")}>
      <BranchForm shop={shop} token={token} reloadShops={reloadShops} onClose={onClose} lockedState={lockedState} onSaved={onSaved} />
    </Sheet>
  );
}

/** `lockedState`: the merchant's other shops are in this state, and a shop in another one isn't allowed yet. */
export function BranchForm({ shop, token, reloadShops, onClose, lockedState, onSaved }: {
  shop?: Row; token: string; reloadShops: () => void; onClose: () => void; lockedState?: string; onSaved?: (shop: Row) => void;
}) {
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const [name, setName] = useState(String(shop?.name ?? ""));
  const [phone, setPhone] = useState(String(shop?.phone ?? ""));
  const [address, setAddress] = useState(String(shop?.address_line1 ?? ""));
  const [city, setCity] = useState(String(shop?.city ?? ""));
  const [state, setState] = useState(lockedState ?? String(shop?.state ?? "Uttarakhand"));
  const [landmark, setLandmark] = useState(String(shop?.landmark ?? ""));
  const [email, setEmail] = useState(String(shop?.email ?? ""));
  const [pincode, setPincode] = useState(String(shop?.pincode ?? ""));
  const [lat, setLat] = useState<number | null>(shop?.latitude != null ? Number(shop.latitude) : null);
  const [lng, setLng] = useState<number | null>(shop?.longitude != null ? Number(shop.longitude) : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim() && address.trim() && city.trim() && state.trim() && /^\d{6}$/.test(pincode);

  async function save() {
    setBusy(true);
    setError(null);
    const body = { name: name.trim(), phone: phone.trim() || undefined, addressLine1: address.trim(), landmark: landmark.trim() || undefined, email: shop ? email.trim() || undefined : undefined, city: city.trim(), state: state.trim(), pincode, latitude: lat ?? undefined, longitude: lng ?? undefined };
    try {
      const saved = await portalFetch<Row>("merchant", shop ? `/shops/${shop.id}` : "/shops", { method: shop ? "PATCH" : "POST", token, body });
      reloadShops();
      await invalidate();
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Field label={t("common.shopName")}><input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label={t("setup.shopPhone")}><E164Input value={phone} onChange={setPhone} className={PHONE} placeholder="" /></Field>
      <Field label={t("common.address")}><input className={INPUT} value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
      <Field label={`${t("shop.landmark")} (${t("common.optional")})`}><input className={INPUT} maxLength={200} placeholder={t("shop.landmarkHint")} value={landmark} onChange={(e) => setLandmark(e.target.value)} /></Field>
      <Field label={t("common.city")}><input className={INPUT} value={city} onChange={(e) => setCity(e.target.value)} /></Field>
      <Field label={t("common.state")}>
        <input className={lockedState ? `${INPUT} bg-surface-3` : INPUT} readOnly={lockedState != null} value={state} onChange={(e) => setState(e.target.value)} />
        {lockedState && <span className="mt-1 block text-xs text-ink-3">{t("shop.stateLocked")}</span>}
      </Field>
      {shop && <Field label={`${t("shop.email")} (${t("common.optional")})`}><input className={INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>}
      <Field label={t("common.pincode")}><input className={INPUT} inputMode="numeric" maxLength={6} value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))} /></Field>
      <p className="mb-2 text-sm font-medium text-ink">{t("setup.pinLabel")}</p>
      <div className="mb-4"><LocationPicker latitude={lat} longitude={lng} onChange={(a, b) => { setLat(a); setLng(b); }} /></div>
      {error && <div className="mb-4"><ErrorNote text={error} /></div>}
      <Button variant="primary" size="lg" className="w-full" disabled={busy || !valid} onClick={save}>{busy ? t("common.saving") : shop ? t("common.save") : t("common.createShop")}</Button>
    </>
  );
}
