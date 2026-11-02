import { useEffect, useRef, useState } from "react";
import { PortalApiError, portalFetch } from "../lib/portal";
import { DateField } from "./DateTimeField";
import { ErrorBox, TextField } from "./AuthFormBits";
import { UploadFailedError, uploadFile } from "../lib/upload";

/**
 * The whole rider verification flow, in one component, used by both the
 * Profile page and Checkout.
 *
 * Those two pages each had their own copy of a verify form, which is how the
 * date of birth came to be asked twice. There is one copy now; the server's
 * session state decides what is on screen, not local flags.
 *
 * The backend contract is in docs/dl-verification.md.
 */
type SessionState =
  | "CONSENT_PENDING"
  | "DOCUMENT_PENDING"
  | "DOCUMENT_VERIFIED"
  | "DOCUMENT_FAILED"
  | "PHOTO_PENDING"
  | "MANUAL_REVIEW_REQUIRED"
  | "VERIFIED"
  | "REJECTED"
  | "EXPIRED"
  | "REVOKED";

interface SessionResult {
  sessionId?: string;
  state: SessionState;
  consentUrl?: string;
  rejectionCode?: string;
}

/**
 * The server answers with a code; the customer reads a sentence. One map, in
 * one place, so no screen invents its own wording for the same outcome.
 */
const REJECTION_COPY: Record<string, string> = {
  LICENCE_NOT_FOUND:
    "The transport department has no record of that licence number with that date of birth. Check both and try again.",
  LICENCE_INVALID: "That licence came back as not valid. Check the number and your date of birth.",
  LICENCE_EXPIRED: "That licence has expired. You'll need to renew it before renting.",
  STATUS_NOT_ACTIVE:
    "That licence is recorded as suspended or cancelled, so we can't rent against it.",
  LEARNER_LICENCE: "Learner's licences can't be used to rent — we need a full licence.",
  CONSENT_DENIED: "DigiLocker consent wasn't given, so nothing was shared. You can try again.",
  CONSENT_EXPIRED: "That DigiLocker request timed out. Start again when you're ready.",
  PROVIDER_UNAVAILABLE:
    "We couldn't reach the licence check just now, so a person will review this instead. Nothing more is needed from you.",
  DOCUMENT_UNAVAILABLE:
    "DigiLocker didn't return your licence. A person will review this instead.",
  DOCUMENT_UNREADABLE:
    "We couldn't read the document DigiLocker sent. A person will review this instead.",
  CANCELLED: "You cancelled this check. Start again whenever you like.",
};

function copyFor(code: string | undefined, fallback: string): string {
  return (code && REJECTION_COPY[code]) || fallback;
}

type Step = "intro" | "consent" | "method" | "digilocker" | "dl-form" | "photo" | "done";

