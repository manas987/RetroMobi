import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, MessageCircle, Paperclip, Plus, Search, Send, X } from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { Header } from "../../components/Header";
import { Footer } from "../../components/Footer";
import { Modal } from "../../components/Modal";
import { StatusPill } from "../../components/DataTable";
import { EmptyState, LoadingSkeleton, SkeletonBlock, SkeletonRows } from "../../components/ContentFeedback";
import { SearchFailure } from "../../components/SearchFeedback";
import { decodeJwtSubject, portalFetch, usePortalSession, type Row } from "../../lib/portal";
import { enumLabel, reviewTimeLabel } from "../../lib/format";
import { uploadFile } from "../../lib/upload";
import { useMediaQuery } from "../../lib/useMediaQuery";

type Conversation = {
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
  booking_pickup_at: string | null;
  first_message: string | null;
  latest_message: string | null;
  latest_sender_type: string | null;
  latest_is_mine: boolean | null;
  latest_message_at: string | null;
};
type Attachment = { id: string; file_name: string | null };
type Message = { id: string; sender_type: string; sender_id: string; body: string | null; created_at: string; attachments: Attachment[] };

const supportPath = "/account/support";
const actionClass = "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-row bg-amber px-4 text-sm font-semibold text-on-amber transition-colors hover:brightness-95 disabled:opacity-50";
const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const timeFormat = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const conversationLink = (id: string) => `${supportPath}?${new URLSearchParams({ ticket: id })}`;

function dateLabel(date: string) {
  return dateFormat.format(new Date(date));
}

function conversationTitle(ticket: Conversation) {
  const vehicle = [ticket.booking_make, ticket.booking_model].filter(Boolean).join(" ");
  const title = ticket.booking_id
    ? ticket.subject?.trim() || vehicle || "Booking support"
    : ticket.first_message?.trim() || ticket.subject?.trim() || "Support conversation";
  const line = title.replace(/\s+/g, " ");
  return line.length > 96 ? `${line.slice(0, 95).trimEnd()}…` : line;
}

function senderLabel(type: string | null, mine: boolean | null) {
  if (mine) return "You";
  return type === "ADMIN" ? "RetroMobi Support" : type === "MERCHANT" ? "Rental shop" : "Customer";
}

export function CustomerSupport() {
  const { session } = usePortalSession("user");
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!session) navigate(`/login?next=${encodeURIComponent(supportPath)}`);
  }, [session, navigate]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      {session ? <SupportInbox key={decodeJwtSubject(session.accessToken)} token={session.accessToken} /> : <main className="flex-1" />}
      <Footer />
    </div>
  );
}

