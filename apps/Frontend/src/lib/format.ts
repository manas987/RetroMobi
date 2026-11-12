const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** Amounts cross the wire as integer paise. Format only at render. */
export function rupees(paise: number): string {
  return inr.format(Math.round(paise / 100));
}

const istDayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });

/**
 * The IST calendar date of an instant, as `YYYY-MM-DD` — the same thing the
 * backend's `istDate()` produces, and directly comparable as a string to the
 * `date` columns that arrive already in this shape (licence expiry, and so on).
 *
 * Every rule in this system is in IST calendar days, so anything comparing a
 * date column against a moment has to come through here. Doing it with `Date`
 * objects compares a local midnight against a real time of day and is wrong by
 * up to a day.
 */
export function istDay(at: Date): string {
  return istDayFormat.format(at);
}

export function km(value: number | null): string | null {
  if (value == null) return null;
  return value < 1 ? `${Math.round(value * 1000)} m` : `${value.toFixed(1)} km`;
}

const DAY = 24 * 60 * 60 * 1000;

/** Pricing is per IST calendar day, so the count is of days touched, not 24h blocks. */
export function rentalDays(pickupAt: string, returnAt: string): number {
  const a = istMidnight(new Date(pickupAt));
  const b = istMidnight(new Date(returnAt));
  return Math.max(1, Math.round((b - a) / DAY) + 1);
}

function istMidnight(d: Date): number {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
}

export function reviewTimeLabel(iso: string, now = new Date()): string | null {
  const posted = new Date(iso);
  if (Number.isNaN(posted.getTime())) return null;
  const days = (istMidnight(now) - istMidnight(posted)) / DAY;
  if (days > 1) {
    return posted.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  }
  if (days === 1) return "Yesterday";
  const minutes = Math.max(0, Math.floor((now.getTime() - posted.getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
}

export function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    weekday: "short",
  });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Words that are wrong in sentence case. Without these, a document type of
 * GSTIN renders as "Gstin" and RC as "Rc" — which looks like a bug to anyone
 * who knows what the paper is called.
 */
const ACRONYMS = new Set([
  "GSTIN",
  "GST",
  "CGST",
  "SGST",
  "IGST",
  "PAN",
  "RC",
  "PUC",
  "DL",
  "ID",
  "KYC",
  "UPI",
  "OTP",
  "NOC",
]);

/**
 * A DB enum as a human label: "BANK_PROOF" -> "Bank proof". Formats whatever
 * arrives rather than mapping a fixed list, because several of these columns
 * (`merchant_documents.type`, `vehicle_models.body_type`) are free text
 * server-side and a new value must not need a redeploy to read correctly.
 */
export function enumLabel(value: unknown): string {
  const s = String(value ?? "");
  if (!s) return "—";

  const words = s.split("_").map((w) => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w.toLowerCase()));
  const first = words[0]!;
  // Only the first word is capitalised, and only when it is not already an
  // acronym carrying its own casing.
  words[0] = ACRONYMS.has(first.toUpperCase()) ? first : first.charAt(0).toUpperCase() + first.slice(1);
  return words.join(" ");
}

/**
 * For `date` columns, which have no meaningful time. Postgres `date` is
 * hydrated to a Date and serialised with a `T`, so the generic timestamp
 * formatter renders a misleading midnight ("1 Apr, 12:00 am") and can shift
 * the day across timezones. Parsed at local noon to stay on the right date.
 */
export function dateLabel(value: unknown): string {
  if (value == null || value === "") return "—";
  const iso = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return String(value);
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
