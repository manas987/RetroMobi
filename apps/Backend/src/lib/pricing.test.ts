import { describe, expect, test } from "bun:test";
import {
  composeTotal,
  countRentalDays,
  extractTax,
  priceRental,
  refundForCancellation,
} from "./pricing.ts";

// All money is integer PAISE. 45000 = Rs 450.00
const BASE = 45_000;
const WEEKEND = 60_000;
const DEPOSIT = 200_000;

const pricing = {
  amount: BASE,
  weekendAmount: WEEKEND,
  securityDepositAmount: DEPOSIT,
};

const d = (iso: string) => new Date(iso);

describe("countRentalDays", () => {
  // Calendar days from the pickup date up to but EXCLUDING the return date,
  // with a floor of 1 so a same-day round trip still bills a day.
  test("Friday to Monday is 3 days", () => {
    expect(countRentalDays(d("2026-10-09T09:00:00Z"), d("2026-10-12T09:00:00Z"))).toBe(3);
  });

  test("same-day round trip is 1 day", () => {
    expect(countRentalDays(d("2026-10-09T09:00:00Z"), d("2026-10-09T19:00:00Z"))).toBe(1);
  });

  test("overnight is 1 day", () => {
    expect(countRentalDays(d("2026-10-09T09:00:00Z"), d("2026-10-10T08:00:00Z"))).toBe(1);
  });
});

describe("priceRental", () => {
  test("weekend days bill at weekend_amount, weekdays at amount", () => {
    // 2026-10-09 is a Friday. Fri, Sat, Sun.
    const result = priceRental({
      pickupAt: d("2026-10-09T09:00:00Z"),
      returnAt: d("2026-10-12T09:00:00Z"),
      pricing,
      specialPricings: [],
    });

    expect(result.days).toHaveLength(3);
    expect(result.days[0]!.amount).toBe(BASE);
    expect(result.days[1]!.amount).toBe(WEEKEND);
    expect(result.days[2]!.amount).toBe(WEEKEND);
    expect(result.rentalAmount).toBe(BASE + WEEKEND + WEEKEND);
  });

  test("a special period replaces rates PER DAY, not for the whole booking", () => {
    // Special covers only Oct 11-12. Oct 9 (Fri) and Oct 10 (Sat) stay normal.
    const result = priceRental({
      pickupAt: d("2026-10-09T09:00:00Z"),
      returnAt: d("2026-10-12T09:00:00Z"),
      pricing,
      specialPricings: [
        {
          amount: 80_000,
          weekendAmount: 95_000,
          effectiveFrom: "2026-10-11",
          effectiveUntil: "2026-10-12",
        },
      ],
    });

    expect(result.days[0]!.amount).toBe(BASE); // Fri, normal
    expect(result.days[0]!.source).toBe("BASE");
    expect(result.days[1]!.amount).toBe(WEEKEND); // Sat, normal
    expect(result.days[2]!.amount).toBe(95_000); // Sun, special weekend rate
    expect(result.days[2]!.source).toBe("SPECIAL");
  });

  test("a booking clipping one special day does not price every day at special", () => {
    const normal = priceRental({
      pickupAt: d("2026-10-05T09:00:00Z"),
      returnAt: d("2026-10-08T09:00:00Z"),
      pricing,
      specialPricings: [],
    });
    const clipped = priceRental({
      pickupAt: d("2026-10-05T09:00:00Z"),
      returnAt: d("2026-10-08T09:00:00Z"),
      pricing,
      specialPricings: [
        {
          amount: 80_000,
          weekendAmount: 95_000,
          effectiveFrom: "2026-10-07",
          effectiveUntil: "2026-10-07",
        },
      ],
    });

    // Exactly one day differs, by exactly the rate difference.
    expect(clipped.rentalAmount - normal.rentalAmount).toBe(80_000 - BASE);
  });
});

