import { useRef } from "react";

export function OtpInput({
  value,
  onChange,
  length = 6,
  autoFocus = true,
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  function setDigit(i: number, d: string) {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join(""));
  }

  function handleChange(i: number, raw: string) {
    let typed = raw.replace(/\D/g, "");
    // Typing into a filled box (cursor beside the old digit): keep the new one.
    if (typed.length === 2 && digits[i]) typed = typed.startsWith(digits[i]) ? typed[1]! : typed[0]!;
    // SMS autofill drops the whole code into one box: spread it from here.
    if (typed.length > 1) {
      const next = digits.slice();
      for (let k = 0; k < typed.length && i + k < length; k++) next[i + k] = typed[k]!;
      onChange(next.join(""));
      refs.current[Math.min(i + typed.length, length - 1)]?.focus();
      return;
    }
    setDigit(i, typed);
    if (typed && i < length - 1) refs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    // An empty box here means focus already auto-advanced past the digit the
    // user actually wants to delete -- clear that previous box in the same
    // keypress, not just move focus to it, so one Backspace does what it looks like it does.
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      e.preventDefault();
      setDigit(i - 1, "");
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < length - 1) {
      refs.current[i + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted.padEnd(length, "").slice(0, length));
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  return (
    <div className="flex gap-2" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          autoFocus={autoFocus && i === 0}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          value={d}
          onFocus={(e) => e.target.select()}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className="w-11 h-12 text-center text-lg font-semibold tnum rounded-row border border-line-strong outline-none focus:border-ink focus:ring-1 focus:ring-ink transition-colors"
        />
      ))}
    </div>
  );
}
