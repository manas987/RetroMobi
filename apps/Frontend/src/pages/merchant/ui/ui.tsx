import { useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as RSelect from "@radix-ui/react-select";
import { Link } from "wouter";
import { CalendarDays, Check, ChevronDown, X, type LucideIcon } from "lucide-react";
import { enIN } from "react-day-picker/locale/en-IN";
import { hi } from "react-day-picker/locale/hi";
import { Calendar } from "../../../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import type { Tone } from "../../../lib/bookingStage";
import { useT } from "../../../i18n";
import { istDay } from "../../../lib/format";

/**
 * The merchant console's building blocks. Built for people new to software:
 * big type, one primary action per card, an icon next to every label, and
 * colour that always means the same thing (see TONE).
 */

/** The only place merchant tone colours are defined. green done, amber needs
 *  you, red late/problem, blue under way, grey inactive. */
export const TONE: Record<Tone, { chip: string; icon: string; dot: string }> = {
  good: { chip: "bg-verified-soft text-verified", icon: "bg-verified-soft text-verified", dot: "bg-verified" },
  attention: { chip: "bg-amber text-on-amber", icon: "bg-amber text-on-amber", dot: "bg-amber-edge" },
  bad: { chip: "bg-danger-soft text-danger", icon: "bg-danger-soft text-danger", dot: "bg-danger" },
  info: { chip: "bg-info-soft text-info", icon: "bg-info-soft text-info", dot: "bg-info" },
  muted: { chip: "bg-surface-3 text-ink-2", icon: "bg-surface-3 text-ink-2", dot: "bg-ink-4" },
};

export function Chip({ tone, children, icon: Icon }: { tone: Tone; children: ReactNode; icon?: LucideIcon }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${TONE[tone].chip}`}>
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {children}
    </span>
  );
}

export function Card({
  title,
  icon: Icon,
  action,
  children,
  className = "",
  scroll = false,
}: {
  title?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Body scrolls inside the card instead of growing the page -- for
   *  layouts that must fit one screen. */
  scroll?: boolean;
}) {
  return (
    <section className={`bg-surface rounded-card shadow-card p-5 flex flex-col ${scroll ? "min-h-0" : ""} ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
          {title && (
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
              {Icon && <Icon className="h-5 w-5 text-ink-3" aria-hidden />}
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {scroll ? <div className="min-h-0 flex-1 overflow-y-auto -mx-2 px-2">{children}</div> : children}
    </section>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  caption,
  tone,
  href,
  failed,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string | null;
  caption?: ReactNode;
  tone: Tone;
  href?: string;
  failed?: boolean;
}) {
  const { t } = useT();
  const body = (
    <div className="flex items-start gap-4">
      <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${TONE[tone].icon}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-2">{label}</p>
        {failed ? (
          <p className="mt-1 text-sm text-danger">{t("common.couldntLoadShort")}</p>
        ) : (
          <p className="tnum text-3xl font-semibold text-ink leading-tight">{value ?? "—"}</p>
        )}
        {caption && <p className="text-xs text-ink-3">{caption}</p>}
      </div>
    </div>
  );
  const cls = "block bg-surface rounded-card shadow-card p-4 text-left";
  return href ? (
    <Link href={href} className={`${cls} transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-ink`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-base text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

type ButtonVariant = "primary" | "dark" | "secondary" | "ghost" | "danger";

const BUTTON: Record<ButtonVariant, string> = {
  // Amber is a fill under dark text, never text itself.
  primary: "bg-amber text-on-amber hover:bg-amber-edge",
  dark: "bg-ink text-surface hover:bg-ink-2",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-3",
  ghost: "text-ink-2 hover:bg-surface-3 hover:text-ink",
  danger: "bg-danger text-surface hover:opacity-90",
};

export function Button({
  variant = "secondary",
  icon: Icon,
  children,
  size = "md",
  className = "",
  ...rest
}: {
  variant?: ButtonVariant;
  icon?: LucideIcon;
  size?: "md" | "lg";
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
        size === "lg" ? "min-h-14 px-6 text-base" : "min-h-11 px-4 text-sm"
      } ${BUTTON[variant]} ${className}`}
    >
      {Icon && <Icon className="h-5 w-5 shrink-0" aria-hidden />}
      {children}
    </button>
  );
}

export function EmptyState({ icon: Icon, text, action }: { icon: LucideIcon; text: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-8 px-4">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-3 text-ink-3">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <p className="text-sm text-ink-2 max-w-xs">{text}</p>
      {action}
    </div>
  );
}

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  const { t } = useT();
  return (
    <div role="status" aria-label={t("common.loading")} className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-14 rounded-2xl bg-surface-3 animate-pulse" />
      ))}
    </div>
  );
}

export function ErrorNote({ text, onRetry }: { text?: string; onRetry?: () => void }) {
  const { t } = useT();
  return (
    <div role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger flex flex-wrap items-center gap-3">
      <span>{text ?? t("common.couldntLoad")}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}

/**
 * A popup for one task (hand over, return, walk-in), centred on every screen
 * size. Radix Dialog rather than native <dialog>: showModal() puts the dialog
 * in the top layer and makes the rest of the page inert, so the Select and
 * date popovers (portalled to <body>) would open behind it and be unclickable.
 */
export function Sheet({
  open,
  onClose,
  title,
  size = "lg",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** "md" for short confirmations, "lg" for forms. */
  size?: "md" | "lg";
  children: ReactNode;
}) {
  const { t } = useT();
  // Callers usually clear their data as they close (`open={booking != null}`),
  // so keep showing the last open content while the close animation plays
  // instead of collapsing to an empty box.
  const shown = useRef({ title, children });
  if (open) shown.current = { title, children };
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1100] bg-ink/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          // Focus the popup itself, not its first field or the close button: on a
          // phone a focused field throws the keyboard over half the form.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus();
          }}
          className={`fixed left-1/2 top-1/2 z-[1101] flex max-h-[min(88dvh,760px)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl bg-surface shadow-[0_24px_64px_rgba(18,22,26,0.22)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=open]:duration-200 data-[state=closed]:duration-150 ${
            size === "md" ? "max-w-md" : "max-w-lg"
          }`}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line py-3 pl-5 pr-3">
            <Dialog.Title className="text-lg font-semibold leading-snug text-ink">{shown.current.title}</Dialog.Title>
            <Dialog.Close
              aria-label={t("common.close")}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-ink-2 hover:bg-surface-3"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{shown.current.children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: K; label: string; count?: number }[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line mb-5 -mx-1 px-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={tab.key === value}
          onClick={() => onChange(tab.key)}
          className={`min-h-11 px-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${
            tab.key === value ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink"
          }`}
        >
          {tab.label}
          {tab.count != null && <span className="tnum ml-1.5 text-ink-3">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function ViewToggle<K extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string; icon: LucideIcon }[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div role="group" className="inline-flex rounded-2xl bg-surface-3 p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={o.key === value}
          onClick={() => onChange(o.key)}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium ${
            o.key === value ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"
          }`}
        >
          <o.icon className="h-4 w-4" aria-hidden />
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Two validated categorical hues (dataviz validator: all checks pass on the
 *  light surface). Deliberately not the tone colours, which mean states. */
export const SERIES = ["#4b5bd6", "#1b9e8a"] as const;

/**
 * Stacked columns, one per day. Bars capped at 24px, 4px rounded tops, 2px
 * surface gap between segments, hover tooltip per column, and the numbers
 * available as a table for anyone who can't read the bars.
 */
export function BarChart({
  data,
  series,
  format = String,
  tableLabel,
  legend = true,
  fill = false,
}: {
  data: { label: string; values: number[] }[];
  series: string[];
  format?: (n: number) => string;
  tableLabel: string;
  /** Off when the card already shows a keyed legend of its own. */
  legend?: boolean;
  /** Stretch to the parent's remaining height (parent must be a flex column). */
  fill?: boolean;
}) {
  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals);
  const H = 120;
  // A month of day labels can't fit under the bars on a phone: label every
  // `step`-th day, counted back from the last so today is always named.
  const step = data.length > 14 ? Math.ceil(data.length / 10) : 1;

  return (
    <div className={fill ? "flex min-h-0 flex-1 flex-col" : ""}>
      {legend && series.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs text-ink-2">
          {series.map((s, i) => (
            <li key={s} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[i] }} aria-hidden />
              {s}
            </li>
          ))}
        </ul>
      )}
      <div
        className={`flex items-end justify-between gap-1 border-b border-line pt-6 ${fill ? "min-h-20 flex-1" : ""}`}
        style={fill ? undefined : { height: H + 24 }}
        aria-hidden
      >
        {data.map((d, col) => (
          <div key={col} className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            <div className="flex h-full w-full max-w-6 flex-col-reverse gap-0.5">
              {d.values.map((v, i) =>
                v > 0 ? (
                  <div
                    key={i}
                    className={d.values.slice(i + 1).every((x) => x === 0) ? "rounded-t" : ""}
                    style={{ height: `max(3px, ${(v / max) * 100}%)`, background: SERIES[i] }}
                  />
                ) : null,
              )}
            </div>
            <div className="pointer-events-none absolute -top-1 hidden group-hover:block z-10 rounded-lg bg-ink px-2 py-1 text-xs text-surface whitespace-nowrap">
              {d.label}: {format(totals[col]!)}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between gap-1 mt-1.5" aria-hidden>
        {data.map((d, i) => (
          <span key={i} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[11px] text-ink-3">
            {(data.length - 1 - i) % step === 0 ? d.label : ""}
          </span>
        ))}
      </div>
      <details className="mt-3 text-xs text-ink-3">
        <summary className="cursor-pointer">{tableLabel}</summary>
        <table className="mt-2 w-full text-left">
          <tbody>
            {data.map((d, i) => (
              <tr key={i} className="border-t border-line">
                <th className="py-1 font-normal">{d.label}</th>
                {series.map((s, j) => (
                  <td key={s} className="tnum py-1">
                    {series.length > 1 && <span className="sr-only">{s}: </span>}
                    {format(d.values[j] ?? 0)}
                  </td>
                ))}
                {series.length > 1 && <td className="tnum py-1 font-medium text-ink">{format(totals[i]!)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** The one text-input look for merchant forms (inputs, selects, textareas). */
export const INPUT =
  "min-h-12 w-full rounded-2xl border border-line-strong bg-surface px-4 text-base text-ink outline-none focus:border-ink";

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 mb-4">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-ink-3">{hint}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}

export type SelectOption<V extends string> = { value: V; label: string; group?: string };

// Radix reserves "" for "nothing chosen", but filters use "" for "All".
const ALL = "__all";

/** The dropdown for merchant forms and filters, drawn by us rather than the OS. */
export function Select<V extends string>({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  compact = false,
  disabled = false,
  className = "",
}: {
  value: V | "";
  onChange: (v: V) => void;
  options: SelectOption<V>[];
  /** Shown while `value` is "" and no option has the value "". */
  placeholder?: string;
  ariaLabel?: string;
  compact?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const hasAll = options.some((o) => o.value === "");
  const groups: { name?: string; items: SelectOption<V>[] }[] = [];
  for (const o of options) {
    const last = groups[groups.length - 1];
    if (last && last.name === o.group) last.items.push(o);
    else groups.push({ name: o.group, items: [o] });
  }
  return (
    <RSelect.Root
      value={value === "" ? (hasAll ? ALL : "") : value}
      onValueChange={(v) => onChange((v === ALL ? "" : v) as V)}
      disabled={disabled}
    >
      <RSelect.Trigger
        aria-label={ariaLabel}
        className={`group flex w-full min-w-0 items-center justify-between gap-2 rounded-2xl border border-line-strong bg-surface px-4 text-left text-base text-ink outline-none transition-colors hover:border-ink-3 focus-visible:border-ink data-[state=open]:border-ink disabled:opacity-50 ${
          compact ? "min-h-11" : "min-h-12"
        } ${className}`}
      >
        <span className="min-w-0 flex-1 truncate leading-normal">
          <RSelect.Value placeholder={<span className="text-ink-3">{placeholder}</span>} />
        </span>
        <ChevronDown aria-hidden className="h-5 w-5 shrink-0 text-ink-3 transition-transform group-data-[state=open]:rotate-180" />
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          className="z-[1150] flex max-h-[min(var(--radix-select-content-available-height),22rem)] min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_16px_40px_rgba(18,22,26,0.16)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <RSelect.Viewport className="p-1.5">
            {groups.map((g, i) => (
              <RSelect.Group key={`${g.name ?? ""}-${i}`}>
                {g.name && (
                  <RSelect.Label className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-ink-3">{g.name}</RSelect.Label>
                )}
                {g.items.map((o) => (
                  <RSelect.Item
                    key={o.value || ALL}
                    value={o.value || ALL}
                    className="relative flex min-h-11 cursor-pointer select-none items-center rounded-xl py-2 pl-3 pr-10 text-base text-ink outline-none data-[highlighted]:bg-surface-3 data-[state=checked]:font-semibold"
                  >
                    <RSelect.ItemText>{o.label}</RSelect.ItemText>
                    <RSelect.ItemIndicator className="absolute right-3 inline-flex">
                      <Check className="h-5 w-5 text-ink" aria-hidden />
                    </RSelect.ItemIndicator>
                  </RSelect.Item>
                ))}
              </RSelect.Group>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

/**
 * A calendar date ("YYYY-MM-DD", or "" for none). Days before `min` (default:
 * today, since every merchant date is an expiry or a future block) can't be
 * picked; tapping the month title jumps by year for far-off expiries.
 */
export function DateInput({
  value,
  onChange,
  min,
  max,
  placeholder,
  ariaLabel,
  clearable = false,
}: {
  value: string;
  onChange: (day: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  ariaLabel?: string;
  clearable?: boolean;
}) {
  const { t, lang, date } = useT();
  const [open, setOpen] = useState(false);
  // Local noon, so no timezone can push the day across midnight.
  const noon = (day: string) => new Date(`${day}T12:00:00`);
  const lo = noon(min ?? istDay(new Date()));
  const selected = value ? noon(value) : undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className="group flex min-h-12 w-full items-center gap-3 rounded-2xl border border-line-strong bg-surface px-4 text-left text-base outline-none transition-colors hover:border-ink-3 focus-visible:border-ink data-[state=open]:border-ink"
        >
          <CalendarDays className="h-5 w-5 shrink-0 text-ink-3" aria-hidden />
          <span className={`min-w-0 flex-1 truncate leading-normal ${value ? "text-ink" : "text-ink-3"}`}>
            {value ? date(`${value}T12:00:00+05:30`, { day: "numeric", month: "long", year: "numeric" }) : (placeholder ?? t("common.pickDate"))}
          </span>
          <ChevronDown aria-hidden className="h-5 w-5 shrink-0 text-ink-3 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="rounded-2xl">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? lo}
          captionLayout="dropdown"
          startMonth={lo}
          endMonth={max ? noon(max) : undefined}
          disabled={max ? [{ before: lo }, { after: noon(max) }] : { before: lo }}
          locale={lang === "hi" ? hi : enIN}
          weekStartsOn={1}
          pickYearLabel={t("common.pickYear")}
          classNames={{ today: "[&>button]:font-semibold [&>button]:ring-1 [&>button]:ring-line-strong" }}
          onSelect={(d) => {
            if (!d) return;
            onChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
            setOpen(false);
          }}
          autoFocus
        />
        {clearable && value && (
          <div className="flex justify-end border-t border-line px-3 py-2">
            <Button variant="ghost" onClick={() => { onChange(""); setOpen(false); }}>{t("common.clear")}</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** "Are you sure?" for anything that removes or publishes. */
export function ConfirmSheet({
  open,
  onClose,
  title,
  body,
  confirmLabel,
  danger = false,
  busy = false,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  body: ReactNode;
  confirmLabel: ReactNode;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
}) {
  const { t } = useT();
  return (
    <Sheet open={open} onClose={onClose} title={title} size="md">
      <p className="text-base text-ink-2 mb-6">{body}</p>
      {error && <div className="mb-4"><ErrorNote text={error} /></div>}
      <div className="flex flex-col gap-2">
        <Button variant={danger ? "danger" : "primary"} size="lg" disabled={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="ghost" size="lg" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
    </Sheet>
  );
}

/** "Today" / "Tomorrow" / "Yesterday" / "Saturday, 15 Nov" for an IST day ("YYYY-MM-DD"). */
export function DayHeading({ day }: { day: string }) {
  const { t, date } = useT();
  const offset = Math.round((Date.parse(`${day}T00:00:00+05:30`) - Date.parse(`${istDay(new Date())}T00:00:00+05:30`)) / 86_400_000);
  const label =
    offset === 0 ? t("common.today")
    : offset === 1 ? t("common.tomorrow")
    : offset === -1 ? t("common.yesterday")
    : date(`${day}T12:00:00+05:30`, { weekday: "long", day: "numeric", month: "short" });
  return <h3 className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3 first:mt-0">{label}</h3>;
}
