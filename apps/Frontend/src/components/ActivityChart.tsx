/** Buckets real rows by day for the last 7 days — no synthetic numbers. */
export function bucketByDay(rows: { dateField: string }[], days = 7): { label: string; count: number }[] {
  const buckets: { label: string; key: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    buckets.push({
      label: d.toLocaleDateString("en-IN", { weekday: "short" }),
      key: d.toISOString().slice(0, 10),
      count: 0,
    });
  }
  for (const r of rows) {
    const key = new Date(r.dateField).toISOString().slice(0, 10);
    const bucket = buckets.find((b) => b.key === key);
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

export function ActivityChart({ data, label }: { data: { label: string; count: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="bg-surface rounded-panel border border-line px-5 py-4">
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="tnum text-xs text-ink-3">{total} total</p>
      </div>
      <div className="flex items-end gap-2 h-24">
        {data.map((d) => (
          <div key={d.label} className="flex-1 flex flex-col items-center gap-1.5">
            <div
              className="w-full rounded-t bg-verified/70"
              style={{ height: `${Math.max(4, (d.count / max) * 80)}px` }}
              title={`${d.count}`}
            />
            <span className="text-[10px] text-ink-4">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
