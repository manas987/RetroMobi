import { useEffect, useState, type ReactNode } from "react";
import { Laptop, MapPin, Smartphone } from "lucide-react";
import { useLocation } from "wouter";
import { Header } from "../../components/Header";
import { Footer } from "../../components/Footer";
import { Modal } from "../../components/Modal";
import { OtpInput } from "../../components/OtpInput";
import { usePortalSession, usePortalQuery, portalFetch, type Row } from "../../lib/portal";
import { ErrorBox, TextField } from "../../components/AuthFormBits";
import { EmptyState, SkeletonRows } from "../../components/ContentFeedback";
import { SearchFailure } from "../../components/SearchFeedback";

const primaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-row bg-amber px-4 text-sm font-semibold text-on-amber hover:brightness-95 disabled:opacity-50";
const secondaryButton = "inline-flex min-h-10 items-center justify-center rounded-row border border-line-strong px-4 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50";
const dangerButton = "inline-flex min-h-10 items-center justify-center rounded-row bg-danger px-4 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50";
const smallButton = "inline-flex min-h-9 items-center rounded-row border border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-3";
const sessionDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

function ProfileBody({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  return (
    <main className="mx-auto w-full max-w-[880px] flex-1 min-h-[calc(100dvh-4rem)] px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold text-ink sm:text-3xl">Profile</h1>
      <p className="mt-1 mb-6 text-sm text-ink-2 sm:mb-8">Your account details and where you’re signed in.</p>
      <div className="space-y-8 sm:space-y-10">
        <AccountDetails token={token} />
        <SignedInDevices token={token} onSignOut={onSignOut} />
      </div>
    </main>
  );
}

function AccountDetails({ token }: { token: string }) {
  const [revision, setRevision] = useState(0);
  const { data, error } = usePortalQuery<{ account: Row }>("user", `/auth/me?r=${revision}`, token);
  const [editing, setEditing] = useState<"name" | "email" | null>(null);
  const reload = () => setRevision((value) => value + 1);
  const account = data?.account;

  return (
    <section aria-label="Account details">
      <h2 className="mb-3 text-lg font-semibold text-ink">Account</h2>
      {error && <SearchFailure title="Couldn’t load your account" onRetry={reload} retrying={false} />}
      {!error && !account && <SkeletonRows label="Loading your account" />}
      {account && (
        <dl className="divide-y divide-line rounded-panel border border-line bg-surface">
          <DetailRow label="Name" value={String(account.name ?? "")}>
            <button type="button" className={smallButton} onClick={() => setEditing("name")}>Edit</button>
          </DetailRow>
          <DetailRow label="Phone" value={String(account.phone)} hint="Used to sign in. To change it, contact support." />
          <DetailRow
            label="Email"
            value={account.email ? String(account.email) : "Not added"}
            hint={account.email ? "Verified. Booking confirmations and invoices go here." : "Add one to get booking confirmations and invoices by email."}
          >
            <button type="button" className={smallButton} onClick={() => setEditing("email")}>{account.email ? "Change" : "Add email"}</button>
          </DetailRow>
        </dl>
      )}
      {editing === "name" && account && (
        <NameForm token={token} current={String(account.name ?? "")} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
      {editing === "email" && <EmailForm token={token} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </section>
  );
}

function DetailRow({ label, value, hint, children }: { label: string; value: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <dt className="text-xs text-ink-2">{label}</dt>
        <dd className="mt-0.5 break-words text-sm font-medium text-ink">{value}</dd>
        {hint && <dd className="mt-0.5 text-xs text-ink-3">{hint}</dd>}
      </div>
      {children}
    </div>
  );
}

function NameForm({ token, current, onClose, onSaved }: { token: string; current: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(current);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setError("");
    setBusy(true);
    try {
      await portalFetch("user", "/auth/me", { method: "PATCH", token, body: { name: name.trim() } });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t save your name.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title="Edit name" onClose={() => { if (!busy) onClose(); }}>
      <form onSubmit={(event) => { event.preventDefault(); if (!busy && name.trim()) void save(); }}>
        {error && <div className="mb-3"><ErrorBox text={error} /></div>}
        <TextField label="Your name" value={name} onChange={setName} autoFocus />
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={secondaryButton} disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className={primaryButton} disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

/** The email is saved only once the code sent to it is entered. */
function EmailForm({ token, onClose, onSaved }: { token: string; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const send = () => run(async () => {
    await portalFetch("user", "/auth/me/email/send", { method: "POST", token, body: { email: email.trim() } });
    setCode("");
    setSent(true);
  });
  const verify = () => run(async () => {
    await portalFetch("user", "/auth/me/email/verify", { method: "POST", token, body: { email: email.trim(), code } });
    onSaved();
  });

  return (
    <Modal open title={sent ? "Enter the code" : "Add your email"} onClose={() => { if (!busy) onClose(); }}>
      {error && <div className="mb-3"><ErrorBox text={error} /></div>}
      {!sent ? (
        <form onSubmit={(event) => { event.preventDefault(); if (!busy && email.trim()) void send(); }}>
          <TextField label="Email address" type="email" value={email} onChange={setEmail} autoFocus />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={secondaryButton} disabled={busy} onClick={onClose}>Cancel</button>
            <button type="submit" className={primaryButton} disabled={busy || !email.trim()}>{busy ? "Sending…" : "Send code"}</button>
          </div>
        </form>
      ) : (
        <form onSubmit={(event) => { event.preventDefault(); if (!busy && code.length === 6) void verify(); }}>
          <p className="mb-4 text-sm text-ink-2">We sent a 6-digit code to <span className="font-medium text-ink">{email.trim()}</span>.</p>
          <OtpInput value={code} onChange={setCode} />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="text-sm font-medium text-ink-2 underline underline-offset-2" disabled={busy} onClick={() => setSent(false)}>Use a different email</button>
            <button type="submit" className={primaryButton} disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify"}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

type Device = { id: string; is_current: boolean; device_name: string | null; browser_name: string | null; login_location: string | null; created_at: string; last_used_at: string };
const deviceName = (device: Device) => device.device_name ?? (device.is_current ? "Current browser" : "Unidentified device");

function SignedInDevices({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const [revision, setRevision] = useState(0);
  const { data, error } = usePortalQuery<{ sessions: Device[] }>("user", `/auth/sessions?r=${revision}`, token);
  const [selected, setSelected] = useState<Device | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const reload = () => setRevision((value) => value + 1);

  async function signOut(device: Device) {
    setBusy(true);
    setActionError("");
    try {
      await portalFetch("user", `/auth/sessions/${device.id}`, { method: "DELETE", token });
      setSelected(null);
      if (device.is_current) onSignOut();
      else reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn’t sign that device out.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="signed-in-devices" aria-label="Signed-in devices" className="min-w-0 scroll-mt-24">
      <h2 className="mb-3 text-lg font-semibold text-ink">Signed-in devices</h2>
      {error && <SearchFailure title="Couldn’t load your devices" onRetry={reload} retrying={false} />}
      {!error && data === null && <SkeletonRows label="Loading signed-in devices" detail />}
      {data?.sessions.length === 0 && <EmptyState title="No active sessions" />}
      {!!data?.sessions.length && (
        <ul className="divide-y divide-line overflow-hidden rounded-panel border border-line bg-surface">
          {data.sessions.map((device) => {
            const Icon = /iPhone|iPad|Android/i.test(device.device_name ?? "") ? Smartphone : Laptop;
            return (
              <li key={device.id} className={`grid items-center gap-x-5 gap-y-3 p-4 md:grid-cols-[minmax(160px,0.8fr)_minmax(0,1.6fr)_auto] md:px-5 ${device.is_current ? "bg-surface-2" : ""}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-row border border-line bg-surface text-ink-2">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="text-sm font-semibold text-ink">{deviceName(device)}</h3>
                      {device.is_current && <span className="rounded-full bg-verified-soft px-2 py-0.5 text-xs font-medium text-verified">This device</span>}
                    </div>
                    {device.browser_name && <p className="text-xs text-ink-2">{device.browser_name}</p>}
                  </div>
                </div>
                <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-xs text-ink-2">
                  <div>
                    <dt>Last sign-in</dt>
                    <dd className="mt-0.5 font-medium text-ink"><time dateTime={device.created_at}>{sessionDate.format(new Date(device.created_at))}</time></dd>
                  </div>
                  <div>
                    <dt>Last active</dt>
                    <dd className="mt-0.5 font-medium text-ink"><time dateTime={device.last_used_at}>{sessionDate.format(new Date(device.last_used_at))}</time></dd>
                  </div>
                  <div className="col-span-2 flex items-start gap-1.5">
                    <MapPin size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
                    <dt className="sr-only">Last sign-in location</dt>
                    <dd className="break-words">{device.login_location ? `${device.login_location} (approx.)` : "Sign-in location unavailable"}</dd>
                  </div>
                </dl>
                <button type="button" className="min-h-9 justify-self-start rounded-row border border-line-strong bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-3 md:justify-self-end"
                  onClick={() => { setActionError(""); setSelected(device); }}>{device.is_current ? "Sign out here" : "Sign out"}</button>
              </li>
            );
          })}
        </ul>
      )}
      {selected && (
        <Modal open title={selected.is_current ? "Sign out here?" : "Sign out this device?"} onClose={() => { if (!busy) setSelected(null); }}>
          <p className="text-sm text-ink-2">
            {selected.is_current ? "You’ll need to sign in again to manage your account." : `All sign-ins for ${deviceName(selected)} in this browser profile will be revoked.`}
          </p>
          {actionError && <div className="mt-3"><ErrorBox text={actionError} /></div>}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" className={secondaryButton} disabled={busy} onClick={() => setSelected(null)}>Cancel</button>
            <button type="button" className={dangerButton} disabled={busy} onClick={() => void signOut(selected)}>{busy ? "Signing out…" : "Sign out"}</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

export function CustomerProfile() {
  const { session, setTokens } = usePortalSession("user");
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!session) navigate("/login?next=%2Faccount%2Fprofile");
  }, [session, navigate]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      {session ? <ProfileBody token={session.accessToken} onSignOut={() => setTokens(null)} /> : <main className="flex-1 min-h-[calc(100dvh-4rem)]" />}
      <Footer />
    </div>
  );
}
