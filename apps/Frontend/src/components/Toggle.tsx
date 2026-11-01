/**
 * A switch built on a real checkbox — it keeps keyboard operation, the
 * focus ring and screen-reader state for free, which a div with an onClick
 * would have to reimplement. `role="switch"` is the only thing added, so it
 * is announced as on/off rather than checked/unchecked.
 */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Required: the control has no visible text of its own. */
  label: string;
}) {
  return (
    <label className={`inline-flex items-center ${disabled ? "opacity-40" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      {/* The knob is a child, not a sibling of the input, so its moved state
          has to be reached through the track — `peer-checked:` alone only
          ever matches siblings. */}
      <span
        aria-hidden="true"
        className="relative h-5 w-9 shrink-0 rounded-full bg-line-strong transition-colors peer-checked:bg-verified peer-checked:[&>span]:translate-x-4 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink"
      >
        <span className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-surface shadow-sm transition-transform" />
      </span>
    </label>
  );
}
