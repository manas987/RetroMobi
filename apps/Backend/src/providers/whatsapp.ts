import { devOtpEnabled } from "../lib/authCrypto.ts";

export class WhatsAppDeliveryError extends Error {}

// Pinned, not "latest": Meta changes payloads between Graph versions. v21.0 is
// available until 2027-01-21 (developers.facebook.com/docs/graph-api/changelog),
// so bump this before then.
const GRAPH_URL = "https://graph.facebook.com/v21.0";

export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_OTP_TEMPLATE);
}

// Every template (OTP and notifications) is created in this one language in
// Meta Business Manager -- a template is approved per language, and asking
// for a language it wasn't created in fails the send.
function language(): string {
  return process.env.WHATSAPP_OTP_LANGUAGE || "en_US";
}

export interface TemplateMessage {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "template";
  template: {
    name: string;
    language: { code: string };
    components: Array<Record<string, unknown>>;
  };
}

// Meta wants the number as digits with the country code; E.164's "+" is dropped.
function templateMessage(to: string, name: string, components: TemplateMessage["template"]["components"]): TemplateMessage {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to.replace(/^\+/, ""),
    type: "template",
    template: { name, language: { code: language() }, components },
  };
}

// Authentication templates with a copy-code button take the code twice: once
// for the body's {{1}}, once as the button's URL parameter (that is how Meta
// models the copy-code button, sub_type "url" at index 0).
// WHATSAPP_OTP_TEXT is for a template with a second body slot ({{code}} is for
// {{text}}): set it to that word, e.g. "login". The body must carry exactly as
// many values as the template has slots, or Meta fails the send (132000).
export function otpMessage(to: string, code: string): TemplateMessage {
  const text = process.env.WHATSAPP_OTP_TEXT?.trim();
  return templateMessage(to, process.env.WHATSAPP_OTP_TEMPLATE ?? "", [
    { type: "body", parameters: [{ type: "text", text: code }, ...(text ? [{ type: "text", text }] : [])] },
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
  ]);
}

// copyCode: the template has a "Copy code" button, which Meta models as a url
// button that takes the code again.
export function notificationMessage(to: string, template: string, params: string[], copyCode?: string): TemplateMessage {
  return templateMessage(
    to,
    template,
    [
      ...(params.length ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] : []),
      ...(copyCode ? [{ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: copyCode }] }] : []),
    ],
  );
}

// ponytail: plain fetch against the Cloud API, no SDK -- one authenticated POST.
async function send(message: TemplateMessage): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    console.log(`[dev-fallback] WhatsApp not configured — would send to ${message.to}: ${JSON.stringify(message.template)}`);
    return;
  }
  // Local testing with a real token: only these numbers get real messages, so
  // seeded test phones (someone's real numbers) never do. Ignored in production.
  const onlyTo = process.env.WHATSAPP_ONLY_TO?.trim();
  if (onlyTo && process.env.NODE_ENV !== "production" && !onlyTo.split(",").map((n) => n.trim().replace(/^\+/, "")).includes(message.to)) {
    console.log(`[dev-fallback] ${message.to} not in WHATSAPP_ONLY_TO — would send: ${JSON.stringify(message.template)}`);
    return;
  }

  const response = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new WhatsAppDeliveryError(`WhatsApp send failed (${response.status}): ${detail}`);
  }
}

export async function sendOtpWhatsApp(phone: string, code: string): Promise<void> {
  try {
    await send(otpMessage(phone, code));
  } catch (err) {
    // Local only: with a master code the login can go on even if WhatsApp is down.
    if (!(err instanceof WhatsAppDeliveryError && devOtpEnabled())) throw err;
    console.log(`[dev-fallback] ${err.message} -- continuing, DEV_OTP_CODE still logs in`);
  }
}

export function sendWhatsAppTemplate(to: string, template: string, params: string[], copyCode?: string): Promise<void> {
  return send(notificationMessage(to, template, params, copyCode));
}
