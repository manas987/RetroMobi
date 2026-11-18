export type Ticket = {
  id: string;
  subject: string | null;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED";
  category: string | null;
  created_at: string;
  resolution: string | null;
  booking_id: string | null;
  booking_make: string | null;
  booking_model: string | null;
  booking_shop: string | null;
  first_message: string | null;
  latest_message: string | null;
  latest_sender_type: string | null;
  latest_is_mine: boolean | null;
  latest_message_at: string | null;
};
export type Attachment = { id: string; file_name: string | null; size_bytes?: number | null };
export type Message = { id: string; sender_type: string; sender_id: string; body: string | null; created_at: string; attachments: Attachment[] };

export function ticketTitle(ticket: Ticket) {
  const title = ticket.booking_id
    ? ticket.subject?.trim() || [ticket.booking_make, ticket.booking_model].filter(Boolean).join(" ") || "Booking support"
    : ticket.first_message?.trim() || ticket.subject?.trim() || "Support conversation";
  const line = title.replace(/\s+/g, " ");
  return line.length > 96 ? `${line.slice(0, 95).trimEnd()}…` : line;
}

export function senderLabel(type: string | null, mine: boolean | null) {
  return mine ? "You" : type === "ADMIN" || type === "SYSTEM" ? "RetroMobi Support" : type === "MERCHANT" ? "Rental shop" : "Customer";
}

export function messageCaption({ body, attachments }: Message) {
  const text = body?.trim() ?? "";
  return attachments.some(({ file_name }) => text === `📎 ${file_name ?? "File"}` || text === `Attachment · ${file_name ?? "File"}`) ? "" : text;
}

export function canPreviewImage(attachment: Attachment) {
  // Keep full-resolution uploads off the chat's initial download path.
  return /\.(jpe?g|png|webp)$/i.test(attachment.file_name ?? "") && (attachment.size_bytes ?? 0) <= 8 * 1024 * 1024;
}
