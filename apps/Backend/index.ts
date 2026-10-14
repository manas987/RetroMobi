import { pool } from "./src/DB/client.ts";
import { app } from "./src/index.ts";
import { assertConfig } from "./src/lib/config.ts";
import { sweepExpiredHolds } from "./src/lib/holds.ts";
import { sendPendingNotifications, sweepBookingReminders } from "./src/lib/notificationSweep.ts";
import { sendEmail } from "./src/providers/emailSender.ts";
import { sendSms } from "./src/providers/smsSender.ts";

// Before anything binds a port or touches the DB: a bad money/tax config does not
// fail, it quietly produces wrong numbers on real invoices.
for (const warning of assertConfig()) {
  console.warn(`[config] ${warning}`);
}

const port = Number(process.env.PORT ?? 3000);

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
    await sweepExpiredHolds(pool);
    await sweepBookingReminders(pool);
    await sendPendingNotifications(pool, { sms: sendSms, email: sendEmail });
  } catch (e) {
    console.error("sweep failed", e);
  } finally {
    sweeping = false;
  }
}, 30_000);
