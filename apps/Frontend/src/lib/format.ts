const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** Amounts cross the wire as integer paise. Format only at render. */
export function rupees(paise: number): string {
  return inr.format(Math.round(paise / 100));
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
