import { useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Ellipsis, Plus, ShieldCheck, UserRound } from "lucide-react";
import { useLocation } from "wouter";
import { Header } from "../../components/Header";
import { Footer } from "../../components/Footer";
import { Modal } from "../../components/Modal";
import { usePortalSession, usePortalQuery, portalFetch, type Row } from "../../lib/portal";
import { DateField } from "../../components/DateTimeField";
import { StatusPill } from "../../components/DataTable";
import { ErrorBox, TextField } from "../../components/AuthFormBits";
import { EmptyState, feedbackActionClass, LoadingSkeleton, SkeletonBlock } from "../../components/ContentFeedback";
import { SearchFailure } from "../../components/SearchFeedback";
import { dateLabel } from "../../lib/format";
import { RiderVerification } from "../../components/RiderVerification";

const primaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-row bg-amber px-4 text-sm font-semibold text-on-amber hover:brightness-95 disabled:opacity-50";
const secondaryButton = "inline-flex min-h-10 items-center justify-center rounded-row border border-line-strong px-4 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50";
const dangerButton = "inline-flex min-h-10 items-center justify-center rounded-row bg-danger px-4 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50";
const indiaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });

function licenceStatus(rider: Row, today: string) {
  if (rider.licence_status === "VERIFIED" && typeof rider.licence_expires_on === "string" && rider.licence_expires_on < today) return "EXPIRED";
  return String(rider.licence_status ?? "UNVERIFIED");
}

function RidersBody({ token }: { token: string }) {
  const [revision, setRevision] = useState(0);
  const { data, error } = usePortalQuery<{ riders: Row[] }>("user", `/riders?r=${revision}`, token);
  const [adding, setAdding] = useState(false);
  const reload = () => setRevision((value) => value + 1);
  const today = indiaDay.format(new Date());
  // One list, with riders who still need a licence check first.
  const riders = (data?.riders ?? [])
    .map((rider) => ({ rider, status: licenceStatus(rider, today) }))
    .sort((a, b) => Number(a.status === "VERIFIED") - Number(b.status === "VERIFIED"));
  const pending = riders.filter(({ status }) => status !== "VERIFIED").length;

  return (
    <main className="mx-auto w-full max-w-[1180px] flex-1 min-h-[calc(100dvh-4rem)] px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-ink sm:text-3xl">Riders</h1>
          <p className="mt-1 text-sm text-ink-2">Everyone who rides on your bookings. Each rider needs a verified driving licence.</p>
        </div>
        <button type="button" className={primaryButton} onClick={() => setAdding(true)}>
          <Plus size={17} aria-hidden="true" /> Add rider
        </button>
      </div>

      {error && <SearchFailure title="Couldn’t load your riders" onRetry={reload} retrying={false} />}
      {!error && data === null && (
        <LoadingSkeleton label="Loading riders" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
      {pending > 0 && (
        <p role="status" className="mb-4 rounded-row border border-warning/20 bg-warning-soft/40 px-4 py-3 text-sm text-ink">
          {pending === 1 ? "1 rider needs" : `${pending} riders need`} a verified licence before they can ride.
        </p>
      )}
      {!!riders.length && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {riders.map(({ rider, status }) => (
            <RiderCard key={String(rider.id)} rider={rider} status={status} token={token} onChanged={reload} />
          ))}
        </div>
      )}

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
    <article className={`flex min-w-0 flex-col rounded-panel border p-4 ${verified ? "border-line bg-surface" : "border-warning/20 bg-warning-soft/40"}`}>
      <div className="mb-3 flex items-start gap-3">
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

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line pt-3">
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

export function CustomerRiders() {
  const { session } = usePortalSession("user");
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!session) navigate("/login?next=%2Faccount%2Friders");
  }, [session, navigate]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      {session ? <RidersBody token={session.accessToken} /> : <main className="flex-1 min-h-[calc(100dvh-4rem)]" />}
      <Footer />
    </div>
  );
}
