import { useState } from "react";

export function ShareButton({ title, text }: { title: string; text: string }) {
  const [feedback, setFeedback] = useState<"copied" | "manual" | null>(null);

  async function share() {
    const url = window.location.href;
    setFeedback(null);
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setFeedback("copied");
    } catch {
      setFeedback("manual");
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={share}
        className="glass-panel inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm font-medium text-ink hover:bg-surface-3 transition-colors"
      >
        <ShareIcon />
        Share
      </button>
      {feedback === "copied" && <span role="status" className="rounded bg-surface px-2 text-sm text-ink">Link copied</span>}
      {feedback === "manual" && (
        <label className="rounded-row bg-surface p-2 text-sm text-ink">
          Copy this link
          <input className="mt-1 block w-48 max-w-full rounded border border-line px-2" readOnly value={window.location.href}
            onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3v12M12 3l-4 4M12 3l4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
