export class SmsDeliveryError extends Error {}

function getTwilioConfig(): { accountSid: string; authToken: string; fromNumber: string } | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return null;
  return { accountSid, authToken, fromNumber };
}

// ponytail: plain fetch against Twilio's REST API, not the `twilio` SDK — a
// single authenticated POST doesn't need a client library's extra surface
// (retries/helpers we don't use yet). Add the SDK if we start needing more
// than send-a-message (e.g. delivery-status webhooks, number lookup).
export async function sendOtpSms(phone: string, code: string): Promise<void> {
  await sendSms(phone, `Your RetroMobi verification code is ${code}. It expires in 5 minutes.`);
}

export async function sendSms(to: string, body: string): Promise<void> {
  const config = getTwilioConfig();
  if (!config) {
    console.log(`[dev-fallback] sendSms not configured — would send to ${to}: ${body}`);
    return;
  }
  const { accountSid, authToken, fromNumber } = config;

  const formBody = new URLSearchParams({
    To: to,
    From: fromNumber,
    Body: body,
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody,
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new SmsDeliveryError(`Twilio send failed (${response.status}): ${detail}`);
  }
}
