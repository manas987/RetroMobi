export class SmsDeliveryError extends Error {}

function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER must all be set");
  }
  return { accountSid, authToken, fromNumber };
}

// ponytail: plain fetch against Twilio's REST API, not the `twilio` SDK — a
// single authenticated POST doesn't need a client library's extra surface
// (retries/helpers we don't use yet). Add the SDK if we start needing more
// than send-a-message (e.g. delivery-status webhooks, number lookup).
export async function sendOtpSms(phone: string, code: string): Promise<void> {
  const { accountSid, authToken, fromNumber } = getTwilioConfig();

  const body = new URLSearchParams({
    To: phone,
    From: fromNumber,
    Body: `Your RetroMobi verification code is ${code}. It expires in 5 minutes.`,
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new SmsDeliveryError(`Twilio send failed (${response.status}): ${detail}`);
  }
}
