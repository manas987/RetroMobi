import type { ReactNode } from "react";

export const feedbackActionClass = "inline-flex min-h-10 items-center justify-center rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-3";

export function EmptyState({ title, description, children, className = "" }: {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-panel border border-line bg-surface-2 px-5 py-8 text-center ${className}`}>
      <p className="font-semibold text-ink">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-2">{description}</p>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function LoadingSkeleton({ label, children, className = "" }: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <>
      <span role="status" className="sr-only">{label}</span>
      <div aria-hidden="true" className={`motion-safe:animate-pulse ${className}`}>{children}</div>
    </>
  );
}

export function SkeletonBlock({ className }: { className: string }) {
  return <div className={`rounded bg-surface-3 ${className}`} />;
}

export function SkeletonRows({ label, count = 2, detail = false }: {
  label: string;
  count?: number;
  detail?: boolean;
}) {
  return (
    <LoadingSkeleton label={label} className="space-y-2">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center justify-between gap-4 rounded-row border border-line px-4 py-3">
          <div className="w-1/2 space-y-2">
            <SkeletonBlock className="h-4 w-3/4" />
            {detail && <SkeletonBlock className="h-3 w-full" />}
          </div>
          <SkeletonBlock className="h-5 w-14 rounded-full" />
        </div>
      ))}
    </LoadingSkeleton>
  );
}