export function RiderVerification({
  riderId,
  riderName,
  token,
  onDone,
  onCancel,
}: {
  riderId: string;
  riderName: string;
  token: string;
  /** Called once the session reaches a state worth reloading the page for. */
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState<Step>("intro");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<SessionState | null>(null);
  const [rejectionCode, setRejectionCode] = useState<string | undefined>();
  const [consentText, setConsentText] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [licenceNumber, setLicenceNumber] = useState("");
  const [dob, setDob] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  /** Only the session id, and only so an interrupted flow can be resumed. */
  const storageKey = `rm.verification.${riderId}`;

  // The exact wording the server stores, so what is agreed to and what is
  // recorded cannot drift apart.
  useEffect(() => {
    portalFetch<{ consentText: string }>("user", "/riders/verification/consent", { token })
      .then((r) => setConsentText(r.consentText))
      .catch(() => setConsentText(null));
  }, [token]);

  // Resume where the SERVER thinks we are. A local flag would survive a
  // reload that the session did not.
  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey);
    if (!saved) return;
    portalFetch<{ state: SessionState; method: string; rejection_code?: string }>(
      "user",
      `/riders/${riderId}/verification/${saved}`,
      { token },
    )
      .then((live) => {
        setSessionId(saved);
        applyState(live.state, live.rejection_code, live.method === "DIGILOCKER");
      })
      .catch(() => sessionStorage.removeItem(storageKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riderId, token]);

  function applyState(next: SessionState, code?: string, digilocker = false) {
    setState(next);
    setRejectionCode(code);
    if (next === "CONSENT_PENDING") setStep(digilocker ? "digilocker" : "dl-form");
    else if (next === "DOCUMENT_PENDING") setStep(digilocker ? "digilocker" : "dl-form");
    else if (next === "PHOTO_PENDING") setStep("photo");
    else setStep("done");
  }

  function remember(id: string) {
    setSessionId(id);
    try {
      sessionStorage.setItem(storageKey, id);
    } catch {
      // Private browsing. The flow still works, it just cannot be resumed.
    }
  }

  function forget() {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* see above */
    }
  }

  async function run<T>(fn: () => Promise<T>, fallback: string): Promise<T | null> {
    setError(null);
    setBusy(true);
    try {
      return await fn();
    } catch (err) {
      if (err instanceof UploadFailedError) setError(err.message);
      else setError(err instanceof PortalApiError ? err.message : fallback);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function start(method: "DIGILOCKER" | "DL_NUMBER") {
    const result = await run(
      () =>
        portalFetch<SessionResult>("user", `/riders/${riderId}/verification`, {
          method: "POST",
          token,
          body: {
            method,
            consent: true,
            ...(method === "DIGILOCKER" ? { redirectUrl: window.location.href } : {}),
          },
        }),
      "Couldn't start the licence check.",
    );
    if (!result?.sessionId) return;
    remember(result.sessionId);
    setState(result.state);
    if (method === "DIGILOCKER") {
      setStep("digilocker");
      if (result.consentUrl) window.open(result.consentUrl, "_blank", "noopener");
    } else {
      setStep("dl-form");
    }
  }

  async function submitDlNumber() {
    const result = await run(
      () =>
        portalFetch<SessionResult>(
          "user",
          `/riders/${riderId}/verification/${sessionId}/dl-number`,
          { method: "POST", token, body: { licenceNumber, dob } },
        ),
      "Couldn't check that licence.",
    );
    if (!result) return;
    applyState(result.state, result.rejectionCode);
    if (result.state === "VERIFIED") onDone();
  }

  async function confirmDigilocker() {
    const result = await run(
      () =>
        portalFetch<SessionResult>(
          "user",
          `/riders/${riderId}/verification/${sessionId}/digilocker/complete`,
          { method: "POST", token },
        ),
      "Couldn't confirm that DigiLocker consent.",
    );
    if (!result) return;
    if (result.state === "CONSENT_PENDING") {
      // Not an error: they have not finished on DigiLocker's side yet.
      setError("It looks like the DigiLocker consent isn't finished yet. Complete it, then try again.");
      return;
    }
    applyState(result.state, result.rejectionCode, true);
    if (result.state === "VERIFIED") onDone();
  }

  async function uploadPhoto(file: File) {
    const result = await run(
      () =>
        uploadFile<{ state: SessionState }>({
          portal: "user",
          token,
          file,
          presignPath: `/riders/${riderId}/verification/${sessionId}/photo`,
          confirmPath: `/riders/${riderId}/verification/${sessionId}/photo/confirm`,
          confirmBody: { contentType: file.type },
        }),
      "Couldn't upload that photo.",
    );
    if (!result) return;
    applyState(result.state);
    onDone();
  }

  async function cancel() {
    if (sessionId) {
      await run(
        () =>
          portalFetch("user", `/riders/${riderId}/verification/${sessionId}/cancel`, {
            method: "POST",
            token,
          }),
        "Couldn't cancel that.",
      );
    }
    forget();
    onCancel?.();
  }

  function restart() {
    forget();
    setSessionId(null);
    setState(null);
    setRejectionCode(undefined);
    setLicenceNumber("");
    setDob("");
    setStep("intro");
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <ErrorBox text={error} />}

      {step === "intro" && (
        <>
          <p className="text-sm text-ink-2">
            Before {riderName || "this rider"} can ride, we check their driving licence with the
            issuing authority. It takes a minute.
          </p>
          <ul className="text-sm text-ink-3 list-disc pl-5 flex flex-col gap-1">
            <li>We never store the full licence number — only the last few digits.</li>
            <li>The licence photo is shown to shop staff at pickup, so they can confirm it's you.</li>
            <li>Everything is deleted after your last rental.</li>
          </ul>
          <Buttons
            primary={{ label: "Continue", onClick: () => setStep("consent"), busy }}
            secondary={onCancel ? { label: "Not now", onClick: onCancel } : undefined}
          />
        </>
      )}

      {step === "consent" && (
        <>
          <label className="flex gap-3 items-start text-sm text-ink-2 cursor-pointer">
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-ink)]"
            />
            {/* The server's own wording, fetched above -- not a paraphrase. */}
            <span>{consentText ?? "Loading the consent wording…"}</span>
          </label>
          <Buttons
            primary={{
              label: "I agree",
              onClick: () => setStep("method"),
              busy,
              disabled: !consented || !consentText,
            }}
            secondary={onCancel ? { label: "Cancel", onClick: onCancel } : undefined}
          />
        </>
      )}

      {step === "method" && (
        <>
          <p className="text-sm text-ink-2">How would you like to verify?</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => start("DIGILOCKER")}
            className="text-left rounded-panel border border-line p-4 hover:bg-surface-2 transition-colors disabled:opacity-40"
          >
            <span className="block font-medium text-ink">Use DigiLocker</span>
            <span className="block text-xs text-ink-3 mt-0.5">
              Fastest, and brings your licence photo with it.
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => start("DL_NUMBER")}
            className="text-left rounded-panel border border-line p-4 hover:bg-surface-2 transition-colors disabled:opacity-40"
          >
            <span className="block font-medium text-ink">Enter licence number</span>
            <span className="block text-xs text-ink-3 mt-0.5">
              Your licence number and date of birth.
            </span>
          </button>
        </>
      )}

      {step === "dl-form" && (
        <>
          <TextField label="Licence number" value={licenceNumber} onChange={setLicenceNumber} autoFocus />
          <DateField label="Date of birth" value={dob} onChange={setDob} fromYear={1920} toDate={new Date()} />
          <Buttons
            primary={{
              label: busy ? "Checking…" : "Check my licence",
              onClick: submitDlNumber,
              busy,
              disabled: licenceNumber.trim().length < 6 || !dob,
            }}
            secondary={{ label: "Cancel", onClick: cancel }}
          />
        </>
      )}

      {step === "digilocker" && (
        <>
          <p className="text-sm text-ink-2">
            Finish the consent in the DigiLocker tab that just opened, then come back here.
          </p>
          <Buttons
            primary={{ label: busy ? "Checking…" : "I've finished in DigiLocker", onClick: confirmDigilocker, busy }}
            secondary={{ label: "Cancel", onClick: cancel }}
          />
        </>
      )}

      {step === "photo" && (
        <>
          <p className="text-sm text-ink-2">
            Your licence checked out, but the authority didn't send a photo. Add a clear photo of{" "}
            {riderName || "the rider"}'s face so shop staff can confirm them at pickup.
          </p>
          <p className="text-xs text-ink-4">
            Because this photo isn't from the licence itself, someone from RetroMobi will take a
            quick look before it's approved.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadPhoto(file);
            }}
          />
          <Buttons
            primary={{
              label: busy ? "Uploading…" : "Choose a photo",
              onClick: () => fileInput.current?.click(),
              busy,
            }}
            secondary={{ label: "Cancel", onClick: cancel }}
          />
        </>
      )}

      {step === "done" && <Outcome state={state} rejectionCode={rejectionCode} onRestart={restart} onDone={onDone} />}
    </div>
  );
}

