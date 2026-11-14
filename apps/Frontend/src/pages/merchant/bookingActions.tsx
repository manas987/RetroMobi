import { useState } from "react";
import { CheckCircle2, ShieldAlert, ShieldCheck, ThumbsUp, TriangleAlert, Video } from "lucide-react";
import { portalFetch, type Row } from "../../lib/portal";
import { istDay, rupees } from "../../lib/format";
import { combine, splitIso } from "../../components/DateTimeField";
import { DateRangeField } from "../../components/DateRangeField";
import { useT } from "../../i18n";
import { useMerchantShop } from "./Layout";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "./query";
import { Button, ErrorNote, Field, INPUT, LoadingRows, Select, Sheet } from "./ui/ui";

/**
 * The three things that happen at the counter: hand a vehicle over, take it
 * back, and record a walk-in. Shared by Overview and Bookings so the flow is
 * identical wherever the shop starts it.
 */

const money = (v: unknown) => rupees(Number(v ?? 0));

export function renterName(b: Row): string {
  return String(b.walkin_name ?? b.rider_name ?? b.customer_name ?? "—");
}

export function vehicleLabel(b: Row): string {
  return `${String(b.make ?? "")} ${String(b.model ?? "")} · ${String(b.registration_number ?? "")}`.trim();
}

function Summary({ booking }: { booking: Row }) {
  const { t, date, time } = useT();
  return (
    <dl className="mb-5 grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl bg-surface-2 p-4 text-sm">
      <dt className="text-ink-3">{t("actions.customer")}</dt>
      <dd className="font-medium text-ink text-right">{renterName(booking)}</dd>
      <dt className="text-ink-3">{t("actions.vehicle")}</dt>
      <dd className="font-medium text-ink text-right">{vehicleLabel(booking)}</dd>
      <dt className="text-ink-3">{t("actions.return")}</dt>
      <dd className="font-medium text-ink text-right">
        {date(booking.scheduled_return_at)}, {time(booking.scheduled_return_at)}
      </dd>
    </dl>
  );
}

// ---------------------------------------------------------------- hand over

export function HandoverSheet({ booking, onClose }: { booking: Row | null; onClose: () => void }) {
  const { t } = useT();
  const walkin = booking?.source === "OFFLINE";
  return (
    <Sheet open={booking != null} onClose={onClose} title={walkin ? t("actions.handoverWalkin") : t("actions.idTitle")}>
      {booking && (walkin ? <WalkinHandover booking={booking} onClose={onClose} /> : <IdentityCheck booking={booking} onClose={onClose} />)}
    </Sheet>
  );
}

