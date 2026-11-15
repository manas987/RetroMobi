/**
 * Money, IST days and date labels.
 *
 * Same names and results as apps/Frontend/src/lib/format.ts, but written with
 * plain arithmetic instead of `Intl`. On a phone the JS engine is Hermes, whose
 * `Intl` differs between Android and iOS; these run the same everywhere, and
 * `bun test` on a laptop checks the exact code a device runs.
 *
 * IST is UTC+5:30 with no daylight saving, so "shift by 330 minutes, then read
 * the UTC parts" is exact.
 */

const IST_MS = 330 * 60_000;
const DAY = 24 * 60 * 60 * 1000;

export type Lang = "en" | "hi";

const MONTHS = {
  en: {
    short: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    long: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  },
  hi: {
    short: ["जन॰", "फ़र॰", "मार्च", "अप्रैल", "मई", "जून", "जुल॰", "अग॰", "सित॰", "अक्तू॰", "नव॰", "दिस॰"],
    long: ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्तूबर", "नवंबर", "दिसंबर"],
  },
} as const;

const WEEKDAYS = {
  en: {
    narrow: ["S", "M", "T", "W", "T", "F", "S"],
    short: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    long: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  },
  hi: {
    narrow: ["र", "सो", "मं", "बु", "गु", "शु", "श"],
    short: ["रवि", "सोम", "मंगल", "बुध", "गुरु", "शुक्र", "शनि"],
    long: ["रविवार", "सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार"],
  },
} as const;

/** The instant shifted so its UTC parts read as IST wall-clock parts. */
function ist(at: Date): Date {
  return new Date(at.getTime() + IST_MS);
}