function Outcome({
  state,
  rejectionCode,
  onRestart,
  onDone,
}: {
  state: SessionState | null;
  rejectionCode?: string;
  onRestart: () => void;
  onDone: () => void;
}) {
  if (state === "VERIFIED") {
    return (
      <>
        <p className="text-sm text-ink-2">
          Verified. Shop staff will check the licence itself when you collect the vehicle.
        </p>
        <Buttons primary={{ label: "Done", onClick: onDone }} />
      </>
    );
  }

  if (state === "MANUAL_REVIEW_REQUIRED") {
    return (
      <>
        <p className="text-sm text-ink-2">
          {copyFor(
            rejectionCode,
            "Someone from RetroMobi needs to look at this before it's approved. We'll let you know — usually within a day.",
          )}
        </p>
        <p className="text-xs text-ink-4">
          If you'd rather not wait, you can bring your original licence to the shop and they'll
          verify you in person.
        </p>
        <Buttons primary={{ label: "Done", onClick: onDone }} />
      </>
    );
  }

  if (state === "EXPIRED" || state === "REVOKED") {
    return (
      <>
        <p className="text-sm text-ink-2">
          This check is no longer current and needs doing again.
        </p>
        <Buttons primary={{ label: "Start again", onClick: onRestart }} />
      </>
    );
  }

  // DOCUMENT_FAILED and REJECTED. Both are finished, so a retry starts fresh.
  return (
    <>
      <p className="text-sm text-ink-2">
        {copyFor(rejectionCode, "That licence couldn't be verified.")}
      </p>
      <Buttons
        primary={{ label: "Try again", onClick: onRestart }}
        secondary={{ label: "Done", onClick: onDone }}
      />
    </>
  );
}

function Buttons({
  primary,
  secondary,
}: {
  primary: { label: string; onClick: () => void; busy?: boolean; disabled?: boolean };
  secondary?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={primary.busy || primary.disabled}
        onClick={primary.onClick}
        className="h-10 px-4 rounded-row bg-ink text-surface font-medium text-sm disabled:opacity-40 hover:bg-ink-2 transition-colors"
      >
        {primary.label}
      </button>
      {secondary && (
        <button
          type="button"
          onClick={secondary.onClick}
          className="h-10 px-2 text-sm text-ink-3 hover:text-ink"
        >
          {secondary.label}
        </button>
      )}
    </div>
  );
}
