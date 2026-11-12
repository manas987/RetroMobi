import { useImperativeHandle, useState, type Ref } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Modal } from "./Modal";
import { RangeCalendar } from "./RangeCalendar";
import { formatTime } from "./DateTimeField";
import { formatDuration } from "../lib/dateRange";
import { useMediaQuery } from "../lib/useMediaQuery";

/** Single unified pick-up → return range picker — one popover, one
 *  dual-month calendar, click start then end (Airbnb-style), instead of two
 *  separate single-date pickers. */
export function DateRangeField({
  ref,
  label = "Dates",
  pickupDate,
  pickupTime,
  returnDate,
  returnTime,
  onDatesChange,
  onPickupTime,
  onReturnTime,
}: {
  ref?: Ref<{ openDates: () => void }>;
  label?: string;
  pickupDate: Date;
  pickupTime: string;
  returnDate: Date;
  returnTime: string;
  onDatesChange: (pickup: Date, returnDate: Date) => void;
  onPickupTime: (t: string) => void;
  onReturnTime: (t: string) => void;
}) {
  // A floating popover has nowhere good to put a two-month calendar on a
  // phone — it either shrinks the months into each other or leaves gaps at
  // the edges with page content showing through. Below the same width the
  // search capsule itself stacks at, this opens as a real modal instead; at
  // and above it, the popover is untouched from how it always worked.
  const isDesktop = useMediaQuery("(min-width: 900px)");
  const [open, setOpen] = useState(false);
  useImperativeHandle(ref, () => ({ openDates: () => setOpen(true) }), []);

  const day = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  // Remounted on every open by both hosts, which is what clears an abandoned
  // check-in — see the note in RangeCalendar.
  const calendarBody = (
    <RangeCalendar
      months={isDesktop ? 2 : 1}
      pickupDate={pickupDate}
      pickupTime={pickupTime}
      returnDate={returnDate}
      returnTime={returnTime}
      onDatesChange={onDatesChange}
      onPickupTime={onPickupTime}
      onReturnTime={onReturnTime}
    />
  );

  const trigger = (
    <button type="button" className="w-full flex items-stretch text-left outline-none">
      <span className="flex-1 min-w-0 min-[900px]:min-w-[8.75rem] flex flex-col gap-0.5">
        <span className="text-[11px] uppercase tracking-wide text-ink-3">Pick-up</span>
        <span className="text-ink font-medium truncate">
          {day(pickupDate)} · {formatTime(pickupTime)}
        </span>
      </span>
      <span className="w-px bg-line mx-3 shrink-0" />
      <span className="flex-1 min-w-0 min-[900px]:min-w-[8.75rem] flex flex-col gap-0.5">
        <span className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-ink-3">
          Return
          <span className="normal-case tracking-normal text-[11px] px-1.5 py-px rounded-full bg-surface-2 text-ink-2">
            {formatDuration(pickupDate, returnDate)}
          </span>
        </span>
        <span className="text-ink font-medium truncate">
          {day(returnDate)} · {formatTime(returnTime)}
        </span>
      </span>
    </button>
  );

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
      {label && <span className="text-[11px] uppercase tracking-wide text-ink-3">{label}</span>}
      {isDesktop ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent align="center">{calendarBody}</PopoverContent>
        </Popover>
      ) : (
        <>
          <div onClick={() => setOpen(true)}>{trigger}</div>
          <Modal open={open} onClose={() => setOpen(false)} title="Dates">
            {calendarBody}
          </Modal>
        </>
      )}
    </div>
  );
}
