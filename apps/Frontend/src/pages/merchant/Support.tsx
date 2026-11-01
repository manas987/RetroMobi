import { useEffect, useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { usePortalQuery, portalFetch, PortalApiError, type Row } from "../../lib/portal";
import { StatusPill } from "../../components/DataTable";
import { ErrorBox, SubmitButton, TextField } from "../../components/AuthFormBits";
import { uploadFile, UploadFailedError } from "../../lib/upload";
import { enumLabel } from "../../lib/format";

type TriageStep = "closed" | "ask-booking" | "pick-booking" | "compose";

function SupportBody() {
  const { token, shopId } = useMerchantShop();
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error } = usePortalQuery<{ tickets: Row[] }>("merchant", `/tickets?r=${reloadKey}`, token);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [step, setStep] = useState<TriageStep>("closed");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1">Support</h1>
      <p className="text-sm text-ink-3 mb-5">Disputes, deposit claims and anything else raised with RetroMobi.</p>

      {error && <ErrorBox text={error} />}

      {activeTicketId ? (
        <TicketChat
          ticketId={activeTicketId}
          token={token}
          onBack={() => {
            setActiveTicketId(null);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : (
        <>
          {step === "closed" ? (
            <button
              type="button"
              onClick={() => setStep("ask-booking")}
              className="w-full h-11 rounded-row bg-ink text-surface font-semibold text-sm mb-6 hover:bg-ink-2 transition-colors"
            >
              Start a new conversation
            </button>
          ) : (
            <NewTicket
              step={step}
              setStep={setStep}
              token={token}
              shopId={shopId}
              onCreated={(id) => {
                setStep("closed");
                setActiveTicketId(id);
              }}
            />
          )}

          {!error && data === null && <p className="text-sm text-ink-3">Loading…</p>}
          {!error && data && data.tickets.length === 0 && (
            <p className="text-sm text-ink-3 py-10 text-center bg-surface-2 rounded-panel">No tickets yet.</p>
          )}
          {!error && data && data.tickets.length > 0 && (
            <div className="flex flex-col gap-2">
              {data.tickets.map((t) => (
                <button
                  key={String(t.id)}
                  type="button"
                  onClick={() => setActiveTicketId(String(t.id))}
                  className="flex items-center justify-between gap-3 rounded-row border border-line px-4 py-3 text-left hover:bg-surface-2 transition-colors"
                >
                  <span className="text-sm text-ink font-medium">
                    {t.subject ? String(t.subject) : t.category ? enumLabel(t.category) : "Conversation"}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-ink-4">{fmtDate(t.created_at)}</span>
                    <StatusPill value={t.status} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function fmtDate(iso: unknown): string {
  if (typeof iso !== "string") return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function NewTicket({
  step,
  setStep,
  token,
  shopId,
  onCreated,
}: {
  step: TriageStep;
  setStep: (s: TriageStep) => void;
  token: string;
  shopId: string | null;
  onCreated: (ticketId: string) => void;
}) {
  const { data: bookingsRes } = usePortalQuery<{ bookings: Row[] }>(
    "merchant",
    step === "pick-booking" && shopId ? `/shops/${shopId}/bookings` : null,
    token,
  );
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [firstMessage, setFirstMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(category: "BOOKING" | "APP_HELP" | "OTHER") {
    setError(null);
    setBusy(true);
    try {
      const ticket = await portalFetch<{ id: string }>("merchant", "/tickets", {
        method: "POST",
        token,
        body: { bookingId: category === "BOOKING" ? bookingId! : undefined, firstMessage: firstMessage || undefined },
      });
      await portalFetch("merchant", `/tickets/${ticket.id}/category`, {
        method: "POST",
        token,
        body: category === "BOOKING" ? { category, bookingId } : { category },
      });
      onCreated(ticket.id);
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't open that ticket.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-panel border border-line p-5 mb-6">
      {error && <ErrorBox text={error} />}

      {step === "ask-booking" && (
        <>
          <p className="text-sm font-medium text-ink mb-3">Is this about a booking?</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => setStep("pick-booking")} className="h-10 px-4 rounded-row border border-line-strong text-sm font-medium hover:bg-surface-3">
              Yes, a booking
            </button>
            <button type="button" onClick={() => setStep("compose")} className="h-10 px-4 rounded-row border border-line-strong text-sm font-medium hover:bg-surface-3">
              No, something else
            </button>
          </div>
        </>
      )}

      {step === "pick-booking" && (
        <>
          <p className="text-sm font-medium text-ink mb-3">Which booking?</p>
          {bookingsRes === null && <p className="text-sm text-ink-3">Loading…</p>}
          {bookingsRes && bookingsRes.bookings.length === 0 && <p className="text-sm text-ink-3">No bookings to pick from.</p>}
          <div className="flex flex-col gap-2 mb-4">
            {bookingsRes?.bookings.map((b) => (
              <label key={String(b.id)} className="flex items-center gap-3 rounded-row border border-line-strong px-3 py-2.5 cursor-pointer has-[:checked]:border-ink">
                <input type="radio" name="booking" checked={bookingId === b.id} onChange={() => setBookingId(String(b.id))} />
                <span className="text-sm text-ink">
                  {String(b.make ?? "")} {String(b.model ?? "")} · {enumLabel(b.status)} —{" "}
                  {new Date(String(b.scheduled_pickup_at)).toLocaleDateString("en-IN")}
                </span>
              </label>
            ))}
          </div>
          {bookingId && (
            <>
              <TextField label="What's going on? (optional)" value={firstMessage} onChange={setFirstMessage} />
              <SubmitButton busy={busy} onClick={() => create("BOOKING")}>
                Start conversation
              </SubmitButton>
            </>
          )}
        </>
      )}

      {step === "compose" && (
        <>
          <p className="text-sm font-medium text-ink mb-3">What's it about?</p>
          <div className="flex gap-3 mb-4">
            <button type="button" onClick={() => create("APP_HELP")} disabled={busy} className="h-10 px-4 rounded-row border border-line-strong text-sm font-medium hover:bg-surface-3 disabled:opacity-40">
              Using the app
            </button>
            <button type="button" onClick={() => create("OTHER")} disabled={busy} className="h-10 px-4 rounded-row border border-line-strong text-sm font-medium hover:bg-surface-3 disabled:opacity-40">
              Something else
            </button>
          </div>
          <TextField label="Tell us more (optional)" value={firstMessage} onChange={setFirstMessage} />
        </>
      )}
    </div>
  );
}

function TicketChat({ ticketId, token, onBack }: { ticketId: string; token: string; onBack: () => void }) {
  // Without this the chat was a bare message stream — no subject, category,
  // status or linked booking anywhere on screen.
  const { data: ticket } = usePortalQuery<Row>("merchant", `/tickets/${ticketId}`, token);
  const [messages, setMessages] = useState<Row[] | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const sinceId = messages && messages.length > 0 ? String(messages[messages.length - 1]!.id) : undefined;
        const res = await portalFetch<{ messages: Row[] }>("merchant", `/tickets/${ticketId}/messages${sinceId ? `?since=${sinceId}` : ""}`, { token });
        if (cancelled) return;
        if (sinceId) {
          if (res.messages.length > 0) setMessages((prev) => [...(prev ?? []), ...res.messages]);
        } else {
          setMessages(res.messages);
        }
      } catch {
        // polling failure is silent -- the next tick retries
      } finally {
        if (!cancelled) timer = setTimeout(poll, 4000);
      }
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages?.length]);

  async function send() {
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      const msg = await portalFetch<Row>("merchant", `/tickets/${ticketId}/messages`, { method: "POST", token, body: { body } });
      setMessages((prev) => [...(prev ?? []), msg]);
      setBody("");
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't send that.");
    } finally {
      setSending(false);
    }
  }

  /**
   * An attachment hangs off a message, so there has to be one first — the
   * file is sent as its own message carrying the caption, or a bare "Attached
   * a file" when there is nothing typed. This page exists for deposit-claim
   * disputes, where the photo of the damage is the whole argument.
   */
  async function attach(file: File) {
    setSending(true);
    setError(null);
    try {
      const msg = await portalFetch<Row>("merchant", `/tickets/${ticketId}/messages`, {
        method: "POST",
        token,
        body: { body: body.trim() || `Attached ${file.name}` },
      });
      await uploadFile({
        portal: "merchant",
        token,
        file,
        presignPath: `/tickets/${ticketId}/messages/${String(msg.id)}/attachments/upload`,
        confirmPath: `/tickets/${ticketId}/messages/${String(msg.id)}/attachments/confirm`,
        confirmBody: { fileName: file.name, sizeBytes: file.size },
      });
      setMessages((prev) => [...(prev ?? []), msg]);
      setBody("");
    } catch (err) {
      if (err instanceof UploadFailedError) {
        setError(`${err.message} Your message was sent without the file.`);
      } else {
        setError(err instanceof PortalApiError ? err.message : "Couldn't attach that file.");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-panel border border-line flex flex-col h-[520px]">
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-line">
        <div className="min-w-0">
          <button type="button" onClick={onBack} className="text-sm text-ink-3 hover:text-ink">
            ← All conversations
          </button>
          {ticket && (
            <div className="mt-1">
              <p className="text-sm font-semibold text-ink truncate">
                {ticket.subject ? String(ticket.subject) : enumLabel(ticket.category)}
              </p>
              <p className="text-xs text-ink-3">
                {ticket.category ? enumLabel(ticket.category) : "Uncategorised"}
                {ticket.booking_id ? ` · booking ${String(ticket.booking_id).slice(0, 8)}` : ""}
              </p>
            </div>
          )}
        </div>
        {ticket && <StatusPill value={ticket.status} />}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {messages === null && <p className="text-sm text-ink-3">Loading…</p>}
        {messages !== null && messages.length === 0 && (
          <p className="text-sm text-ink-3 text-center my-auto">
            No messages yet — say what's happened and support will pick it up.
          </p>
        )}
        {messages?.map((m) => <MessageBubble key={String(m.id)} message={m} />)}
        <div ref={bottomRef} />
      </div>

      {error && <div className="px-4"><ErrorBox text={error} /></div>}

      <div className="flex items-center gap-2 p-3 border-t border-line">
        <label
          className={`shrink-0 text-ink-3 hover:text-ink ${sending ? "opacity-40" : "cursor-pointer"}`}
          title="Attach a photo or document"
        >
          <Paperclip className="h-4 w-4" />
          <input
            type="file"
            accept="image/*,application/pdf"
            disabled={sending}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) attach(file);
              e.target.value = "";
            }}
          />
          <span className="sr-only">Attach a file</span>
        </label>
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Type a message…"
          className="flex-1 rounded-row border border-line-strong px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <button
          type="button"
          disabled={sending || !body.trim()}
          onClick={send}
          className="h-10 px-4 rounded-row bg-ink text-surface font-medium text-sm disabled:opacity-40 hover:bg-ink-2 transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ message: m }: { message: Row }) {
  const senderType = String(m.sender_type ?? "");
  const isSystem = senderType === "SYSTEM";
  const isMine = senderType === "MERCHANT";

  if (isSystem) {
    return <p className="text-xs text-ink-4 text-center my-1">{String(m.body)}</p>;
  }

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-row px-3 py-2 text-sm ${isMine ? "bg-ink text-surface" : "bg-surface-2 text-ink"}`}>
        {!isMine && (
          <p className="text-[10px] uppercase tracking-wide opacity-60 mb-0.5">{enumLabel(senderType)}</p>
        )}
        {String(m.body)}
      </div>
    </div>
  );
}

export function MerchantSupport() {
  return (
    <MerchantLayout>
      <SupportBody />
    </MerchantLayout>
  );
}