function WalkinHandover({ booking, onClose }: { booking: Row; onClose: () => void }) {
  const { t, lang } = useT();
  const { token } = useMerchantShop();
  const invalidate = useInvalidateMerchant();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/bookings/${booking.id}/pickup`, { method: "POST", token });
      await invalidate();
      onClose();
    } catch (err) {
      setError(errorText(lang, err));
      setBusy(false);
    }
  }

  return (
    <div>
      <Summary booking={booking} />
      <p className="mb-3 text-base text-ink-2">{t("actions.walkinHandoverBody")}</p>
      <p className="mb-6 rounded-2xl border border-line-strong px-4 py-3">
        <span className="block text-xs text-ink-3">{t("actions.licenceNumber")}</span>
        <span className="tnum text-lg font-semibold text-ink">{String(booking.walkin_dl_number ?? "—")}</span>
      </p>
      {error && <ErrorNote text={error} />}
      <Button variant="primary" size="lg" icon={CheckCircle2} className="w-full mt-3" disabled={busy} onClick={confirm}>
        {t("actions.walkinHandoverConfirm")}
      </Button>
    </div>
  );
}

interface Identity {
  riderName: string | null;
  riderDob: string | null;
  licenceNumberMasked: string | null;
  licenceExpiresOn: string | null;
  photoUrl: string | null;
  alreadyChecked: boolean;
}

/**
 * Three questions, answered at the counter with the customer standing there.
 * A "No" is still submitted: the server records a refused handover, which is
 * evidence too, and answers 422 -- shown as a plain "don't hand over".
 */
function IdentityCheck({ booking, onClose }: { booking: Row; onClose: () => void }) {
  const { t, lang, date } = useT();
  const { token } = useMerchantShop();
  const invalidate = useInvalidateMerchant();
  const q = useMerchantQuery<Identity>(`/bookings/${booking.id}/identity`, token);
  const [photo, setPhoto] = useState<boolean | null>(null);
  const [card, setCard] = useState<boolean | null>(null);
  const [last4, setLast4] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"ok" | "failed" | null>(null);

  if (q.isPending) return <LoadingRows />;
  if (q.isError) return <ErrorNote text={errorText(lang, q.error)} onRetry={() => q.refetch()} />;
  const id = q.data;

  if (outcome === "failed") {
    return (
      <div className="rounded-2xl bg-danger-soft p-5 text-danger">
        <ShieldAlert className="h-8 w-8 mb-2" aria-hidden />
        <p className="text-lg font-semibold">{t("actions.idFailedTitle")}</p>
        <p className="mt-1 text-base">{t("actions.idFailedBody")}</p>
        <Button variant="secondary" className="mt-5 w-full" onClick={onClose}>
          {t("common.close")}
        </Button>
      </div>
    );
  }

  if (outcome !== "ok" && id.alreadyChecked) {
    // Not a success screen: the shop is waiting, the customer has to act.
    return (
      <div className="rounded-2xl bg-info-soft p-5 text-info">
        <Video className="h-8 w-8 mb-2" aria-hidden />
        <p className="text-lg font-semibold">{t("actions.waitingVideoTitle")}</p>
        <p className="mt-1 text-base">{t("actions.waitingVideoBody")}</p>
        <Button variant="secondary" className="mt-5 w-full" onClick={onClose}>
          {t("common.close")}
        </Button>
      </div>
    );
  }

  if (outcome === "ok") {
    return (
      <div className="rounded-2xl bg-verified-soft p-5 text-verified">
        <ShieldCheck className="h-8 w-8 mb-2" aria-hidden />
        <p className="text-base font-medium">{t("actions.idDone")}</p>
        <Button variant="secondary" className="mt-5 w-full" onClick={onClose}>
          {t("common.done")}
        </Button>
      </div>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/bookings/${booking.id}/identity-check`, {
        method: "POST",
        token,
        body: { photoMatched: photo, physicalDlSeen: card, dlNumberLast4: last4 },
      });
      setOutcome("ok");
      void invalidate();
    } catch (err) {
      if ((err as { code?: string }).code === "identity_check_failed") setOutcome("failed");
      else setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-5 text-base text-ink-2">{t("actions.idIntro")}</p>

      <ol className="flex flex-col gap-6">
        <li>
          <p className="mb-3 text-base font-semibold text-ink">1. {t("actions.idStepPhoto")}</p>
          <div className="flex gap-4 items-start">
            {id.photoUrl ? (
              <img src={id.photoUrl} alt="" className="h-36 w-28 rounded-2xl object-cover bg-surface-3" />
            ) : (
              <p className="text-sm text-ink-3">{t("actions.idNoPhoto")}</p>
            )}
            <dl className="text-sm">
              <dt className="text-ink-3">{t("actions.idName")}</dt>
              <dd className="mb-2 font-medium text-ink">{id.riderName ?? "—"}</dd>
              <dt className="text-ink-3">{t("actions.idDob")}</dt>
              <dd className="mb-2 font-medium text-ink">{id.riderDob ? date(`${id.riderDob}T12:00:00`, { day: "numeric", month: "short", year: "numeric" }) : "—"}</dd>
              <dt className="text-ink-3">{t("actions.idValidTill")}</dt>
              <dd className="font-medium text-ink">{id.licenceExpiresOn ? date(`${id.licenceExpiresOn}T12:00:00`, { day: "numeric", month: "short", year: "numeric" }) : "—"}</dd>
            </dl>
          </div>
          <YesNo value={photo} onChange={setPhoto} />
        </li>
        <li>
          <p className="mb-3 text-base font-semibold text-ink">2. {t("actions.idStepCard")}</p>
          <YesNo value={card} onChange={setCard} />
        </li>
        <li>
          <p className="mb-1 text-base font-semibold text-ink">3. {t("actions.idStepLast4")}</p>
          {id.licenceNumberMasked && (
            <p className="mb-2 text-sm text-ink-3">{t("actions.idOnFile", { masked: id.licenceNumberMasked })}</p>
          )}
          <input
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 4).toUpperCase())}
            inputMode="text"
            autoComplete="off"
            aria-label={t("actions.idStepLast4")}
            className={`${INPUT} w-40 tnum text-xl tracking-[0.4em]`}
          />
        </li>
      </ol>

      {error && <div className="mt-5"><ErrorNote text={error} /></div>}
      <Button
        variant="primary"
        size="lg"
        icon={ShieldCheck}
        className="mt-6 w-full"
        disabled={busy || photo === null || card === null || last4.length !== 4}
        onClick={submit}
      >
        {t("actions.idSubmit")}
      </Button>
    </div>
  );
}

