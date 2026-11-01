import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { Modal } from "./Modal";
import { formatTime, TimeTextInput } from "./DateTimeField";
import { isSameDay, nextSelection } from "../lib/dateRange";
import { useMediaQuery } from "../lib/useMediaQuery";
import type { DateRange } from "react-day-picker";

/** Single unified pick-up → return range picker — one popover, one
 *  dual-month calendar, click start then end (Airbnb-style), instead of two
 *  separate single-date pickers. */
export function DateRangeField({
  label = "Dates",
  pickupDate,
  pickupTime,
  returnDate,
  returnTime,
  onPickupDate,
  onReturnDate,
  onPickupTime,
  onReturnTime,
}: {
  label?: string;
  pickupDate: Date;
  pickupTime: string;
  returnDate: Date;
  returnTime: string;
  onPickupDate: (d: Date) => void;
  onReturnDate: (d: Date) => void;
  onPickupTime: (t: string) => void;
  onReturnTime: (t: string) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // A check-in with no check-out yet. Holding this is what stops the library
  // from seeing a complete range on every click — the behaviour that let it
  // silently rewrite the start date. Decision logic lives in lib/dateRange.ts
  // so it is testable without a DOM.
  const [pendingFrom, setPendingFrom] = useState<Date | null>(null);
  const [hovered, setHovered] = useState<Date | null>(null);

  const range: DateRange = pendingFrom
    ? { from: pendingFrom, to: undefined }
    : { from: pickupDate, to: returnDate };

  function handleSelect(next: DateRange | undefined) {
    const result = nextSelection(pendingFrom, next);
    setPendingFrom(result.pending);
    if (result.commit) {
      setHovered(null);
      onPickupDate(result.commit.from);
      onReturnDate(result.commit.to);
    }
  }

  function openPicker() {
    // The default window is same-day (10:00 → 22:00), so the committed range
    // paints as one lone circle — indistinguishable from a check-in waiting
    // for its check-out, but inert: nothing previews on hover, and clicking
    // the circle itself is a no-op (useRange drops a same-day full range to
    // undefined). Seed it as pending so it behaves the way it looks.
    setPendingFrom(isSameDay(pickupDate, returnDate) ? pickupDate : null);
    setHovered(null);
  }

  function closePicker() {
    // An abandoned check-in must not survive into the next open, or the
    // calendar reopens disagreeing with the trigger label.
    setPendingFrom(null);
    setHovered(null);
  }

  // Live band from the pending check-in to whatever the cursor is over.
  const previewTo = pendingFrom && hovered && hovered > pendingFrom ? hovered : null;

  const durationHrs = Math.max(1, Math.round((returnDate.getTime() - pickupDate.getTime()) / 3_600_000));
  const durationDays = Math.floor(durationHrs / 24);
  const remainderHrs = durationHrs % 24;
  const durationLabel =
    durationHrs < 24
      ? `${durationHrs} hrs`
      : remainderHrs
        ? `${durationDays}d ${remainderHrs}h`
        : `${durationDays}d`;

  // A floating popover has nowhere good to put a two-month calendar on a
  // phone — it either shrinks the months into each other or leaves gaps at
  // the edges with page content showing through. Below the same width the
  // search capsule itself stacks at, this opens as a real modal instead; at
  // and above it, the popover is untouched from how it always worked.
  const isDesktop = useMediaQuery("(min-width: 900px)");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);

  const calendarBody = (
    <>
      {/* Clearing the preview on each day's own mouse-leave made the band
          flicker: the cells don't tile (rows sit `mt-2` apart, past days are
          pointer-events-none), so crossing a gap fired leave with no matching
          enter. A container's leave doesn't fire for movement between its own
          descendants, so only actually leaving the calendar clears it. */}
      <div onMouseLeave={() => setHovered(null)}>
        <Calendar
          mode="range"
          numberOfMonths={isDesktop ? 2 : 1}
          selected={range}
          onSelect={handleSelect}
          disabled={(d) => d < today}
          // With a complete range showing, the next click starts a fresh
          // check-in rather than stretching the old range — Airbnb's rule.
          resetOnSelect
          onDayMouseEnter={(day) => setHovered(day)}
          modifiers={
            previewTo && pendingFrom
              ? {
                  preview_start: pendingFrom,
                  preview_middle: { after: pendingFrom, before: previewTo },
                  preview_end: previewTo,
                }
              : undefined
          }
          modifiersClassNames={{
            // A pending check-in has no range_start to supply the band's
            // background (DayPicker needs both from and to for that), so
            // without this the circular button leaves white crescents where
            // the grey begins.
            preview_start: "bg-surface-3 rounded-l-md",
            preview_middle: "bg-surface-3",
            // The day under the cursor is the prospective check-out, so it
            // gets the same dark circle as the check-in. The explicit hover:
            // is needed — day_button's own hover:bg-surface-3 outranks a bare
            // bg-ink in the cascade.
            preview_end: "bg-surface-3 rounded-r-md [&>button]:bg-ink [&>button]:text-surface [&>button]:hover:bg-ink",
          }}
          autoFocus
        />
      </div>
      <div className="border-t border-line px-4 py-3 flex items-center justify-between gap-4">
        <TimePicker label="Pick-up time" value={pickupTime} onChange={onPickupTime} />
        <TimePicker label="Return time" value={returnTime} onChange={onReturnTime} />
      </div>
    </>
  );

  const trigger = (
    <button type="button" className="w-full flex items-stretch text-left outline-none">
      <span className="flex-1 min-w-0 min-[900px]:min-w-[8.75rem] flex flex-col gap-0.5">
        <span className="text-[11px] uppercase tracking-wide text-ink-3">Pick-up</span>
        <span className="text-ink font-medium truncate">
          {pickupDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {formatTime(pickupTime)}
        </span>
      </span>
      <span className="w-px bg-line mx-3 shrink-0" />
      <span className="flex-1 min-w-0 min-[900px]:min-w-[8.75rem] flex flex-col gap-0.5">
        <span className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-ink-3">
          Return
          <span className="normal-case tracking-normal text-[11px] px-1.5 py-px rounded-full bg-surface-2 text-ink-2">
            {durationLabel}
          </span>
        </span>
        <span className="text-ink font-medium truncate">
          {returnDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {formatTime(returnTime)}
        </span>
      </span>
    </button>
  );

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
      {label && <span className="text-[11px] uppercase tracking-wide text-ink-3">{label}</span>}
      {isDesktop ? (
        <Popover
          open={desktopOpen}
          onOpenChange={(o) => {
            setDesktopOpen(o);
            if (o) openPicker();
            else closePicker();
          }}
        >
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent align="center">{calendarBody}</PopoverContent>
        </Popover>
      ) : (
        <>
          <div
            onClick={() => {
              setMobileOpen(true);
              openPicker();
            }}
          >
            {trigger}
          </div>
          <Modal
            open={mobileOpen}
            onClose={() => {
              setMobileOpen(false);
              closePicker();
            }}
            title="Dates"
          >
            {calendarBody}
          </Modal>
        </>
      )}
    </div>
  );
}

function TimePicker({ label, value, onChange }: { label: string; value: string; onChange: (t: string) => void }) {
  return (
    <label className="flex-1 flex flex-col gap-1">
      <span className="text-[11px] text-ink-3">{label}</span>
      <TimeTextInput
        value={value}
        onChange={onChange}
        className="text-sm font-medium text-ink bg-surface-2 rounded-row px-2 py-1.5 outline-none"
      />
    </label>
  );
}
