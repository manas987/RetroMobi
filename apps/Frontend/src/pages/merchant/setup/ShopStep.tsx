import { useState } from "react";
import type { Row } from "../../../lib/portal";
import { portalFetch } from "../../../lib/portal";
import { LocationPicker } from "../../../components/LocationPicker";
import { useT } from "../../../i18n";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "../query";
import { ErrorNote, Field, INPUT, LoadingRows } from "../ui/ui";
import { HoursEditor, hoursFromShop, hoursInvalid, hoursPayload } from "../shop/HoursSheet";
import { StepCard, type StepKey } from "./Stepper";

export interface StepProps {
  token: string;
  shopId: string;
  can: boolean;
  back: () => void;
  next: () => void;
  advance: () => void;
}

export function ShopStep(p: StepProps) {
  const { t } = useT();
  const q = useMerchantQuery<Row>(`/shops/${p.shopId}`, p.token);
  const common = { step: "shop" as StepKey, title: t("setup.shopTitle"), why: t("setup.shopWhy"), onBack: p.back, onNext: p.next, gated: !p.can };
  if (q.isPending) return <StepCard {...common}><LoadingRows /></StepCard>;
  if (q.isError) return <StepCard {...common}><ErrorNote onRetry={() => q.refetch()} /></StepCard>;
  return <ShopForm {...p} shop={q.data} />;
}

function ShopForm({ shop, ...p }: StepProps & { shop: Row }) {
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const [address, setAddress] = useState(String(shop.address_line1 ?? ""));
  const [city, setCity] = useState(String(shop.city ?? ""));
  const [pincode, setPincode] = useState(String(shop.pincode ?? ""));
  const [phone, setPhone] = useState(String(shop.phone ?? ""));
  const [lat, setLat] = useState<number | null>(shop.latitude != null ? Number(shop.latitude) : null);
  const [lng, setLng] = useState<number | null>(shop.longitude != null ? Number(shop.longitude) : null);
  const [hours, setHours] = useState(() => hoursFromShop(shop));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = [
    !address.trim() && t("setup.need_address"),
    !city.trim() && t("setup.need_city"),
    !/^\d{6}$/.test(pincode) && t("setup.need_pincode"),
    (lat == null || lng == null) && t("setup.need_pin"),
    hoursInvalid(hours) && t("setup.need_hours"),
  ].filter((x): x is string => Boolean(x));
  const valid = missing.length === 0;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/shops/${p.shopId}`, {
        method: "PATCH",
        token: p.token,
        body: { addressLine1: address.trim(), city: city.trim(), pincode, phone: phone.trim() || undefined, latitude: lat, longitude: lng },
      });
      await portalFetch("merchant", `/shops/${p.shopId}/hours`, { method: "PUT", token: p.token, body: { hours: hoursPayload(hours) } });
      await invalidate();
      p.advance();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepCard step="shop" title={t("setup.shopTitle")} why={t("setup.shopWhy")} gated={!p.can} onBack={p.back} onNext={p.next} onSave={save} busy={busy} disabled={!valid} missing={missing} error={error}>
      <Field label={t("common.address")}><input className={INPUT} value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label={t("common.city")}><input className={INPUT} value={city} onChange={(e) => setCity(e.target.value)} /></Field>
        <Field label={t("common.pincode")}><input className={INPUT} inputMode="numeric" maxLength={6} value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))} /></Field>
        <Field label={t("setup.shopPhone")}><input className={INPUT} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label={t("common.state")}><input className={`${INPUT} bg-surface-3`} readOnly value={String(shop.state ?? "")} /></Field>
      </div>
      <p className="mb-2 text-sm font-medium text-ink">{t("setup.pinLabel")}</p>
      <div className="mb-4"><LocationPicker latitude={lat} longitude={lng} onChange={(a, b) => { setLat(a); setLng(b); }} /></div>
      <HoursEditor value={hours} onChange={setHours} />
    </StepCard>
  );
}