function SupportInbox({ token }: { token: string }) {
  const search = useSearch();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const accountId = decodeJwtSubject(token);
  const inboxKey = ["customer-support", accountId];
  const inbox = useQuery({
    queryKey: inboxKey,
    queryFn: () => portalFetch<{ tickets: Conversation[] }>("user", "/tickets", { token }),
    refetchInterval: 10_000,
  });
  const [composing, setComposing] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const [term, setTerm] = useState("");
  const selectedId = new URLSearchParams(search).get("ticket");
  const desktop = useMediaQuery("(min-width: 1024px)");
  useEffect(() => {
    if (selectedId && !desktop) window.scrollTo({ top: 0, behavior: "instant" });
  }, [selectedId, desktop]);
  const tickets = inbox.data?.tickets ?? [];
  const needle = term.trim().toLowerCase();
  const visible = tickets.filter((ticket) =>
    (filter === "all" || (filter === "resolved") === (ticket.status === "RESOLVED")) &&
    [conversationTitle(ticket), ticket.booking_shop, ticket.booking_id, ticket.latest_message]
      .some((text) => text?.toLowerCase().includes(needle)),
  );
  const selected = selectedId ? tickets.find((ticket) => ticket.id === selectedId) : desktop ? visible[0] : undefined;

  return (
    <main className="flex-1 w-full max-w-[1160px] mx-auto px-4 py-7 sm:px-6 sm:py-10">
      <div className={`mb-5 flex-wrap items-end justify-between gap-3 sm:mb-6 lg:flex ${selectedId ? "hidden" : "flex"}`}>
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-ink">Support</h1>
          <p className="mt-1 text-sm text-ink-2">Get help with a booking or ask us a question.</p>
        </div>
        <button type="button" onClick={() => setComposing(true)} className={actionClass}>
          <Plus size={17} aria-hidden="true" /> New conversation
        </button>
      </div>

      <div className="overflow-hidden rounded-panel border border-line bg-surface lg:grid lg:h-[min(690px,calc(100dvh-11.5rem))] lg:min-h-[490px] lg:grid-cols-[minmax(320px,0.82fr)_minmax(0,1.4fr)]">
        <section aria-label="Conversations" className={`min-w-0 min-h-0 flex-col lg:flex lg:border-r lg:border-line ${selectedId ? "hidden" : "flex"}`}>
          <div className="shrink-0 border-b border-line px-4 py-4 sm:px-5">
            <h2 className="text-base font-semibold text-ink">Conversations</h2>
            {tickets.length > 0 && (
              <>
                <label className="mt-3 flex items-center gap-2 rounded-row border border-line bg-surface px-3 focus-within:border-ink">
                  <Search size={16} className="shrink-0 text-ink-2" aria-hidden="true" />
                  <input aria-label="Search conversations" value={term} onChange={(e) => setTerm(e.target.value)}
                    placeholder="Search conversations" className="h-9 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3" />
                </label>
                <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Conversation status">
                  {(["all", "open", "resolved"] as const).map((value) => (
                    <button type="button" key={value} onClick={() => setFilter(value)} aria-pressed={filter === value}
                      className={`min-h-8 rounded-full px-3 text-xs font-medium transition-colors ${filter === value ? "bg-ink text-surface" : "bg-surface-2 text-ink-2 hover:bg-surface-3"}`}>
                      {enumLabel(value)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="min-h-0 flex-1 lg:overflow-y-auto">
            {inbox.isPending && <div className="p-4"><SkeletonRows label="Loading conversations" detail count={3} /></div>}
            {inbox.isError && !inbox.data && <div className="p-4"><SearchFailure title="Couldn’t load conversations" onRetry={() => void inbox.refetch()} retrying={inbox.isFetching} /></div>}
            {inbox.data && visible.length === 0 && (
              <div className="p-4">
                <EmptyState title={tickets.length ? "No matching conversations" : "No conversations yet"}
                  description={tickets.length ? "Try another search or status." : "Start a conversation when you need help."} />
              </div>
            )}
            <ul className="divide-y divide-line">
              {visible.map((ticket) => {
                const current = selected?.id === ticket.id;
                return (
                  <li key={ticket.id}>
                    <Link href={conversationLink(ticket.id)} aria-current={selectedId === ticket.id ? "page" : undefined}
                      className={`flex min-w-0 items-center gap-2 border-l-2 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 sm:px-5 ${current ? "border-transparent lg:border-amber lg:bg-surface-2" : "border-transparent"}`}>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 break-words text-sm font-semibold leading-snug text-ink">{conversationTitle(ticket)}</p>
                        {ticket.booking_shop && <p className="mt-0.5 truncate text-xs text-ink-2">{ticket.booking_shop}</p>}
                        {ticket.latest_message && (
                          <p className="mt-1 truncate text-xs text-ink-2">{senderLabel(ticket.latest_sender_type, ticket.latest_is_mine)} · {ticket.latest_message}</p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <time dateTime={ticket.created_at} className="text-xs text-ink-2">Started {dateLabel(ticket.created_at)}</time>
                          <StatusPill value={ticket.status} />
                        </div>
                      </div>
                      <ChevronRight size={16} className="shrink-0 text-ink-3" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <div className={`min-h-0 min-w-0 flex-col lg:flex ${selectedId ? "flex" : "hidden"}`}>
          {selectedId && (
            <Link href={supportPath} className="flex min-h-11 items-center gap-2 border-b border-line px-4 text-sm font-medium text-ink-2 hover:text-ink lg:hidden">
              <ArrowLeft size={16} aria-hidden="true" /> All conversations
            </Link>
          )}
          {selected ? (
            <TicketChat key={selected.id} ticket={selected} token={token} accountId={accountId}
              onChanged={() => void queryClient.invalidateQueries({ queryKey: inboxKey })} />
          ) : (
            <div className="flex min-h-52 flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-ink-2">
              <MessageCircle size={25} strokeWidth={1.5} aria-hidden="true" />
              <p className="text-sm font-semibold text-ink">
                {inbox.isPending ? "Loading conversations…" : selectedId && inbox.isFetching ? "Opening conversation…" :
                  inbox.isError ? "Couldn’t load this conversation" : selectedId ? "Conversation unavailable" : "No conversation selected"}
              </p>
              {inbox.isError ? <button type="button" onClick={() => void inbox.refetch()} className="text-sm underline">Try again</button> :
                selectedId && !inbox.isFetching ? <Link href={supportPath} className="text-sm underline">Back to conversations</Link> : null}
            </div>
          )}
        </div>
      </div>
      {composing && (
        <NewConversation token={token} accountId={accountId} onClose={() => setComposing(false)} onCreated={async (id) => {
          setComposing(false);
          navigate(conversationLink(id));
          // The id may be an existing chat about that booking, with the new message appended.
          await queryClient.invalidateQueries({ queryKey: ["support-messages", accountId, id] });
          await queryClient.invalidateQueries({ queryKey: inboxKey });
        }} />
      )}
    </main>
  );
}

function NewConversation({ token, accountId, onClose, onCreated }: {
  token: string; accountId: string | null; onClose: () => void; onCreated: (id: string) => void;
}) {
  const [category, setCategory] = useState<"BOOKING" | "APP_HELP" | "OTHER">("BOOKING");
  const [bookingId, setBookingId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bookings = useQuery({
    queryKey: ["support-bookings", accountId],
    queryFn: () => portalFetch<{ bookings: Row[] }>("user", "/bookings", { token }),
    enabled: category === "BOOKING",
  });

  async function send() {
    setBusy(true);
    setError("");
    try {
      const { id } = await portalFetch<{ id: string }>("user", "/tickets", {
        method: "POST", token,
        body: { category, bookingId: category === "BOOKING" ? bookingId : undefined, firstMessage: message.trim() },
      });
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t start the conversation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title="New conversation" onClose={() => { if (!busy) onClose(); }}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!busy && message.trim() && (category !== "BOOKING" || bookingId)) void send(); }}>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">What do you need help with?</legend>
          <div className="flex flex-wrap gap-2">
            {([
              ["BOOKING", "A booking"], ["APP_HELP", "Using the app"], ["OTHER", "Something else"],
            ] as const).map(([value, label]) => (
              <button type="button" key={value} disabled={busy} aria-pressed={category === value}
                onClick={() => setCategory(value)}
                className={`min-h-9 rounded-full border px-3 text-xs font-medium ${category === value ? "border-ink bg-ink text-surface" : "border-line-strong text-ink hover:bg-surface-2"}`}>
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        {category === "BOOKING" && (
          <div>
            {bookings.isPending && <SkeletonRows label="Loading bookings" count={1} detail />}
            {bookings.isError && !bookings.data && <SearchFailure title="Couldn’t load bookings" onRetry={() => void bookings.refetch()} retrying={bookings.isFetching} />}
            {bookings.data?.bookings.length === 0 && (
              <div className="rounded-row bg-surface-2 p-3 text-sm text-ink-2">
                <p>No bookings to link.</p>
                <button type="button" className="mt-1 font-medium underline" onClick={() => setCategory("OTHER")}>Continue without a booking</button>
              </div>
            )}
            {!!bookings.data?.bookings.length && (
              <label className="block text-sm font-medium text-ink">Booking
                <select value={bookingId} onChange={(e) => setBookingId(e.target.value)} required disabled={busy}
                  className="mt-1.5 block min-h-10 w-full rounded-row border border-line-strong bg-surface px-2 text-sm font-normal text-ink">
                  <option value="">Choose a booking</option>
                  {bookings.data.bookings.map((booking) => (
                    <option key={String(booking.id)} value={String(booking.id)}>
                      {[booking.make, booking.model].filter(Boolean).join(" ")} · {String(booking.shop_name)} · {dateLabel(String(booking.scheduled_pickup_at))}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        <label className="block text-sm font-medium text-ink">Your message
          <textarea required value={message} onChange={(e) => setMessage(e.target.value)} rows={4} disabled={busy}
            placeholder="Tell us what happened and what you need help with."
            className="mt-1.5 block w-full resize-y rounded-row border border-line-strong px-3 py-2 text-sm font-normal text-ink" />
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end">
          <button type="submit" className={actionClass} disabled={busy || !message.trim() || (category === "BOOKING" && !bookingId)}>
            {busy ? "Sending…" : "Send message"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TicketChat({ ticket, token, accountId, onChanged }: {
  ticket: Conversation; token: string; accountId: string | null; onChanged: () => void;
}) {
  const { id } = ticket;
  const queryClient = useQueryClient();
  const messagesKey = ["support-messages", accountId, id];
  const messages = useQuery({
    queryKey: messagesKey,
    queryFn: () => portalFetch<{ messages: Message[] }>("user", `/tickets/${id}/messages`, { token }),
    refetchInterval: 4_000,
  });
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [attachmentMessageId, setAttachmentMessageId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const chat = messages.data?.messages ?? [];
  const lastMessageId = chat.at(-1)?.id;

  useEffect(() => {
    const area = scroller.current;
    if (area && followLatest.current) area.scrollTop = area.scrollHeight;
  }, [lastMessageId]);

  async function send() {
    if (sending || (!body.trim() && !file)) return;
    setSending(true);
    setError("");
    let messageId = attachmentMessageId;
    try {
      if (!messageId) {
        const message = await portalFetch<Message>("user", `/tickets/${id}/messages`, {
          method: "POST", token, body: { body: body.trim() || `Attachment · ${file!.name}` },
        });
        messageId = message.id;
        setBody("");
        if (file) setAttachmentMessageId(messageId);
      }
      if (file) {
        await uploadFile<Attachment>({
          portal: "user", token, file,
          presignPath: `/tickets/${id}/messages/${messageId}/attachments/upload`,
          confirmPath: `/tickets/${id}/messages/${messageId}/attachments/confirm`,
          confirmBody: { fileName: file.name, sizeBytes: file.size },
        });
        setFile(null);
        setAttachmentMessageId(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn’t send the message.";
      setError(messageId && file ? `Your message was sent. Retry the attachment. ${message}` : message);
    } finally {
      if (messageId) {
        followLatest.current = true;
        await queryClient.invalidateQueries({ queryKey: messagesKey });
        onChanged();
      }
      setSending(false);
    }
  }

  return (
    <section aria-label="Conversation" className="flex min-w-0 flex-col h-[min(640px,calc(100dvh-8.5rem))] min-h-[370px] lg:h-full lg:min-h-0">
      <div className="shrink-0 border-b border-line px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="min-w-0 break-words text-base font-semibold leading-snug text-ink">{conversationTitle(ticket)}</h2>
          <StatusPill value={ticket.status} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
          <time dateTime={ticket.created_at}>Started {dateLabel(ticket.created_at)}</time>
          {ticket.category && <span>· {enumLabel(ticket.category)}</span>}
          {ticket.latest_message_at && (
            <time className="hidden sm:inline" dateTime={ticket.latest_message_at}>· Latest message {reviewTimeLabel(ticket.latest_message_at)?.toLowerCase()}</time>
          )}
        </div>
        {ticket.booking_id && (
          <details className="mt-2 text-sm text-ink-2">
            <summary className="cursor-pointer font-medium text-ink hover:underline">Linked booking</summary>
            <div className="mt-2 rounded-row bg-surface-2 p-3 text-xs">
              <p className="font-medium text-ink">{[ticket.booking_make, ticket.booking_model, ticket.booking_shop].filter(Boolean).join(" · ")}</p>
              {ticket.booking_pickup_at && <p className="mt-1">Pickup {dateLabel(ticket.booking_pickup_at)}</p>}
              <p className="mt-1">Booking ID <code className="break-all">{ticket.booking_id}</code></p>
              <Link href="/account/bookings" className="mt-1 inline-block font-medium text-ink underline underline-offset-2">My bookings</Link>
            </div>
          </details>
        )}
      </div>

      <div ref={scroller} role="log" aria-label="Messages"
        className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-surface-2/60 p-4 sm:p-5"
        onScroll={(e) => {
          const area = e.currentTarget;
          followLatest.current = area.scrollHeight - area.scrollTop - area.clientHeight < 80;
        }}>
        {messages.isPending && (
          <LoadingSkeleton label="Loading messages" className="flex flex-col gap-3">
            <SkeletonBlock className="h-12 w-2/3 self-start rounded-panel" />
            <SkeletonBlock className="h-10 w-1/2 self-end rounded-panel" />
            <SkeletonBlock className="h-12 w-3/5 self-start rounded-panel" />
          </LoadingSkeleton>
        )}
        {messages.isError && <SearchFailure title="Couldn’t refresh messages" onRetry={() => void messages.refetch()} retrying={messages.isFetching} />}
        {messages.data && chat.length === 0 && <EmptyState title="No messages yet" description="Send a message to tell us how we can help." />}
        {chat.map((message, index) => {
          const day = dateLabel(message.created_at);
          const previous = chat[index - 1];
          return (
            <div key={message.id}>
              {(!previous || dateLabel(previous.created_at) !== day) && (
                <div className="mb-3 flex items-center gap-3 text-xs text-ink-2 before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
                  <time dateTime={message.created_at}>{day}</time>
                </div>
              )}
              <MessageBubble message={message} ticketId={id} token={token}
                mine={message.sender_type === "CUSTOMER" && message.sender_id === accountId} />
            </div>
          );
        })}
        {ticket.status === "RESOLVED" && ticket.resolution && (
          <p className="rounded-row border border-line bg-surface p-3 text-sm text-ink-2"><strong className="text-ink">Resolution</strong> · {ticket.resolution}</p>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="shrink-0 border-t border-line bg-surface px-3 py-3 sm:px-4">
        {error && <p role="alert" className="mb-2 text-sm text-danger">{error}</p>}
        {file && (
          <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-row bg-surface-2 px-2 py-1 text-xs text-ink-2">
            <Paperclip size={14} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{file.name}</span>
            <button type="button" disabled={sending} aria-label="Remove attachment" className="p-1 hover:text-danger" onClick={() => {
              setFile(null);
              setAttachmentMessageId(null);
              setError("");
            }}><X size={14} /></button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <label className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-row border border-line-strong text-ink-2 hover:bg-surface-2 focus-within:outline has-[:disabled]:cursor-default has-[:disabled]:opacity-50">
            <Paperclip size={17} aria-hidden="true" />
            <input type="file" aria-label="Attach a file" disabled={sending || !!attachmentMessageId} className="sr-only"
              onChange={(e) => { setFile(e.currentTarget.files?.[0] ?? file); e.currentTarget.value = ""; }} />
          </label>
          <textarea aria-label="Message" placeholder="Write a message…" rows={2} value={body} onChange={(e) => setBody(e.target.value)}
            disabled={sending || !!attachmentMessageId}
            className="min-h-10 min-w-0 flex-1 resize-none rounded-row border border-line-strong px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-ink"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
            }} />
          <button type="submit" aria-label={attachmentMessageId ? "Retry attachment" : "Send message"}
            disabled={sending || (!body.trim() && !file)} className={`${actionClass} max-sm:px-3`}>
            <Send size={16} aria-hidden="true" />
            <span className="hidden sm:inline">{sending ? "Sending…" : attachmentMessageId ? "Retry" : "Send"}</span>
          </button>
        </div>
      </form>
    </section>
  );
}

function MessageBubble({ message, ticketId, token, mine }: { message: Message; ticketId: string; token: string; mine: boolean }) {
  if (message.sender_type === "SYSTEM") {
    return <p className="mx-auto max-w-sm text-center text-xs text-ink-2">{message.body}</p>;
  }
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[88%] min-w-0 sm:max-w-[80%]">
        <div className={`mb-1 flex items-center gap-2 text-xs text-ink-2 ${mine ? "justify-end" : ""}`}>
          <span className="font-medium">{senderLabel(message.sender_type, mine)}</span>
          <time dateTime={message.created_at}>{timeFormat.format(new Date(message.created_at))}</time>
        </div>
        <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${mine ? "rounded-tr-sm bg-ink text-surface" : "rounded-tl-sm border border-line bg-surface text-ink"}`}>
          {message.body && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.body}</p>}
          {message.attachments.map((attachment) => <AttachmentLink key={attachment.id} attachment={attachment} ticketId={ticketId} token={token} />)}
        </div>
      </div>
    </div>
  );
}

function AttachmentLink({ attachment, ticketId, token }: { attachment: Attachment; ticketId: string; token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState<string | null>(null);

  async function open() {
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setBusy(true);
    setError("");
    try {
      const { downloadUrl } = await portalFetch<{ downloadUrl: string }>("user", `/tickets/${ticketId}/attachments/${attachment.id}/download`, { token });
      if (downloadUrl.startsWith("https://dev-fallback.local/")) throw new Error("File storage is unavailable.");
      if (tab) tab.location.href = downloadUrl;
      else setUrl(downloadUrl);
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : "Couldn’t open this attachment.");
    } finally {
      setBusy(false);
    }
  }

  const name = attachment.file_name ?? "Attachment";
  return (
    <div className="mt-1 text-xs">
      {url ? <a href={url} target="_blank" rel="noreferrer" className="underline">{name}</a> : (
        <button type="button" disabled={busy} onClick={() => void open()} className="inline-flex max-w-full items-center gap-1.5 underline underline-offset-2 disabled:opacity-50">
          <Paperclip size={13} className="shrink-0" aria-hidden="true" /><span className="truncate">{busy ? "Opening…" : name}</span>
        </button>
      )}
      {error && <p role="alert" className="mt-1">{error}</p>}
    </div>
  );
}
