import { useEffect, useRef, useState } from "react";
import { AdminLayout } from "./Layout";
import { usePortalSession, usePortalQuery, portalFetch, decodeJwtSubject, PortalApiError, type Row } from "../../lib/portal";
import { DataTable, StatusPill } from "../../components/DataTable";
import { ErrorBox, TextField } from "../../components/AuthFormBits";
import { enumLabel, rupees } from "../../lib/format";

function TicketsBody() {
  const { session } = usePortalSession("admin");
  const token = session?.accessToken;
  const myId = token ? decodeJwtSubject(token) : null;
  const role = session?.role ?? "SUPPORT";
  const [status, setStatus] = useState<string>("");
  /** "" = anyone, "me" = assigned to me, "unassigned" = nobody yet. */
  const [owner, setOwner] = useState<string>("");
  const [reloadKey, setReloadKey] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);

  const query = new URLSearchParams({ r: String(reloadKey) });
  if (status) query.set("status", status);
  // The controller resolves the literal "me" to the caller's own admin id.
  if (owner === "me") query.set("assignedTo", "me");
  if (owner === "unassigned") query.set("unassigned", "true");

  const { data, error } = usePortalQuery<{ tickets: Row[] }>(
    "admin",
    token ? `/tickets?${query.toString()}` : null,
    token,
  );

  if (activeId && token) {
    return (
      <TicketDetail
        ticketId={activeId}
        token={token}
        myId={myId}
        role={role}
        onBack={() => {
          setActiveId(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1">Support tickets</h1>
      <p className="text-sm text-ink-3 mb-5">Click a ticket to reply, assign, or resolve it.</p>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {["", "OPEN", "IN_PROGRESS", "RESOLVED"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              status === s ? "bg-ink text-surface" : "bg-surface border border-line-strong text-ink-2"
            }`}
          >
            {s ? enumLabel(s) : "All"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-5">
        {[
          { value: "", label: "Anyone" },
          { value: "me", label: "Mine" },
          { value: "unassigned", label: "Unassigned" },
        ].map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setOwner(o.value)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              owner === o.value ? "bg-ink text-surface" : "bg-surface border border-line-strong text-ink-2"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {error && <ErrorBox text={error} />}
      {!error && data === null && <p className="text-sm text-ink-3">Loading…</p>}
      {!error && data && (
        <DataTable
          rows={data.tickets}
          emptyLabel="No tickets in the queue."
          rowKey="id"
          columns={[
            { key: "subject", label: "Subject", render: (r) => <span className="text-ink font-medium">{String(r.subject ?? r.category ?? "Conversation")}</span> },
            { key: "category", label: "Category", render: (r) => enumLabel(r.category) },
            { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            {
              key: "assigned_to",
              label: "Assigned to",
              // There is no admin endpoint that resolves an admin id to a
              // name, so anyone other than you is shown as an id and labelled
              // as one rather than passed off as a name.
              render: (r) =>
                r.assigned_to ? (
                  r.assigned_to === myId ? (
                    "You"
                  ) : (
                    <span className="text-ink-3">id {String(r.assigned_to).slice(0, 8)}</span>
                  )
                ) : (
                  <span className="text-ink-4">Unassigned</span>
                ),
            },
            { key: "created_at", label: "Opened" },
            {
              key: "__open",
              label: "",
              render: (r) => (
                <button type="button" onClick={() => setActiveId(String(r.id))} className="text-ink font-medium hover:underline">
                  Open
                </button>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

function TicketDetail({
  ticketId,
  token,
  myId,
  role,
  onBack,
}: {
  ticketId: string;
  token: string;
  myId: string | null;
  role: string;
  onBack: () => void;
}) {
  const [ticketKey, setTicketKey] = useState(0);
  const { data: ticket, error: ticketError } = usePortalQuery<Row>(
    "admin",
    `/tickets/${ticketId}?r=${ticketKey}`,
    token,
  );
  const [messages, setMessages] = useState<Row[] | null>(null);
  const [body, setBody] = useState("");
  const [resolution, setResolution] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const sinceId = messages && messages.length > 0 ? String(messages[messages.length - 1]!.id) : undefined;
        const res = await portalFetch<{ messages: Row[] }>(
          "admin",
          `/tickets/${ticketId}/messages${sinceId ? `?since=${sinceId}` : ""}`,
          { token },
        );
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
    setBusy(true);
    setError(null);
    try {
      const msg = await portalFetch<Row>("admin", `/tickets/${ticketId}/messages`, { method: "POST", token, body: { body } });
      setMessages((prev) => [...(prev ?? []), msg]);
      setBody("");
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't send that.");
    } finally {
      setBusy(false);
    }
  }

  async function assignToMe() {
    if (!myId) return;
    setBusy(true);
    setError(null);
    try {
      await portalFetch("admin", `/tickets/${ticketId}/assign`, { method: "POST", token, body: { adminId: myId } });
      setTicketKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't assign that.");
    } finally {
      setBusy(false);
    }
  }

  async function resolve() {
    if (!resolution.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await portalFetch("admin", `/tickets/${ticketId}/resolve`, { method: "POST", token, body: { resolution } });
      onBack();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't resolve that.");
    } finally {
      setBusy(false);
    }
  }

  const resolved = ticket?.status === "RESOLVED";
  const canAssign = role === "ADMIN" || role === "SUPER_ADMIN";

  return (
    <div>
      <button type="button" onClick={onBack} className="text-sm text-ink-3 hover:text-ink mb-4">
        ← All tickets
      </button>

      {ticketError && <ErrorBox text={ticketError} />}
      {error && <ErrorBox text={error} />}

      {ticket && (
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-semibold text-ink">{String(ticket.subject ?? ticket.category ?? "Conversation")}</h1>
            <p className="text-sm text-ink-3 mt-0.5">
              {ticket.category ? enumLabel(ticket.category) : "Uncategorised"}
              {ticket.booking_id ? ` · booking id ${String(ticket.booking_id).slice(0, 8)}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusPill value={ticket.status} />
            <span className="text-sm text-ink-3">
              {ticket.assigned_to
                ? ticket.assigned_to === myId
                  ? "Assigned to you"
                  : `Assigned to admin id ${String(ticket.assigned_to).slice(0, 8)}`
                : "Unassigned"}
            </span>
            {/* The assign route is ADMIN/SUPER_ADMIN only — showing it to a
                SUPPORT agent would just hand them a 403. */}
            {canAssign && ticket.assigned_to !== myId && (
              <button type="button" disabled={busy} onClick={assignToMe} className="text-sm text-ink font-medium hover:underline disabled:opacity-40">
                {ticket.assigned_to ? "Take over" : "Assign to me"}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5 items-start">
      <div className="min-w-0">
      <div className="rounded-panel border border-line flex flex-col h-[460px] bg-surface mb-4">
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
          {messages === null && <p className="text-sm text-ink-3">Loading…</p>}
          {messages?.map((m) => <MessageBubble key={String(m.id)} message={m} />)}
          <div ref={bottomRef} />
        </div>

        {!resolved && (
          <div className="flex items-center gap-2 p-3 border-t border-line">
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              placeholder="Reply…"
              className="flex-1 rounded-row border border-line-strong px-3 py-2 text-sm outline-none focus:border-ink"
            />
            <button
              type="button"
              disabled={busy || !body.trim()}
              onClick={send}
              className="h-10 px-4 rounded-row bg-ink text-surface font-medium text-sm disabled:opacity-40 hover:bg-ink-2 transition-colors"
            >
              Send
            </button>
          </div>
        )}
      </div>

      {!resolved ? (
        <div className="rounded-panel border border-line p-4">
          <TextField label="Resolve with a note" value={resolution} onChange={setResolution} />
          <button
            type="button"
            disabled={busy || !resolution.trim()}
            onClick={resolve}
            className="h-10 px-4 rounded-row bg-verified-soft text-verified font-medium text-sm disabled:opacity-40 hover:brightness-95"
          >
            Mark resolved
          </button>
        </div>
      ) : (
        <p className="text-sm text-verified bg-verified-soft rounded-row px-3 py-2">
          Resolved{ticket?.resolution ? `: ${String(ticket.resolution)}` : ""}
        </p>
      )}
      </div>

      <aside className="flex flex-col gap-4 w-full">
        <DepositPanel ticketId={ticketId} token={token} />
        {ticket?.booking_id ? <ParticipantsPanel ticketId={ticketId} token={token} /> : null}
      </aside>
      </div>
    </div>
  );
}

/**
 * The deposit a merchant claimed against this booking, and the split that
 * settles it. The GET 404s for a ticket with no claimed deposit, which is the
 * common case — so a failure renders nothing rather than an error.
 */
function DepositPanel({ ticketId, token }: { ticketId: string; token: string }) {
  const [deposit, setDeposit] = useState<Row | null>(null);
  const [refundToCustomer, setRefundToCustomer] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Most tickets have no claimed deposit, so "absent" is the common case and
  // must stay distinguishable from "the request failed" — swallowing both
  // into `null` hid real server errors behind a blank panel.
  const [state, setState] = useState<"loading" | "ready" | "absent" | "failed">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    portalFetch<Row>("admin", `/tickets/${ticketId}/deposit`, { token })
      .then((d) => {
        if (cancelled) return;
        setDeposit(d);
        setState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof PortalApiError && (err.status === 404 || err.status === 400)) {
          setState("absent");
          return;
        }
        setLoadError(err instanceof Error ? err.message : "Couldn't load the deposit.");
        setState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId, token, reloadKey]);

  if (state === "loading" || state === "absent") return null;
  if (state === "failed") {
    return (
      <div className="rounded-panel border border-line bg-surface p-4">
        <h2 className="font-semibold text-ink text-sm mb-3">Security deposit</h2>
        <ErrorBox text={loadError ?? "Couldn't load the deposit."} />
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="text-sm text-ink font-medium hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }
  if (!deposit) return null;

  const held = Number(deposit.amount);
  const settled = deposit.settledAt != null;
  // The server requires the split to sum to the held amount exactly, so the
  // agent only ever enters one side and watches the other fall out of it.
  const refundPaise = Math.round(Number(refundToCustomer || 0) * 100);
  const toMerchant = held - refundPaise;
  const splitValid =
    Number.isInteger(refundPaise) && refundPaise >= 0 && refundPaise <= held && note.trim().length > 0;

  async function settle() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("admin", `/tickets/${ticketId}/deposit-settlement`, {
        method: "POST",
        token,
        body: { refundToCustomer: refundPaise, toMerchant, note },
      });
      setReloadKey((k) => k + 1);
      setRefundToCustomer("");
      setNote("");
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't settle that deposit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-panel border border-line bg-surface p-4">
      <h2 className="font-semibold text-ink text-sm mb-3">Security deposit</h2>

      <dl className="text-sm flex flex-col gap-1.5 mb-4">
        <Pair label="Held" value={rupees(held)} />
        <Pair label="Status" value={enumLabel(deposit.status)} />
        {deposit.deductedAmount != null && Number(deposit.deductedAmount) > 0 && (
          <Pair label="Merchant claimed" value={rupees(Number(deposit.deductedAmount))} />
        )}
        {deposit.lateFeeAmount != null && Number(deposit.lateFeeAmount) > 0 && (
          <Pair label="Late fee" value={rupees(Number(deposit.lateFeeAmount))} />
        )}
      </dl>

      {deposit.deductionReason ? (
        <p className="text-sm text-ink-2 bg-surface-2 rounded-row px-3 py-2 mb-4">
          <span className="block text-xs text-ink-3 mb-0.5">Merchant's reason</span>
          {String(deposit.deductionReason)}
        </p>
      ) : null}

      {settled ? (
        <p className="text-sm text-verified bg-verified-soft rounded-row px-3 py-2">
          Settled on{" "}
          {new Date(String(deposit.settledAt)).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
          .
        </p>
      ) : (
        <>
          {error && <ErrorBox text={error} />}
          <TextField
            label="Refund to customer (₹)"
            type="number"
            value={refundToCustomer}
            onChange={setRefundToCustomer}
          />
          {/* Stated, not entered: the whole held amount must be accounted
              for, so the merchant's share is whatever is left. */}
          <p className="text-sm text-ink-2 -mt-2 mb-4">
            To merchant:{" "}
            <span className={`font-medium ${toMerchant < 0 ? "text-danger" : "text-ink"}`}>
              {toMerchant < 0 ? "more than the deposit" : rupees(toMerchant)}
            </span>
          </p>
          <TextField label="Note (recorded on the settlement)" value={note} onChange={setNote} />
          <button
            type="button"
            disabled={busy || !splitValid}
            onClick={settle}
            className="w-full h-10 rounded-row bg-ink text-surface font-medium text-sm disabled:opacity-40 hover:bg-ink-2 transition-colors"
          >
            {busy ? "Settling…" : "Settle deposit"}
          </button>
          <p className="text-xs text-ink-4 mt-2">Moves money and cannot be undone or repeated.</p>
        </>
      )}
    </div>
  );
}

/**
 * Pulling the other side of the booking into the conversation. The list comes
 * from the server and is booking-scoped by design — there is deliberately no
 * free search over users here.
 */
function ParticipantsPanel({ ticketId, token }: { ticketId: string; token: string }) {
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error } = usePortalQuery<{ parties: Row[] }>(
    "admin",
    `/tickets/${ticketId}/addable-parties?r=${reloadKey}`,
    token,
  );
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);

  async function add(partyType: string, partyId: string) {
    setBusy(true);
    setAddError(null);
    try {
      await portalFetch("admin", `/tickets/${ticketId}/participants`, {
        method: "POST",
        token,
        body: { partyType, partyId },
      });
      setAdded((prev) => [...prev, partyId]);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setAddError(err instanceof PortalApiError ? err.message : "Couldn't add that party.");
    } finally {
      setBusy(false);
    }
  }

  const parties = data?.parties ?? [];

  return (
    <div className="rounded-panel border border-line bg-surface p-4">
      <h2 className="font-semibold text-ink text-sm mb-1">Parties on this booking</h2>
      <p className="text-xs text-ink-3 mb-3">Only people on the booking this ticket is about.</p>

      {error && <ErrorBox text={error} />}
      {addError && <ErrorBox text={addError} />}

      {parties.length === 0 ? (
        <p className="text-sm text-ink-3">Nobody else to add.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {parties.map((pt) => {
            const partyId = String(pt.party_id);
            const partyType = String(pt.party_type);
            return (
              <li key={`${partyType}:${partyId}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="block text-ink">{partyType === "CUSTOMER" ? "Customer" : "Merchant"}</span>
                  <span className="block text-xs text-ink-4 truncate">id {partyId.slice(0, 8)}</span>
                </span>
                {added.includes(partyId) ? (
                  <span className="text-xs text-verified shrink-0">Added</span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => add(partyType, partyId)}
                    className="text-xs font-medium text-ink hover:underline disabled:opacity-40 shrink-0"
                  >
                    Add to chat
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-ink font-medium">{value}</dd>
    </div>
  );
}

function MessageBubble({ message: m }: { message: Row }) {
  const senderType = String(m.sender_type ?? "");
  const isSystem = senderType === "SYSTEM";
  const isMine = senderType === "ADMIN";

  if (isSystem) {
    return <p className="text-xs text-ink-4 text-center my-1">{String(m.body)}</p>;
  }

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-row px-3 py-2 text-sm ${isMine ? "bg-ink text-surface" : "bg-surface-2 text-ink"}`}>
        {!isMine && <p className="text-[10px] uppercase tracking-wide opacity-60 mb-0.5">{senderType}</p>}
        {String(m.body)}
      </div>
    </div>
  );
}

export function AdminTickets() {
  return (
    <AdminLayout>
      <TicketsBody />
    </AdminLayout>
  );
}