describe("composeTotal", () => {
  test("matches the worked example in backend.md", () => {
    // Fri->Mon, rental Rs 1650, 10% fee, 18% GST, Rs 2000 deposit.
    const totals = composeTotal({
      rentalAmount: 165_000,
      securityDepositAmount: DEPOSIT,
      platformFeePct: 10,
      gstRate: 18,
      discountAmount: 0,
    });

    expect(totals.platformFee).toBe(16_500);
    // Prices are TAX-INCLUSIVE: the GST is already inside the 1650 + 165, so this
    // is the amount contained, not an amount added.
    expect(totals.taxAmount).toBe(27_686);
    expect(totals.totalAmount).toBe(165_000 + 16_500 + DEPOSIT);
  });

  // The whole point of inclusive pricing: the customer is quoted one number and
  // pays exactly it. Adding taxAmount on top would charge the GST twice.
  test("the total never adds tax on top of the listed price", () => {
    const totals = composeTotal({
      rentalAmount: 100_000,
      securityDepositAmount: 0,
      platformFeePct: 10,
      gstRate: 18,
      discountAmount: 0,
    });

    expect(totals.totalAmount).toBe(110_000);
    expect(totals.taxAmount).toBeGreaterThan(0);
    expect(totals.taxAmount).toBeLessThan(totals.totalAmount);
  });

  test("extracting then removing the tax returns the original amount", () => {
    for (const amount of [1, 99, 165_000, 33_333, 1_000_000]) {
      const tax = extractTax(amount, 18);
      const taxable = amount - tax;
      expect(taxable + tax).toBe(amount);
      // Taxable base grossed back up lands within a paise of where it started.
      expect(Math.abs(Math.round(taxable * 1.18) - amount)).toBeLessThanOrEqual(1);
    }
  });

  test("the deposit is never taxed", () => {
    const withDeposit = composeTotal({
      rentalAmount: 100_000,
      securityDepositAmount: 500_000,
      platformFeePct: 10,
      gstRate: 18,
      discountAmount: 0,
    });
    const withoutDeposit = composeTotal({
      rentalAmount: 100_000,
      securityDepositAmount: 0,
      platformFeePct: 10,
      gstRate: 18,
      discountAmount: 0,
    });

    expect(withDeposit.taxAmount).toBe(withoutDeposit.taxAmount);
  });

  test("a discount reduces the taxable amount", () => {
    const totals = composeTotal({
      rentalAmount: 100_000,
      securityDepositAmount: 0,
      platformFeePct: 10,
      gstRate: 18,
      discountAmount: 20_000,
    });

    expect(totals.discountAmount).toBe(20_000);
    expect(totals.totalAmount).toBeLessThan(
      composeTotal({
        rentalAmount: 100_000,
        securityDepositAmount: 0,
        platformFeePct: 10,
        gstRate: 18,
        discountAmount: 0,
      }).totalAmount,
    );
  });

  test("every amount is an integer - no float paise", () => {
    const totals = composeTotal({
      rentalAmount: 33_333,
      securityDepositAmount: 77_777,
      platformFeePct: 7,
      gstRate: 18,
      discountAmount: 11,
    });

    for (const value of Object.values(totals)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe("refundForCancellation", () => {
  const pickupAt = d("2026-10-20T09:00:00Z");
  const totals = { rentalAmount: 100_000, platformFee: 10_000, taxAmount: 19_800, securityDepositAmount: DEPOSIT };

  test("more than 24h before pickup refunds 90%", () => {
    const r = refundForCancellation(pickupAt, d("2026-10-18T09:00:00Z"), totals);
    expect(r.penaltyAmount).toBe(10_000); // 10% of rental
    expect(r.refundAmount).toBe(90_000 + DEPOSIT);
  });

  test("between 2 and 24h refunds 50%", () => {
    const r = refundForCancellation(pickupAt, d("2026-10-19T20:00:00Z"), totals);
    expect(r.penaltyAmount).toBe(50_000);
    expect(r.refundAmount).toBe(50_000 + DEPOSIT);
  });

  test("under 2h refunds nothing but still returns the deposit", () => {
    const r = refundForCancellation(pickupAt, d("2026-10-20T08:00:00Z"), totals);
    expect(r.penaltyAmount).toBe(100_000);
    expect(r.refundAmount).toBe(DEPOSIT);
  });

  test("after pickup time refunds nothing but still returns the deposit", () => {
    const r = refundForCancellation(pickupAt, d("2026-10-21T09:00:00Z"), totals);
    expect(r.refundAmount).toBe(DEPOSIT);
  });

  test("the deposit is returned in full at every tier", () => {
    const times = [
      d("2026-10-15T09:00:00Z"),
      d("2026-10-19T20:00:00Z"),
      d("2026-10-20T08:00:00Z"),
      d("2026-10-21T09:00:00Z"),
    ];
    for (const now of times) {
      expect(refundForCancellation(pickupAt, now, totals).refundAmount).toBeGreaterThanOrEqual(DEPOSIT);
    }
  });
});

// RetroMobi is India-only. "Calendar day" and "weekend" must be resolved in IST
// (UTC+5:30), never UTC — otherwise an evening pickup is priced against the
// wrong date and, on a Friday night, misses the weekend rate entirely.
describe("timezone (IST)", () => {
  test("a day is the IST calendar day, not the UTC one", () => {
    // 2026-10-09T20:00Z is 01:30 IST on Saturday 2026-10-10.
    const result = priceRental({
      pickupAt: d("2026-10-09T20:00:00Z"),
      returnAt: d("2026-10-10T20:00:00Z"),
      pricing,
      specialPricings: [],
    });

    expect(result.days).toHaveLength(1);
    expect(result.days[0]!.date).toBe("2026-10-10");
  });

  test("a Friday-night UTC pickup is a Saturday in IST and bills weekend rate", () => {
    const result = priceRental({
      pickupAt: d("2026-10-09T20:00:00Z"), // Fri in UTC, Sat in IST
      returnAt: d("2026-10-10T20:00:00Z"),
      pricing,
      specialPricings: [],
    });

    expect(result.days[0]!.isWeekend).toBe(true);
    expect(result.days[0]!.amount).toBe(WEEKEND);
  });

  test("countRentalDays uses IST day boundaries", () => {
    // 18:00Z -> 23:30 IST same day; 19:00Z next day -> 00:30 IST, two days later
    // in IST terms. Both are inside one UTC day pair but span two IST dates.
    expect(countRentalDays(d("2026-10-09T18:00:00Z"), d("2026-10-10T19:00:00Z"))).toBe(2);
  });

  test("a special period boundary is evaluated in IST", () => {
    // Special starts 2026-10-10. A 2026-10-09T20:00Z pickup is already Oct 10 IST.
    const result = priceRental({
      pickupAt: d("2026-10-09T20:00:00Z"),
      returnAt: d("2026-10-10T20:00:00Z"),
      pricing,
      specialPricings: [
        {
          amount: 80_000,
          weekendAmount: 95_000,
          effectiveFrom: "2026-10-10",
          effectiveUntil: "2026-10-10",
        },
      ],
    });

    expect(result.days[0]!.source).toBe("SPECIAL");
    expect(result.days[0]!.amount).toBe(95_000); // Saturday in IST
  });
});
