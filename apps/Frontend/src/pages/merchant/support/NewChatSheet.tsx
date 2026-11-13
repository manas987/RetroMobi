import { useState } from "react";
import { portalFetch, type Row } from "../../../lib/portal";
import { useT, type TKey } from "../../../i18n";
import { useMerchantShop } from "../Layout";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "../query";
import { vehicleLabel } from "../bookingActions";
import { Button, ErrorNote, Field, INPUT, Select, Sheet } from "../ui/ui";

const CATS = ["BOOKING", "APP_HELP", "OTHER"] as const;
type Cat = (typeof CATS)[number];

export function NewChatSheet({ open, onClose, bookingId: preset, onCreated }: { open: boolean; onClose: () => void; bookingId?: string | null; onCreated: (id: string) => void }) {
  const { token, shopId } = useMerchantShop();
  const { t, lang, date } = useT();
  const invalidate = useInvalidateMerchant();
  const [picked, setPicked] = useState<Cat | null>(null);
  const [chosenBooking, setChosenBooking] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const category: Cat = picked ?? (preset ? "BOOKING" : "APP_HELP");
  const bookingId = chosenBooking || preset || "";
  const bookings = useMerchantQuery<{ bookings: Row[] }>(open && category === "BOOKING" && shopId ? `/shops/${shopId}/bookings` : null, token);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const ticket = await portalFetch<{ id: string }>("merchant", "/tickets", {
        method: "POST", token,
        body: { bookingId: category === "BOOKING" ? bookingId : undefined, firstMessage: message.trim() || undefined },
      });
      await portalFetch("merchant", `/tickets/${ticket.id}/category`, {
        method: "POST", token,
        body: category === "BOOKING" ? { category, bookingId } : { category },
      });
      await invalidate();
      setMessage("");
      setPicked(null);
      onCreated(ticket.id);
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("support.newTitle")}>
      {error && <div className="mb-4"><ErrorNote text={error} /></div>}
      <Field label={t("support.whatAbout")}>
        <Select value={category} onChange={setPicked} options={CATS.map((c) => ({ value: c, label: t(`support.cat${c}` as TKey) }))} />
      </Field>
      {category === "BOOKING" && (
        <Field label={t("support.whichBooking")}>
          <Select
            value={bookingId}
            onChange={setChosenBooking}
            placeholder={t("support.pickBooking")}
            options={(bookings.data?.bookings ?? []).map((b) => ({ value: String(b.id), label: `${vehicleLabel(b)} · ${date(b.scheduled_pickup_at)}` }))}
          />
        </Field>
      )}
      <Field label={`${t("support.firstMessage")} (${t("common.optional")})`}>
        <textarea className={`${INPUT} py-3 min-h-28`} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <Button variant="primary" size="lg" className="w-full" disabled={busy || (category === "BOOKING" && !bookingId)} onClick={create}>
        {t("support.start")}
      </Button>
    </Sheet>
  );
}
