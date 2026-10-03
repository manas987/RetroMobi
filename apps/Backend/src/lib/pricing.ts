// Pure pricing functions. No DB, no imports from the rest of the project.
// All calendar-day and weekend logic is computed in IST (UTC+5:30), never UTC —
// RetroMobi is India-only and an evening UTC pickup is already the next day in IST.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export interface DayRate {
  date: string; // 'YYYY-MM-DD' in IST
  amount: number; // paise
  isWeekend: boolean; // Saturday or Sunday, IST
  source: "BASE" | "SPECIAL";
}

function toIstDateString(d: Date): string {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return ist.toISOString().slice(0, 10);
}

function istMidnightUtcMs(dateStr: string): number {
  // The instant that is 00:00 IST on `dateStr`, expressed as a UTC epoch ms.
  return new Date(`${dateStr}T00:00:00Z`).getTime() - IST_OFFSET_MS;
}

function isWeekendDate(dateStr: string): boolean {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

export function countRentalDays(pickupAt: Date, returnAt: Date): number {
  const pickupDate = toIstDateString(pickupAt);
  const returnDate = toIstDateString(returnAt);
  const days = Math.round(
    (istMidnightUtcMs(returnDate) - istMidnightUtcMs(pickupDate)) / 86_400_000,
  );
  return Math.max(days, 1);
}

export function priceRental(input: {
  pickupAt: Date;
  returnAt: Date;
  pricing: { amount: number; weekendAmount: number; securityDepositAmount: number };
  specialPricings: Array<{
    amount: number;
    weekendAmount: number;
    effectiveFrom: string;
    effectiveUntil: string;
  }>;
}): { days: DayRate[]; rentalAmount: number } {
  const { pickupAt, returnAt, pricing, specialPricings } = input;
  const numDays = countRentalDays(pickupAt, returnAt);
  const pickupDate = toIstDateString(pickupAt);
  const pickupMidnight = istMidnightUtcMs(pickupDate);

  const days: DayRate[] = [];
  for (let i = 0; i < numDays; i++) {
    const dateMs = pickupMidnight + i * 86_400_000;
    const date = toIstDateString(new Date(dateMs));
    const weekend = isWeekendDate(date);

    const special = specialPricings.find(
      (s) => date >= s.effectiveFrom && date <= s.effectiveUntil,
    );

    if (special) {
      days.push({
        date,
        amount: weekend ? special.weekendAmount : special.amount,
        isWeekend: weekend,
        source: "SPECIAL",
      });
    } else {
      days.push({
        date,
        amount: weekend ? pricing.weekendAmount : pricing.amount,
        isWeekend: weekend,
        source: "BASE",
      });
    }
  }

  const rentalAmount = days.reduce((sum, d) => sum + d.amount, 0);
  return { days, rentalAmount };
}

export function composeTotal(input: {
  rentalAmount: number;
  securityDepositAmount: number;
  platformFeePct: number;
  gstRate: number;
  discountAmount: number;
}): {
  rentalAmount: number;
  platformFee: number;
  taxAmount: number;
  discountAmount: number;
  securityDepositAmount: number;
  totalAmount: number;
} {
  const { rentalAmount, securityDepositAmount, platformFeePct, gstRate, discountAmount } = input;
  const platformFee = Math.round((rentalAmount * platformFeePct) / 100);

  // Both the merchant's listed price and the platform fee are TAX-INCLUSIVE, so
  // GST is extracted from them, never added on top. The customer sees one all-in
  // number. `taxAmount` is therefore a reporting figure -- the GST already sitting
  // inside what they pay -- and adding it to the total would charge it twice.
  const payable = rentalAmount + platformFee - discountAmount;
  const taxAmount = extractTax(payable, gstRate);
  const totalAmount = payable + securityDepositAmount;

  return { rentalAmount, platformFee, taxAmount, discountAmount, securityDepositAmount, totalAmount };
}

/**
 * GST contained within a tax-inclusive amount: `A - A/(1+r)`, rearranged to stay in
 * integer paise. The refundable security deposit is not a supply and never passes
 * through here.
 */
export function extractTax(inclusiveAmount: number, gstRate: number): number {
  return Math.round((inclusiveAmount * gstRate) / (100 + gstRate));
}

export function refundForCancellation(
  scheduledPickupAt: Date,
  now: Date,
  totals: { rentalAmount: number; platformFee: number; taxAmount: number; securityDepositAmount: number },
): { refundAmount: number; penaltyAmount: number } {
  const hoursUntilPickup = (scheduledPickupAt.getTime() - now.getTime()) / (60 * 60 * 1000);
  const { rentalAmount, securityDepositAmount } = totals;

  let penaltyPct: number;
  if (hoursUntilPickup > 24) penaltyPct = 10;
  else if (hoursUntilPickup >= 2) penaltyPct = 50;
  else penaltyPct = 100;

  const penaltyAmount = Math.round((rentalAmount * penaltyPct) / 100);
  const refundAmount = rentalAmount - penaltyAmount + securityDepositAmount;

  return { refundAmount, penaltyAmount };
}
