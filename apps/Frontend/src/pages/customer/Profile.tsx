import { useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Ellipsis, Laptop, MapPin, Plus, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import { useLocation } from "wouter";
import { Header } from "../../components/Header";
import { Footer } from "../../components/Footer";
import { Modal } from "../../components/Modal";
import { usePortalSession, usePortalQuery, portalFetch, type Row } from "../../lib/portal";
import { DateField } from "../../components/DateTimeField";
import { StatusPill } from "../../components/DataTable";
import { ErrorBox, TextField } from "../../components/AuthFormBits";
import { EmptyState, feedbackActionClass, LoadingSkeleton, SkeletonBlock, SkeletonRows } from "../../components/ContentFeedback";
import { SearchFailure } from "../../components/SearchFeedback";
import { dateLabel } from "../../lib/format";
import { RiderVerification } from "../../components/RiderVerification";

const primaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-row bg-amber px-4 text-sm font-semibold text-on-amber hover:brightness-95 disabled:opacity-50";
const secondaryButton = "inline-flex min-h-10 items-center justify-center rounded-row border border-line-strong px-4 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50";
const dangerButton = "inline-flex min-h-10 items-center justify-center rounded-row bg-danger px-4 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50";
const indiaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
const sessionDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

function licenceStatus(rider: Row, today: string) {
  if (rider.licence_status === "VERIFIED" && typeof rider.licence_expires_on === "string" && rider.licence_expires_on < today) return "EXPIRED";
  return String(rider.licence_status ?? "UNVERIFIED");
}

function ProfileBody({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const [revision, setRevision] = useState(0);
  const { data, error } = usePortalQuery<{ riders: Row[] }>("user", `/riders?r=${revision}`, token);
  const [adding, setAdding] = useState(false);
  const reload = () => setRevision((value) => value + 1);
  const today = indiaDay.format(new Date());
  const riders = (data?.riders ?? []).map((rider) => ({ rider, status: licenceStatus(rider, today) }));
  const needsAttention = riders.filter(({ status }) => status !== "VERIFIED");
  const verified = riders.filter(({ status }) => status === "VERIFIED");

  return (
    <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-ink sm:text-3xl">Riders &amp; profile</h1>
          <p className="mt-1 text-sm text-ink-2">Manage the riders and devices on your account.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={primaryButton} onClick={() => setAdding(true)}>
            <Plus size={17} aria-hidden="true" /> Add rider
          </button>
          <a href="#signed-in-devices" className="text-sm font-medium text-ink-2 underline underline-offset-4 hover:text-ink lg:hidden">Signed-in devices</a>
        </div>
      </div>

      <div className="space-y-8 sm:space-y-10">
        <section aria-label="Riders" className="min-w-0 space-y-6">
          {error && <SearchFailure title="Couldn’t load your riders" onRetry={reload} retrying={false} />}
          {!error && data === null && (
            <LoadingSkeleton label="Loading riders" className="grid gap-3 sm:grid-cols-2">
              {[0, 1].map((index) => (
                <div key={index} className="space-y-3 rounded-panel border border-line p-4">
                  <div className="flex items-center gap-3">
                    <SkeletonBlock className="size-10 rounded-full" />
                    <SkeletonBlock className="h-4 w-2/5" />
                  </div>
                  <SkeletonBlock className="h-4 w-1/2" />
                </div>
              ))}
            </LoadingSkeleton>
          )}
          {data && !riders.length && (
            <EmptyState title="No riders added yet" description="Add a rider to verify their driving licence.">
              <button type="button" className={feedbackActionClass} onClick={() => setAdding(true)}>Add a rider</button>
            </EmptyState>
          )}
          {[
            { title: "Needs attention", entries: needsAttention, attention: true },
            { title: "Verified riders", entries: verified, attention: false },
          ].filter(({ entries }) => entries.length).map(({ title, entries, attention }) => (
            <section key={title} aria-label={title}>
              <h2 className="mb-3 text-lg font-semibold text-ink">{title}</h2>
              <div className={`grid gap-3 ${attention ? "" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
                {entries.map(({ rider, status }) => (
                  <RiderCard key={String(rider.id)} rider={rider} status={status} token={token} onChanged={reload} />
                ))}
              </div>
            </section>
          ))}
        </section>

        <SignedInDevices token={token} onSignOut={onSignOut} />
      </div>

      {adding && <RiderForm token={token} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </main>
  );
}

function RiderCard({ rider, status, token, onChanged }: { rider: Row; status: string; token: string; onChanged: () => void }) {
  const [action, setAction] = useState<"edit" | "remove" | "verify" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = String(rider.name ?? "");
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0] ?? "").join("").toLocaleUpperCase();
  const verified = status === "VERIFIED";
  const menuItem = "flex cursor-pointer items-center rounded-row px-3 py-2 text-sm font-medium outline-none data-[highlighted]:bg-surface-2";

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await portalFetch("user", `/riders/${rider.id}`, { method: "DELETE", token });
      setAction(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t remove that rider.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`min-w-0 rounded-panel border p-4 ${verified ? "border-line bg-surface" : "border-warning/20 bg-warning-soft/40"}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${verified ? "bg-verified-soft text-verified" : "bg-warning-soft text-warning"}`}>
          {initials || <UserRound size={17} />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-base font-semibold leading-snug text-ink">{name}</h3>
          <p className="mt-0.5 text-xs text-ink-2">{rider.dob ? `Born ${dateLabel(rider.dob)}` : "Date of birth missing"}</p>
        </div>
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <button type="button" aria-label={`Manage ${name}`} className="grid size-9 shrink-0 place-items-center rounded-row text-ink-2 hover:bg-surface-3 focus-visible:outline">
              <Ellipsis size={19} aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={5} className="z-50 min-w-36 rounded-row border border-line bg-surface p-1 shadow-lg">
              <DropdownMenu.Item className={`${menuItem} text-ink`} onSelect={() => setAction("edit")}>Edit rider</DropdownMenu.Item>
              <DropdownMenu.Item className={`${menuItem} text-danger`} onSelect={() => { setError(""); setAction("remove"); }}>Remove rider</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line pt-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusPill value={status} />
          {rider.licence_expires_on && (verified || status === "EXPIRED") ? (
            <span className="text-xs text-ink-2">{verified ? "Valid until " : ""}{dateLabel(rider.licence_expires_on)}</span>
          ) : null}
        </div>
        {!verified && (
          <button type="button" onClick={() => setAction("verify")} className="inline-flex min-h-9 items-center gap-1.5 rounded-row border border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-3">
            <ShieldCheck size={15} aria-hidden="true" /> {status === "EXPIRED" ? "Verify renewed licence" : "Verify licence"}
          </button>
        )}
      </div>

      {action === "edit" && <RiderForm rider={rider} token={token} onClose={() => setAction(null)} onSaved={() => { setAction(null); onChanged(); }} />}
      {action === "verify" && (
        <Modal open title="Verify driving licence" onClose={() => setAction(null)}>
          <RiderVerification riderId={String(rider.id)} riderName={name} token={token}
            onDone={() => { setAction(null); onChanged(); }} onCancel={() => setAction(null)} />
        </Modal>
      )}
      {action === "remove" && (
        <Modal open title="Remove this rider?" onClose={() => { if (!busy) setAction(null); }}>
          <p className="text-sm text-ink-2"><strong className="text-ink">{name}</strong> will be removed from your rider list and won’t be available for future bookings.</p>
          {error && <div className="mt-3"><ErrorBox text={error} /></div>}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" className={secondaryButton} disabled={busy} onClick={() => setAction(null)}>Keep rider</button>
            <button type="button" className={dangerButton} disabled={busy} onClick={() => void remove()}>{busy ? "Removing…" : "Remove rider"}</button>
          </div>
        </Modal>
      )}
    </article>
  );
}

function RiderForm({ rider, token, onClose, onSaved }: { rider?: Row; token: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(String(rider?.name ?? ""));
  const [dob, setDob] = useState(String(rider?.dob ?? "").slice(0, 10));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setError("");
    setBusy(true);
    try {
      await portalFetch("user", rider ? `/riders/${rider.id}` : "/riders", {
        method: rider ? "PATCH" : "POST", token, body: { name: name.trim(), dob: dob || undefined },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t save the rider.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={rider ? "Edit rider" : "Add a rider"} onClose={() => { if (!busy) onClose(); }}>
      <form onSubmit={(event) => { event.preventDefault(); if (!busy && name.trim()) void save(); }}>
        {error && <div className="mb-3"><ErrorBox text={error} /></div>}
        <TextField label="Full name" value={name} onChange={setName} autoFocus />
        <DateField label="Date of birth (optional)" value={dob} onChange={setDob} fromYear={1920} toDate={new Date()} />
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={secondaryButton} disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className={primaryButton} disabled={busy || !name.trim()}>
            {busy ? "Saving…" : rider ? "Save changes" : "Add rider"}
          </button>
        </div>
      </form>
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
      {session ? <ProfileBody token={session.accessToken} onSignOut={() => setTokens(null)} /> : <main className="flex-1" />}
      <Footer />
    </div>
  );
}
