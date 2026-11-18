import { pool } from "./src/DB/client.ts";
import { app } from "./src/index.ts";
import { assertConfig } from "./src/lib/config.ts";
import { sweepExpiredHolds } from "./src/lib/holds.ts";
import { reconcilePendingPayments } from "./src/lib/paymentReconcile.ts";
import { sweepWithdrawals } from "./src/lib/wallet.ts";
import { cashfreeClient } from "./src/providers/cashfree.ts";
import { cashfreePayoutClient } from "./src/providers/cashfreePayout.ts";
import { sendPendingNotifications, sweepBookingReminders } from "./src/lib/notificationSweep.ts";
import { sweepVerificationPhotos } from "./src/lib/verificationRetention.ts";
import { sendEmail } from "./src/providers/emailSender.ts";
import { sendWhatsAppTemplate } from "./src/providers/whatsapp.ts";

// Before anything binds a port or touches the DB: a bad money/tax config does not
// fail, it quietly produces wrong numbers on real invoices.
for (const warning of assertConfig()) {
  console.warn(`[config] ${warning}`);
}

const port = Number(process.env.PORT ?? 3201);

app.listen(port, () => {
  console.log(`RetroMobi backend listening on :${port}`);
});

// An expired hold has to be reconciled by something: the exclusion constraint
// cannot do it itself, because an index predicate must be IMMUTABLE and now() is
// only STABLE. Deliberately not on the search path.
let sweeping = false;
setInterval(async () => {
  if (sweeping) return; // a slow sweep must not overlap itself
  sweeping = true;
  try {
    // BEFORE sweepExpiredHolds, and that ordering is load-bearing: the hold
    // sweep DELETES expired HOLD bookings, so a payment confirmed after it has
    // run has nothing left to confirm. Reconciling first gives a dropped
    // webhook its last chance.
    await reconcilePendingPayments(pool, cashfreeClient);
    await sweepExpiredHolds(pool);
    await sweepBookingReminders(pool);
    await sendPendingNotifications(pool, { whatsapp: sendWhatsAppTemplate, email: sendEmail });
    // Retention is a promise made in the consent text, so something has to
    // keep it. Small batch, same timer -- see lib/verificationRetention.ts.
    await sweepVerificationPhotos(pool);
    // Wallet withdrawals an admin chose to pay through Cashfree Payouts
    // (lib/wallet.ts). Booking earnings are credited to the shop wallet, not
    // transferred one by one.
    await sweepWithdrawals(pool, cashfreePayoutClient);
  } catch (e) {
    console.error("sweep failed", e);
  } finally {
    sweeping = false;
  }
}, 30_000);
