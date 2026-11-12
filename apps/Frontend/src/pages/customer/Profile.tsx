import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Header } from "../../components/Header";
import { Footer } from "../../components/Footer";
import { usePortalSession, usePortalQuery, portalFetch, PortalApiError, type Row } from "../../lib/portal";
import { DateField } from "../../components/DateTimeField";
import { StatusPill } from "../../components/DataTable";
import { ErrorBox, SubmitButton, TextField } from "../../components/AuthFormBits";
import { EmptyState, feedbackActionClass, LoadingSkeleton, SkeletonBlock, SkeletonRows } from "../../components/ContentFeedback";
import { dateLabel, enumLabel } from "../../lib/format";
import { uploadFile, UploadFailedError } from "../../lib/upload";
import { RiderVerification } from "../../components/RiderVerification";

function useRequireCustomer() {
  const { session } = usePortalSession("user");
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!session) navigate("/login");
  }, [session, navigate]);
  return session;
}

// ---------- Riders & profile ----------

function ProfileBody() {
  const session = useRequireCustomer();
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error } = usePortalQuery<{ riders: Row[] }>(
    "user",
    session ? `/riders?r=${reloadKey}` : null,
    session?.accessToken,
  );
  const reload = () => setReloadKey((k) => k + 1);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addRider() {
    setAddError(null);
    setBusy(true);
    try {
      await portalFetch("user", "/riders", { method: "POST", token: session!.accessToken, body: { name } });
      setName("");
      setAdding(false);
      reload();
    } catch (err) {
      setAddError(err instanceof PortalApiError ? err.message : "Couldn't add that rider.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[760px] w-full mx-auto px-5 py-10 min-h-[calc(100dvh-4rem)]">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-semibold text-ink">Riders & profile</h1>
        {!adding && (error || (data && data.riders.length > 0)) && (
          <button type="button" onClick={() => setAdding(true)} className="text-sm text-ink font-medium hover:underline shrink-0">
            + Add rider
          </button>
        )}
      </div>
      <p className="text-sm text-ink-3 mb-6">Everyone verified to ride under this account.</p>

      {error && <ErrorBox text={error} />}

      {adding && (
        <div className="rounded-panel border border-line p-5 mb-5">
          <h2 className="font-semibold text-ink mb-3">New rider</h2>
          {addError && <ErrorBox text={addError} />}
          <TextField label="Name" value={name} onChange={setName} autoFocus />
          <div className="flex items-center gap-3 mt-1">
            <SubmitButton busy={busy} disabled={!name} onClick={addRider}>
              Add rider
            </SubmitButton>
            <button type="button" onClick={() => setAdding(false)} className="text-sm text-ink-3 hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      )}

      {!error && data === null && (
        <LoadingSkeleton label="Loading riders" className="space-y-3">
          {[0, 1].map((index) => (
            <div key={index} className="space-y-3 rounded-panel border border-line p-5">
              <div className="flex justify-between gap-4">
                <SkeletonBlock className="h-5 w-2/5" />
                <SkeletonBlock className="h-5 w-20 rounded-full" />
              </div>
              <SkeletonBlock className="h-4 w-1/2" />
              <SkeletonBlock className="h-8 w-28 rounded-row" />
            </div>
          ))}
        </LoadingSkeleton>
      )}
      {!error && data && data.riders.length === 0 && !adding && (
        <EmptyState title="No riders added yet" description="Add a rider to start verifying their driving licence.">
          <button type="button" className={feedbackActionClass} onClick={() => setAdding(true)}>Add a rider</button>
        </EmptyState>
      )}
      {!error && data && data.riders.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.riders.map((r) => (
            <RiderCard key={String(r.id)} rider={r} token={session!.accessToken} onChanged={reload} />
          ))}
        </div>
      )}

      {session && <SignedInDevices token={session.accessToken} />}
    </div>
  );
}

/**
 * Where this account is signed in, and how to cut one off. Everything
 * returned is live — the server filters out revoked and expired sessions, so
 * nothing listed here is already dead.
 */
function SignedInDevices({ token }: { token: string }) {
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error } = usePortalQuery<{ sessions: Row[]; currentSessionId: string | null }>(
    "user",
    `/auth/sessions?r=${reloadKey}`,
    token,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function revoke(sessionId: string, isCurrent: boolean) {
    if (
      !window.confirm(
        isCurrent
          ? "This is the device you're using. Revoking it signs you out here."
          : "Sign this device out of your account?",
      )
    ) {
      return;
    }
    setBusyId(sessionId);
    setActionError(null);
    try {
      await portalFetch("user", `/auth/sessions/${sessionId}`, { method: "DELETE", token });
      // Revoking the current session leaves this tab holding a dead refresh
      // token, so send it to a clean sign-in rather than letting the next
      // request fail on its own.
      if (isCurrent) window.location.assign("/login");
      else setReloadKey((k) => k + 1);
    } catch (err) {
      setActionError(err instanceof PortalApiError ? err.message : "Couldn't sign that device out.");
    } finally {
      setBusyId(null);
    }
  }

  const sessions = data?.sessions ?? [];

  return (
    <section className="mt-10">
      <h2 className="font-semibold text-ink mb-1">Signed-in devices</h2>
      <p className="text-sm text-ink-3 mb-4">Sign out anywhere you don't recognise.</p>

      {error && <ErrorBox text={error} />}
      {actionError && <ErrorBox text={actionError} />}

      {!error && data === null && <SkeletonRows label="Loading signed-in devices" detail />}
      {!error && data && sessions.length === 0 && (
        <EmptyState title="No other active sessions" />
      )}

      {sessions.length > 0 && (
        <div className="rounded-panel border border-line divide-y divide-line">
          {sessions.map((sess) => {
            const id = String(sess.id);
            const isCurrent = id === data?.currentSessionId;
            return (
              <div key={id} className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
                <span className="min-w-0">
                  <span className="block text-ink">
                    {isCurrent ? "This device" : "Another device"}
                    <span className="text-ink-4 font-normal"> · {String(sess.device_id).slice(0, 8)}</span>
                  </span>
                  <span className="block text-xs text-ink-3">
                    Last used {fmtDate(sess.last_used_at)} · signed in {fmtDate(sess.created_at)}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busyId === id}
                  onClick={() => revoke(id, isCurrent)}
                  className="text-xs text-danger font-medium hover:underline disabled:opacity-40 shrink-0"
                >
                  {isCurrent ? "Sign out here" : "Sign out"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RiderCard({ rider: r, token, onChanged }: { rider: Row; token: string; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(String(r.name ?? ""));
  const [editDob, setEditDob] = useState(String(r.dob ?? "").slice(0, 10));
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Name and date of birth only. The licence verification records are
   *  immutable and an edit never touches them, so a verified rider stays
   *  verified — correcting a typo does not send them back through KYC. */
  async function saveEdit() {
    setError(null);
    setBusy(true);
    try {
      await portalFetch("user", `/riders/${r.id}`, {
        method: "PATCH",
        token,
        body: { name: editName.trim(), dob: editDob || undefined },
      });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't save those changes.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      await portalFetch("user", `/riders/${r.id}`, { method: "DELETE", token });
      onChanged();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't remove that rider.");
      setBusy(false);
    }
  }

  const verified = r.licence_status === "VERIFIED";

  return (
    <div className="rounded-panel border border-line p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-ink">{String(r.name)}</p>
          <p className="text-xs text-ink-3">
            {r.dob ? `Born ${dateLabel(r.dob)}` : "No date of birth on file"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill value={r.licence_status ?? "UNVERIFIED"} />
          {!verified && !verifying && (
            <button type="button" onClick={() => setVerifying(true)} className="text-sm text-ink font-medium hover:underline">
              Verify licence
            </button>
          )}
          {!editing && (
            <button
              type="button"
              onClick={() => {
                setEditName(String(r.name ?? ""));
                setEditDob(String(r.dob ?? "").slice(0, 10));
                setEditing(true);
              }}
              className="text-sm text-ink font-medium hover:underline"
            >
              Edit
            </button>
          )}
          <button type="button" disabled={busy} onClick={remove} className="text-sm text-danger hover:underline disabled:opacity-40">
            Remove
          </button>
        </div>
      </div>
      {verified && r.licence_expires_on ? (
        <p className="text-xs text-ink-4 mt-1">Licence valid until {dateLabel(r.licence_expires_on)}</p>
      ) : null}

      {error && <div className="mt-3"><ErrorBox text={error} /></div>}

      {editing && (
        <div className="mt-3 pt-3 border-t border-line">
          <div className="flex items-end gap-3 flex-wrap">
            <TextField label="Name" value={editName} onChange={setEditName} autoFocus />
            <DateField label="Date of birth" value={editDob} onChange={setEditDob} fromYear={1920} toDate={new Date()} />
            <button
              type="button"
              disabled={busy || !editName.trim()}
              onClick={saveEdit}
              className="h-10 px-4 rounded-row bg-ink text-surface font-medium text-sm disabled:opacity-40 hover:bg-ink-2 transition-colors mb-4"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="h-10 px-2 text-sm text-ink-3 hover:text-ink mb-4"
            >
              Cancel
            </button>
          </div>
          {verified && (
            <p className="text-xs text-ink-4 -mt-1">
              This rider stays verified — correcting a name or date of birth does not re-run licence checks.
            </p>
          )}
        </div>
      )}

      {verifying && (
        <div className="mt-3 pt-3 border-t border-line">
          <RiderVerification
            riderId={String(r.id)}
            riderName={String(r.name ?? "")}
            token={token}
            onDone={() => {
              setVerifying(false);
              onChanged();
            }}
            onCancel={() => setVerifying(false)}
          />
        </div>
      )}

    </div>
  );
}

export function CustomerProfile() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <ProfileBody />
      <Footer />
    </div>
  );
}

// ---------- Support ----------

type TriageStep = "closed" | "ask-booking" | "pick-booking" | "compose";

function SupportBody() {
  const session = useRequireCustomer();
  const token = session?.accessToken;
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error } = usePortalQuery<{ tickets: Row[] }>(
    "user",
    token ? `/tickets?r=${reloadKey}` : null,
    token,
  );
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [step, setStep] = useState<TriageStep>("closed");

  return (
    <div className="max-w-[760px] w-full mx-auto px-5 py-10 min-h-[calc(100dvh-4rem)]">
      <h1 className="text-2xl font-semibold text-ink mb-1">Support</h1>
      <p className="text-sm text-ink-3 mb-6">Chat with us about a booking, or anything else.</p>

      {error && <ErrorBox text={error} />}

      {activeTicketId ? (
        <TicketChat
          ticketId={activeTicketId}
          token={token!}
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
              token={token!}
              onCreated={(id) => {
                setStep("closed");
                setActiveTicketId(id);
              }}
            />
          )}

          {!error && data === null && <SkeletonRows label="Loading support conversations" count={3} />}
          {!error && data && data.tickets.length === 0 && (
            <EmptyState title="No conversations yet" description="Start a conversation whenever you need help." />
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
  onCreated,
}: {
  step: TriageStep;
  setStep: (s: TriageStep) => void;
  token: string;
  onCreated: (ticketId: string) => void;
}) {
  const { data: bookingsRes, error: bookingsError } = usePortalQuery<{ bookings: Row[] }>(
    "user",
    step === "pick-booking" ? "/bookings" : null,
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
      const ticket = await portalFetch<{ id: string }>("user", "/tickets", {
        method: "POST",
        token,
        body: { bookingId: category === "BOOKING" ? bookingId! : undefined, firstMessage: firstMessage || undefined },
      });
      await portalFetch("user", `/tickets/${ticket.id}/category`, {
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
            <button
              type="button"
              onClick={() => setStep("pick-booking")}
              className="h-10 px-4 rounded-row border border-line-strong text-sm font-medium hover:bg-surface-3"
            >
              Yes, a booking
            </button>
            <button
              type="button"
              onClick={() => setStep("compose")}
              className="h-10 px-4 rounded-row border border-line-strong text-sm font-medium hover:bg-surface-3"
            >
              No, something else
            </button>
          </div>
        </>
      )}

      {step === "pick-booking" && (
        <>
          <p className="text-sm font-medium text-ink mb-3">Which booking?</p>
          {bookingsError && <ErrorBox text="We couldn’t load your bookings." />}
          {!bookingsError && bookingsRes === null && <SkeletonRows label="Loading bookings to choose from" />}
          {bookingsRes && bookingsRes.bookings.length === 0 && (
            <EmptyState title="No bookings to choose from" />
          )}
          <div className="flex flex-col gap-2 mb-4">
            {bookingsRes?.bookings.map((b) => (
              <label
                key={String(b.id)}
                className="flex items-center gap-3 rounded-row border border-line-strong px-3 py-2.5 cursor-pointer has-[:checked]:border-ink"
              >
                <input type="radio" name="booking" checked={bookingId === b.id} onChange={() => setBookingId(String(b.id))} />
                <span className="text-sm text-ink">
                  {String(b.make)} {String(b.model)} — {String(b.shop_name)}
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
          {!bookingId && (
            <button type="button" className={feedbackActionClass} onClick={() => setStep("compose")}>Continue without a booking</button>
          )}
        </>
      )}

      {step === "compose" && (
        <>
          <p className="text-sm font-medium text-ink mb-3">What's it about?</p>
          <div className="flex gap-3 mb-4">
            <button
              type="button"
              onClick={() => create("APP_HELP")}
              disabled={busy}
              className="h-10 px-4 rounded-row border border-line-strong text-sm font-medium hover:bg-surface-3 disabled:opacity-40"
            >
              Using the app
            </button>
            <button
              type="button"
              onClick={() => create("OTHER")}
              disabled={busy}
              className="h-10 px-4 rounded-row border border-line-strong text-sm font-medium hover:bg-surface-3 disabled:opacity-40"
            >
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
  // The chat used to be a bare message stream under a back link — no subject,
  // category, status or linked booking anywhere on screen.
  const { data: ticket } = usePortalQuery<Row>("user", `/tickets/${ticketId}`, token);
  const [messages, setMessages] = useState<Row[] | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
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
        const res = await portalFetch<{ messages: Row[] }>(
          "user",
          `/tickets/${ticketId}/messages${sinceId ? `?since=${sinceId}` : ""}`,
          { token },
        );
        if (cancelled) return;
        setMessagesError(null);
        if (sinceId) {
          if (res.messages.length > 0) setMessages((prev) => [...(prev ?? []), ...res.messages]);
        } else {
          setMessages(res.messages);
        }
      } catch (err) {
        if (!cancelled) setMessagesError(err instanceof PortalApiError ? err.message : "Couldn't load messages.");
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
      const msg = await portalFetch<Row>("user", `/tickets/${ticketId}/messages`, {
        method: "POST",
        token,
        body: { body },
      });
      setMessages((prev) => [...(prev ?? []), { ...msg, attachments: [] }]);
      setBody("");
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't send that.");
    } finally {
      setSending(false);
    }
  }

  async function sendFile(file: File) {
    setSending(true);
    setError(null);
    try {
      const msg = await portalFetch<Row>("user", `/tickets/${ticketId}/messages`, {
        method: "POST",
        token,
        body: { body: body.trim() || `📎 ${file.name}` },
      });
      const attachment = await uploadFile<Row>({
        portal: "user",
        token,
        file,
        presignPath: `/tickets/${ticketId}/messages/${msg.id}/attachments/upload`,
        confirmPath: `/tickets/${ticketId}/messages/${msg.id}/attachments/confirm`,
        confirmBody: { fileName: file.name, sizeBytes: file.size },
      });
      setMessages((prev) => [...(prev ?? []), { ...msg, attachments: [attachment] }]);
      setBody("");
    } catch (err) {
      if (err instanceof PortalApiError || err instanceof UploadFailedError) setError(err.message);
      else setError("Couldn't send that attachment.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-panel border border-line flex flex-col h-[520px]">
      <div className="px-4 py-3 border-b border-line">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="text-sm text-ink-3 hover:text-ink">
            ← All conversations
          </button>
          {ticket ? <StatusPill value={ticket.status} /> : null}
        </div>
        {ticket ? (
          <div className="mt-1.5">
            <p className="text-sm font-medium text-ink">
              {ticket.subject ? String(ticket.subject) : enumLabel(ticket.category)}
            </p>
            <p className="text-xs text-ink-3">
              Opened {fmtDate(ticket.created_at)}
              {ticket.category ? ` · ${enumLabel(ticket.category)}` : ""}
              {ticket.booking_id ? " · about a booking" : ""}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {messages === null && !messagesError && (
          <LoadingSkeleton label="Loading messages" className="flex flex-col gap-3">
            <SkeletonBlock className="h-12 w-2/3 self-start rounded-panel" />
            <SkeletonBlock className="h-10 w-1/2 self-end rounded-panel" />
            <SkeletonBlock className="h-12 w-3/5 self-start rounded-panel" />
          </LoadingSkeleton>
        )}
        {messages?.length === 0 && !messagesError && <EmptyState title="No messages yet" description="Send a message to tell us how we can help." />}
        {messages?.map((m) => <MessageBubble key={String(m.id)} message={m} ticketId={ticketId} token={token} />)}
        <div ref={bottomRef} />
      </div>

      {messagesError && <div className="px-4"><ErrorBox text={messagesError} /></div>}
      {error && <div className="px-4"><ErrorBox text={error} /></div>}

      <div className="flex items-center gap-2 p-3 border-t border-line">
        <label className="shrink-0 h-10 w-10 rounded-row border border-line-strong flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 transition-colors cursor-pointer">
          📎
          <input
            type="file"
            disabled={sending}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) sendFile(file);
            }}
          />
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

function MessageBubble({ message: m, ticketId, token }: { message: Row; ticketId: string; token: string }) {
  const senderType = String(m.sender_type ?? "");
  const isSystem = senderType === "SYSTEM";
  const isMine = senderType === "CUSTOMER";
  const attachments = Array.isArray(m.attachments) ? (m.attachments as Row[]) : [];

  if (isSystem) {
    return <p className="text-xs text-ink-4 text-center my-1">{String(m.body)}</p>;
  }

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-row px-3 py-2 text-sm ${
          isMine ? "bg-ink text-surface" : "bg-surface-2 text-ink"
        }`}
      >
        {!isMine && <p className="text-[10px] uppercase tracking-wide opacity-60 mb-0.5">{senderType}</p>}
        {String(m.body)}
        {attachments.map((a) => (
          <AttachmentLink key={String(a.id)} attachment={a} ticketId={ticketId} token={token} isMine={isMine} />
        ))}
      </div>
    </div>
  );
}

function AttachmentLink({ attachment: a, ticketId, token, isMine }: { attachment: Row; ticketId: string; token: string; isMine: boolean }) {
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      const { downloadUrl } = await portalFetch<{ downloadUrl: string }>(
        "user",
        `/tickets/${ticketId}/attachments/${a.id}/download`,
        { token },
      );
      window.open(downloadUrl, "_blank", "noopener");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className={`mt-1 flex items-center gap-1.5 text-xs underline underline-offset-2 ${isMine ? "text-surface" : "text-ink"} opacity-90 hover:opacity-100 disabled:opacity-40`}
    >
      📎 {String(a.file_name ?? "Attachment")}
    </button>
  );
}

export function CustomerSupport() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <SupportBody />
      <Footer />
    </div>
  );
}