/** Amounts cross the wire as integer paise. Format only at render. "₹1,23,456". */
export function rupees(paise: number): string {
  const n = Math.round(paise / 100);
  const digits = String(Math.abs(n));
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${n < 0 ? "-" : ""}₹${rest ? `${rest},` : ""}${last3}`;
}

/** A plain number with Indian digit grouping: 123456 -> "1,23,456". */
export function groupDigits(n: number): string {
  return rupees(n * 100).replace("₹", "");
}

/**
 * The IST calendar date of an instant, as `YYYY-MM-DD` -- the same thing the
 * backend's `istDate()` produces, and directly comparable as a string to the
 * `date` columns that arrive already in this shape (licence expiry, and so on).
 * Every rule in this system is in IST calendar days.
 */
export function istDay(at: Date): string {
  return ist(at).toISOString().slice(0, 10);
}

export function km(value: number | null): string | null {
  if (value == null) return null;
  return value < 1 ? `${Math.round(value * 1000)} m` : `${value.toFixed(1)} km`;
}

function istMidnight(d: Date): number {
  const shifted = ist(d);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

/** Pricing is per IST calendar day, so the count is of days touched, not 24h blocks. */
export function rentalDays(pickupAt: string, returnAt: string): number {
  return Math.max(1, Math.round((istMidnight(new Date(returnAt)) - istMidnight(new Date(pickupAt))) / DAY) + 1);
}

export interface DateParts {
  weekday?: "narrow" | "short" | "long";
  day?: "numeric";
  month?: "short" | "long";
  year?: "numeric";
}

/**
 * An instant as an IST date label. Only the parts asked for appear, always in
 * the order weekday, day, month, year: "Sat, 15 Nov 2026", "15 Nov", "November 2026".
 */
export function formatIstDate(at: unknown, parts: DateParts = { day: "numeric", month: "short" }, lang: Lang = "en"): string {
  if (at == null || at === "") return "—";
  const d = at instanceof Date ? at : new Date(String(at));
  if (Number.isNaN(d.getTime())) return "—";
  const s = ist(d);
  const rest = [
    parts.day ? String(s.getUTCDate()) : null,
    parts.month ? MONTHS[lang][parts.month][s.getUTCMonth()] : null,
    parts.year ? String(s.getUTCFullYear()) : null,
  ].filter(Boolean).join(" ");
  const weekday = parts.weekday ? WEEKDAYS[lang][parts.weekday][s.getUTCDay()] : null;
  return [weekday, rest].filter(Boolean).join(", ");
}

/** "7:05 pm" in English; Hindi names the part of the day instead: "शाम 7:05". */
export function formatIstTime(at: unknown, lang: Lang = "en"): string {
  if (at == null || at === "") return "—";
  const d = at instanceof Date ? at : new Date(String(at));
  if (Number.isNaN(d.getTime())) return "—";
  const s = ist(d);
  const h = s.getUTCHours();
  const clock = `${h % 12 === 0 ? 12 : h % 12}:${String(s.getUTCMinutes()).padStart(2, "0")}`;
  if (lang === "en") return `${clock} ${h >= 12 ? "pm" : "am"}`;
  const period = h < 4 ? "रात" : h < 12 ? "सुबह" : h < 16 ? "दोपहर" : h < 20 ? "शाम" : "रात";
  return `${period} ${clock}`;
}

/** "HH:MM" (24h) as "10:00 AM", for time pickers. */
export function formatClock(time: string): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function reviewTimeLabel(iso: string, now = new Date()): string | null {
  const posted = new Date(iso);
  if (Number.isNaN(posted.getTime())) return null;
  const days = (istMidnight(now) - istMidnight(posted)) / DAY;
  if (days > 1) return formatIstDate(posted, { day: "numeric", month: "short", year: "numeric" });
  if (days === 1) return "Yesterday";
  const minutes = Math.max(0, Math.floor((now.getTime() - posted.getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
}

/** "Sat, 15 Nov" */
export function dayLabel(iso: string): string {
  return formatIstDate(iso, { weekday: "short", day: "numeric", month: "short" });
}

/** "7:05 pm" */
export function timeLabel(iso: string): string {
  return formatIstTime(iso);
}

/** "15 Nov, 7:05 pm" -- the customer booking cards' one-line stamp. */
export function dateTimeLabel(iso: unknown): string {
  if (typeof iso !== "string") return "—";
  return `${formatIstDate(iso)}, ${formatIstTime(iso)}`;
}

/**
 * Words that are wrong in sentence case. Without these, a document type of
 * GSTIN renders as "Gstin" and RC as "Rc" — which looks like a bug to anyone
 * who knows what the paper is called.
 */
const ACRONYMS = new Set(["GSTIN", "GST", "CGST", "SGST", "IGST", "PAN", "RC", "PUC", "DL", "ID", "KYC", "UPI", "OTP", "NOC"]);

/**
 * A DB enum as a human label: "BANK_PROOF" -> "Bank proof". Formats whatever
 * arrives rather than mapping a fixed list, because several of these columns
 * are free text server-side and a new value must not need an app release.
 */
export function enumLabel(value: unknown): string {
  const s = String(value ?? "");
  if (!s) return "—";
  const words = s.split("_").map((w) => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w.toLowerCase()));
  const first = words[0]!;
  words[0] = ACRONYMS.has(first.toUpperCase()) ? first : first.charAt(0).toUpperCase() + first.slice(1);
  return words.join(" ");
}

/**
 * For `date` columns, which have no meaningful time: "2026-04-01" or
 * "2026-04-01T00:00:00.000Z" -> "1 Apr 2026". Read straight off the string, so
 * no timezone can move the day.
 */
export function dateLabel(value: unknown, lang: Lang = "en"): string {
  if (value == null || value === "") return "—";
  const iso = String(value).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return String(value);
  return `${Number(m[3])} ${MONTHS[lang].short[Number(m[2]) - 1]} ${m[1]}`;
}

/**
 * "+917039408159" -> "+91 70394 08159", the way Indian numbers are read out,
 * with non-breaking spaces so a number never wraps in half.
 */
export function phoneLabel(phone: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}
