export function VehicleSkeletons({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="motion-safe:animate-pulse">
          <div className="aspect-[4/3] rounded-[18px] bg-surface-3" />
          <div className="pt-3">
            <div className="h-6 w-3/4 rounded bg-surface-3" />
            <div className="h-5 w-3/5 rounded bg-surface-3" />
            <div className="h-5 w-2/3 rounded bg-surface-3" />
            <div className="-mt-2 h-9 flex items-center justify-between gap-3">
              <div className="w-20 h-5 rounded bg-surface-3" />
              <div className="-translate-y-[10px] w-28 h-9 rounded-full bg-surface-3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SearchFailure({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div className="rounded-panel border border-line bg-surface-2 px-5 py-6">
      <p role="alert" className="text-sm text-ink">We couldn’t load vehicles</p>
      <button type="button" onClick={onRetry} disabled={retrying} className="mt-3 h-9 px-4 rounded-full border border-line-strong text-sm font-medium text-ink disabled:opacity-50">
        {retrying ? "Trying again…" : "Try again"}
      </button>
    </div>
  );
}
