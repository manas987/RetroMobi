export class EmailDeliveryError extends Error {}

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_ADDRESS;
  if (!apiKey || !fromAddress) {
    throw new Error("RESEND_API_KEY and RESEND_FROM_ADDRESS must both be set");
  }
  return { apiKey, fromAddress };
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const { apiKey, fromAddress } = getResendConfig();

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: fromAddress, to, subject, html }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new EmailDeliveryError(`Resend send failed (${response.status}): ${detail}`);
  }
}

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  await sendEmail(
    email,
    "Your RetroMobi verification code",
    `<p>Your RetroMobi verification code is <b>${code}</b>. It expires in 5 minutes.</p>`,
  );
}
