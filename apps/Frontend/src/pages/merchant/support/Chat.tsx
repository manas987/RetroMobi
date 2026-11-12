import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Paperclip, Send } from "lucide-react";
import { portalFetch, type Row } from "../../../lib/portal";
import { uploadFile, UploadFailedError } from "../../../lib/upload";
import { useT } from "../../../i18n";
import { useMerchantShop } from "../Layout";
import { errorText, useMerchantQuery } from "../query";
import { Button, Chip, ErrorNote } from "../ui/ui";
import { CATEGORY } from "./ConversationList";

export function Chat({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const { token } = useMerchantShop();
  const { t, lang, time } = useT();
  const ticket = useMerchantQuery<Row>(`/tickets/${ticketId}`, token);
  const [messages, setMessages] = useState<Row[] | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Same since-cursor polling as before: the first call loads everything, later calls fetch only what's new.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setMessages(null);
    let lastId: string | undefined;
    async function poll() {
      try {
        const res = await portalFetch<{ messages: Row[] }>("merchant", `/tickets/${ticketId}/messages${lastId ? `?since=${lastId}` : ""}`, { token });
        if (cancelled) return;
        if (res.messages.length > 0) {
          lastId = String(res.messages[res.messages.length - 1]!.id);
          setMessages((prev) => (lastId && prev ? [...prev, ...res.messages.filter((m) => !prev.some((p) => p.id === m.id))] : res.messages));
        } else if (!lastId) setMessages([]);
      } catch {
        // silent: next tick retries
      } finally {
        if (!cancelled) timer = setTimeout(poll, 4000);
      }
    }
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [ticketId, token]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "nearest" }); }, [messages?.length]);

  const add = (m: Row) => setMessages((prev) => (prev?.some((p) => p.id === m.id) ? prev : [...(prev ?? []), m]));

  async function send() {
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      add(await portalFetch<Row>("merchant", `/tickets/${ticketId}/messages`, { method: "POST", token, body: { body } }));
      setBody("");
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setSending(false);
    }
  }

  // An attachment hangs off a message, so the file travels as its own message with the caption.
  async function attach(file: File) {
    setSending(true);
    setError(null);
    try {
      const msg = await portalFetch<Row>("merchant", `/tickets/${ticketId}/messages`, {
        method: "POST", token, body: { body: body.trim() || t("support.attached", { name: file.name }) },
      });
      add(msg);
      setBody("");
      await uploadFile({
        portal: "merchant", token, file,
        presignPath: `/tickets/${ticketId}/messages/${String(msg.id)}/attachments/upload`,
        confirmPath: `/tickets/${ticketId}/messages/${String(msg.id)}/attachments/confirm`,
        confirmBody: { fileName: file.name, sizeBytes: file.size },
      });
    } catch (err) {
      setError(err instanceof UploadFailedError ? t("support.attachFailed") : errorText(lang, err));
    } finally {
      setSending(false);
    }
  }

  const tk = ticket.data;
  const cat = tk ? CATEGORY[String(tk.category)] : undefined;
  return (
    <div className="bg-surface rounded-card shadow-card flex flex-col h-[calc(100dvh-10rem)] min-h-96">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button type="button" onClick={onBack} aria-label={t("common.back")} className="lg:hidden inline-flex h-11 w-11 items-center justify-center rounded-2xl hover:bg-surface-3">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-ink">{tk?.subject ? String(tk.subject) : cat ? t(cat) : t("support.conversation")}</p>
          {tk?.booking_id != null && <p className="tnum text-xs text-ink-3">#{String(tk.booking_id).slice(0, 8).toUpperCase()}</p>}
        </div>
        {tk && (tk.status === "RESOLVED" ? <Chip tone="muted">{t("support.solved")}</Chip> : <Chip tone="info">{t("support.open")}</Chip>)}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {messages === null && <p className="text-sm text-ink-3">{t("common.loading")}</p>}
        {messages?.length === 0 && <p className="text-sm text-ink-3 text-center my-auto">{t("support.noMessages")}</p>}
        {messages?.map((m) => {
          const type = String(m.sender_type ?? "");
          if (type === "SYSTEM") return <p key={String(m.id)} className="text-xs text-ink-3 text-center my-1">{String(m.body)}</p>;
          const mine = type === "MERCHANT";
          return (
            <div key={String(m.id)} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm text-ink whitespace-pre-wrap break-words ${mine ? "bg-amber/30" : "bg-surface-2"}`}>
                {!mine && <p className="text-xs font-semibold text-ink-3 mb-0.5">{t("support.fromSupport")}</p>}
                {String(m.body)}
                <p className="tnum mt-1 text-[11px] text-ink-3 text-right">{time(m.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <div className="px-4 pb-2"><ErrorNote text={error} /></div>}
      <div className="sticky bottom-0 flex items-end gap-2 border-t border-line bg-surface p-3 rounded-b-card">
        <input ref={fileRef} type="file" accept="image/*,application/pdf" className="sr-only" disabled={sending}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void attach(f); e.target.value = ""; }} />
        <Button variant="ghost" aria-label={t("support.attach")} disabled={sending} onClick={() => fileRef.current?.click()}>
          <Paperclip className="h-5 w-5" />
        </Button>
        <textarea
          value={body}
          rows={1}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("support.typeMessage")}
          className="min-h-11 flex-1 resize-none rounded-2xl border border-line-strong bg-surface px-4 py-2.5 text-base text-ink outline-none focus:border-ink"
        />
        <Button variant="primary" icon={Send} disabled={sending || !body.trim()} onClick={send}>{t("support.send")}</Button>
      </div>
    </div>
  );
}