function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  const { t } = useT();
  const cls = (on: boolean) =>
    `min-h-12 flex-1 rounded-2xl border-2 text-base font-semibold ${on ? "border-ink bg-ink text-surface" : "border-line-strong text-ink"}`;
  return (
    <div className="mt-3 flex gap-3" role="group">
      <button type="button" aria-pressed={value === true} className={cls(value === true)} onClick={() => onChange(true)}>
        {t("actions.yes")}
      </button>
      <button type="button" aria-pressed={value === false} className={cls(value === false)} onClick={() => onChange(false)}>
        {t("actions.no")}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- return

export function ReturnSheet({ booking, onClose }: { booking: Row | null; onClose: () => void }) {
  const { t } = useT();
  return (
    <Sheet open={booking != null} onClose={onClose} title={t("actions.returnTitle")}>
      {booking && <ReturnFlow key={String(booking.id)} booking={booking} onClose={onClose} />}
    </Sheet>
  );
}

function ReturnFlow({ booking, onClose }: { booking: Row; onClose: () => void }) {
  const { t, lang } = useT();
  const { token } = useMerchantShop();
  const invalidate = useInvalidateMerchant();
  const walkin = booking.source === "OFFLINE";
  const deposit = Number(booking.deposit_amount ?? 0);
  const [step, setStep] = useState<"choose" | "claim" | "receipt" | "claimed">("choose");
  const [released, setReleased] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [rupeeAmount, setRupeeAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountPaise = Math.round(Number(rupeeAmount || 0) * 100);
  const tooMuch = deposit > 0 && amountPaise > deposit;

  async function send(body: { claim: boolean; reason?: string; amount?: number }, next: "receipt" | "claimed") {
    setBusy(true);
    setError(null);
    try {
      const r = await portalFetch<{ depositReleased: number | null }>("merchant", `/bookings/${booking.id}/return`, {
        method: "POST",
        token,
        body,
      });
      setReleased(r.depositReleased ?? 0);
      setStep(next);
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  // Held open, not auto-dismissed: the customer is still at the counter, and
  // this is what tells them where their deposit went.
  if (step === "receipt" || step === "claimed") {
    return (
      <div className="rounded-2xl bg-verified-soft p-5 text-verified">
        <CheckCircle2 className="h-8 w-8 mb-2" aria-hidden />
        <p className="text-lg font-semibold">{t("actions.receiptTitle")}</p>
        {step === "claimed" ? (
          <p className="mt-2 text-base text-ink">{t("actions.claimDone")}</p>
        ) : walkin ? (
          <p className="mt-2 text-base text-ink">{t("actions.receiptWalkin")}</p>
        ) : released && released > 0 ? (
          <>
            <p className="mt-1 text-2xl font-semibold tnum">{t("actions.receiptDeposit", { amount: rupees(released) })}</p>
            <p className="mt-3 text-base text-ink">{t("actions.receiptShowCustomer")}</p>
          </>
        ) : (
          <p className="mt-2 text-base text-ink">{t("actions.receiptNoDeposit")}</p>
        )}
        <Button
          variant="dark"
          size="lg"
          className="mt-6 w-full"
          onClick={() => {
            void invalidate();
            onClose();
          }}
        >
          {t("common.done")}
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Summary booking={booking} />
      {error && <div className="mb-4"><ErrorNote text={error} /></div>}

      {step === "choose" && (
        <>
          <p className="mb-4 text-base font-medium text-ink">{t("actions.returnQuestion")}</p>
          <div className="flex flex-col gap-3">
            <Button variant="primary" size="lg" icon={ThumbsUp} disabled={busy} onClick={() => send({ claim: false }, "receipt")}>
              {walkin ? t("actions.returnFineWalkin") : t("actions.returnFine")}
              {!walkin && deposit > 0 && <span className="tnum font-normal">· {money(deposit)}</span>}
            </Button>
            {/* A walk-in's deposit is cash in the shop's own drawer -- there is
                nothing for RetroMobi to hold back, so no claim path. */}
            {!walkin && (
              <Button variant="secondary" size="lg" icon={TriangleAlert} disabled={busy} onClick={() => setStep("claim")}>
                {t("actions.returnDamage")}
              </Button>
            )}
          </div>
          <p className="mt-4 text-sm text-ink-3">{t("actions.returnFinalNote")}</p>
        </>
      )}

      {step === "claim" && (
        <>
          <Field label={t("actions.claimReason")}>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("actions.claimReasonHint")}
              rows={3}
              className={`${INPUT} py-3`}
            />
          </Field>
          <Field label={t("actions.claimAmount")}>
            <input
              value={rupeeAmount}
              onChange={(e) => setRupeeAmount(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              className={`${INPUT} tnum text-lg`}
            />
            {deposit > 0 && (
              <span className={`text-sm ${tooMuch ? "text-danger" : "text-ink-3"}`}>
                {tooMuch ? t("actions.claimTooMuch") : t("actions.claimMax", { amount: money(deposit) })}
              </span>
            )}
          </Field>
          <p className="mb-5 rounded-2xl bg-info-soft px-4 py-3 text-sm text-info">{t("actions.claimNext")}</p>
          <div className="flex flex-col gap-3">
            <Button
              variant="danger"
              size="lg"
              disabled={busy || !reason.trim() || amountPaise <= 0 || tooMuch}
              onClick={() => send({ claim: true, reason: reason.trim(), amount: amountPaise }, "claimed")}
            >
              {t("actions.claimSubmit")}
            </Button>
            <Button variant="ghost" onClick={() => setStep("choose")}>
              {t("common.back")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- walk-in

/** `vehicleId` pre-selects a vehicle, e.g. from a "Book" button on a free one;
 *  `startDay` ("YYYY-MM-DD", IST) starts the booking on a calendar day. */
export function WalkinSheet({
  open,
  onClose,
  vehicleId,
  startDay,
}: {
  open: boolean;
  onClose: () => void;
  vehicleId?: string;
  startDay?: string;
}) {
  const { t } = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("actions.walkinTitle")}>
      {open && <WalkinForm onClose={onClose} initialVehicleId={vehicleId} startDay={startDay} />}
    </Sheet>
  );
}

/** Now, rounded up to the next quarter hour, for eight hours -- or, for a
 *  later day picked on a calendar, 10:00 to 18:00 that day. */
function walkinWindow(startDay?: string) {
  if (startDay && startDay > istDay(new Date())) {
    return { pickupAt: `${startDay}T10:00:00+05:30`, returnAt: `${startDay}T18:00:00+05:30` };
  }
  const quarter = 15 * 60_000;
  const pickup = new Date(Math.ceil(Date.now() / quarter) * quarter);
  return { pickupAt: pickup.toISOString(), returnAt: new Date(pickup.getTime() + 8 * 3_600_000).toISOString() };
}

interface WalkinResult {
  totals: { rentalAmount: number; securityDepositAmount: number };
}

function WalkinForm({ onClose, initialVehicleId, startDay }: { onClose: () => void; initialVehicleId?: string; startDay?: string }) {
  const { t, lang } = useT();
  const { token, shopId } = useMerchantShop();
  const invalidate = useInvalidateMerchant();
  const vehiclesQ = useMerchantQuery<{ vehicles: Row[] }>(`/shops/${shopId}/vehicles`, token);
  const [vehicleId, setVehicleId] = useState(initialVehicleId ?? "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+91");
  const [dl, setDl] = useState("");
  // The customer is at the counter: start now, not at the customer site's
  // "tomorrow 10am" default. Eight hours is a starting point to adjust.
  const win = walkinWindow(startDay);
  const [pickupDate, setPickupDate] = useState(splitIso(win.pickupAt).date);
  const [pickupTime, setPickupTime] = useState(splitIso(win.pickupAt).time);
  const [returnDate, setReturnDate] = useState(splitIso(win.returnAt).date);
  const [returnTime, setReturnTime] = useState(splitIso(win.returnAt).time);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<WalkinResult | null>(null);

  const pickupAt = combine(pickupDate, pickupTime);
  const returnAt = combine(returnDate, returnTime);
  const windowError = returnAt <= pickupAt;
  const vehicles = vehiclesQ.data?.vehicles ?? [];
  const valid = vehicleId && name.trim() && phone.length >= 13 && dl.trim() && !windowError;

  if (saved) {
    const deposit = saved.totals.securityDepositAmount;
    return (
      <div className="rounded-2xl bg-verified-soft p-5">
        <CheckCircle2 className="h-8 w-8 mb-2 text-verified" aria-hidden />
        <p className="text-lg font-semibold text-verified">{t("actions.walkinSaved")}</p>
        <p className="mt-3 text-2xl font-semibold text-ink tnum">
          {t("actions.walkinCollect", { amount: rupees(saved.totals.rentalAmount) })}
        </p>
        {deposit > 0 && <p className="mt-1 text-base text-ink-2">{t("actions.walkinDepositNote", { amount: rupees(deposit) })}</p>}
        <Button variant="dark" size="lg" className="mt-6 w-full" onClick={onClose}>
          {t("common.done")}
        </Button>
      </div>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await portalFetch<WalkinResult>("merchant", "/bookings/walkin", {
        method: "POST",
        token,
        body: {
          vehicleId,
          walkinName: name.trim(),
          walkinPhone: phone,
          walkinDlNumber: dl.trim(),
          pickupAt: pickupAt.toISOString(),
          returnAt: returnAt.toISOString(),
        },
      });
      setSaved(r);
      void invalidate();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  if (vehiclesQ.isPending) return <LoadingRows />;
  if (vehiclesQ.isError) return <ErrorNote onRetry={() => vehiclesQ.refetch()} />;
  if (vehicles.length === 0) return <p className="text-base text-ink-2">{t("actions.walkinNoVehicles")}</p>;

  return (
    <div>
      <p className="mb-5 text-base text-ink-2">{t("actions.walkinIntro")}</p>
      <Field label={t("actions.walkinVehicle")}>
        <Select
          value={vehicleId}
          onChange={setVehicleId}
          placeholder={t("actions.walkinChooseVehicle")}
          // No price row means the server can't total it; say so here
          // instead of letting the save fail.
          options={vehicles.map((v) => ({
            value: String(v.id),
            label: v.amount != null ? vehicleLabel(v) : `${vehicleLabel(v)} — ${t("actions.walkinNoPrice")}`,
            disabled: v.amount == null,
          }))}
        />
      </Field>
      <Field label={t("actions.walkinName")}>
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className={INPUT} />
      </Field>
      <Field label={t("actions.walkinPhone")}>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={`${INPUT} tnum`} />
      </Field>
      <Field label={t("actions.licenceNumber")}>
        <input value={dl} onChange={(e) => setDl(e.target.value.toUpperCase())} autoComplete="off" className={`${INPUT} tnum`} />
      </Field>
      <div className="mb-4 flex rounded-2xl border border-line-strong px-4 py-3">
        <DateRangeField
          label={t("actions.walkinWhen")}
          pickupDate={pickupDate}
          pickupTime={pickupTime}
          returnDate={returnDate}
          returnTime={returnTime}
          onDatesChange={(from, to) => {
            setPickupDate(from);
            setReturnDate(to);
          }}
          onPickupTime={setPickupTime}
          onReturnTime={setReturnTime}
        />
      </div>
      {windowError && <p className="mb-3 text-sm text-danger">{t("actions.walkinWindowError")}</p>}
      {error && <div className="mb-4"><ErrorNote text={error} /></div>}
      <Button variant="primary" size="lg" className="w-full" disabled={busy || !valid} onClick={submit}>
        {t("actions.walkinSubmit")}
      </Button>
    </div>
  );
}
