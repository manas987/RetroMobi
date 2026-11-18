import type { Pool, PoolClient } from "pg";
import { generateOtpCode } from "./authCrypto.ts";
import { notify } from "./notify.ts";

export class HandoverCodeRecentlySentError extends Error {}

/**
 * Gives the order its handover code (once; an existing code is kept, so the
 * WhatsApp message and the order page never disagree) and queues it to the
 * customer on WhatsApp. Runs inside the caller's transaction.
 */
export async function issueHandoverCode(
  client: Pool | PoolClient,
  groupId: string,
  userId: string,
): Promise<string> {
  const { rows } = await client.query(
    `update booking_groups set handover_code = coalesce(handover_code, $2), updated_at = now()
      where id = $1 returning handover_code`,
    [groupId, generateOtpCode()],
  );
  const code = rows[0].handover_code as string;
  await notify(client, {
    recipientType: "CUSTOMER",
    recipientId: userId,
    channel: "WHATSAPP",
    template: "delivery_code",
    payload: { code, bookingGroupId: groupId },
  });
  return code;
}

/** Staff asked for the code to be sent again. One send a minute per order. */
export async function resendHandoverCode(pool: Pool, groupId: string, userId: string): Promise<void> {
  const { rows } = await pool.query(
    `select 1 from notifications
      where template = 'delivery_code' and payload->>'bookingGroupId' = $1
        and created_at > now() - interval '1 minute'
      limit 1`,
    [groupId],
  );
  if (rows.length > 0) throw new HandoverCodeRecentlySentError("the code was just sent, wait a minute");
  await issueHandoverCode(pool, groupId, userId);
}
