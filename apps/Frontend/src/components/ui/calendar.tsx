import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DayButtonProps } from "react-day-picker";
import { cn } from "../../lib/cn";

/** shadcn's Calendar, re-themed onto this project's own ink/amber/surface
 *  tokens instead of shadcn's default CSS variables (which this repo doesn't
 *  define) — same underlying react-day-picker, this project's own styling. */
export function Calendar({
  className,
  classNames,
  // Airbnb leaves the leading/trailing week blank rather than showing grey
  // neighbouring-month dates.
  showOutsideDays = false,
  startMonth,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  // Blocks navigating to a month that's entirely in the past — the "<" button
  // greys out once there's nowhere earlier left to go.
  const defaultStartMonth = new Date();
  defaultStartMonth.setDate(1);
  defaultStartMonth.setHours(0, 0, 0, 0);

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      startMonth={startMonth ?? defaultStartMonth}
      className={cn("p-3", className)}
      formatters={{
        // react-day-picker's default short weekday ("Su", "Mo"...) reads
        // wider than Airbnb's narrow single-letter header ("S", "M"...).
        formatWeekdayName: (date) => date.toLocaleDateString("en-US", { weekday: "narrow" }),
      }}
      classNames={{
        // `nav` below is positioned absolute against this element — without
        // `relative` here it escapes to whatever further-up ancestor happens
        // to be positioned, landing the chevrons above the month title
        // instead of level with it.
        root: "w-fit relative",
        months: "flex flex-col sm:flex-row gap-4 sm:gap-12",
        month: "flex flex-col gap-3",
        month_caption: "flex items-center justify-center pt-1 h-9 relative",
        caption_label: "flex items-center gap-1 text-base font-semibold text-ink",
        // react-day-picker's dropdown caption renders a real `<select>` and a
        // styled label in the same span, meant to sit exactly on top of each
        // other (the select invisible but clickable, the label showing the
        // value) — without these three classes nothing positions them, so
        // both rendered inline and the month/year each appeared twice.
        dropdowns: "flex items-center gap-1",
        dropdown_root: "relative",
        dropdown: "absolute inset-0 opacity-0 cursor-pointer",
        // inset-x resolves against root's *padding box*, so inset-x-0 would put
        // the chevrons flush against the popover border and skip root's p-3
        // entirely. 8px leaves them just outside the grid, as in Airbnb's.
        nav: "flex items-center justify-between absolute inset-x-2 top-3 h-9",
        button_previous: cn(
          "h-9 w-9 flex items-center justify-center rounded-row text-ink-3 hover:text-ink hover:bg-surface-3 transition-colors aria-disabled:opacity-30 aria-disabled:pointer-events-none",
        ),
        button_next: cn(
          "h-9 w-9 flex items-center justify-center rounded-row text-ink-3 hover:text-ink hover:bg-surface-3 transition-colors aria-disabled:opacity-30 aria-disabled:pointer-events-none",
        ),
        month_grid: "w-full border-collapse mt-2",
        weekdays: "flex",
        weekday: "text-ink-3 w-12 font-normal text-[11px] uppercase",
        week: "flex w-full mt-1",
        day: "w-12 p-0 text-center text-sm relative first:rounded-l-md last:rounded-r-md",
        day_button:
          "h-12 w-12 flex items-center justify-center rounded-full font-normal text-ink hover:bg-surface-3 transition-colors",
        // react-day-picker v10 applies these as plain classes on the day cell
        // (not data-* attributes on the button) — reach into the nested
        // button so the fill and text color actually land on it. `selected`
        // fires for every day in a range (start, middle AND end), so
        // range_middle must force-override it or the whole range paints
        // solid instead of just the two ends. The grey band shares the cell
        // background with range_start/range_end (not just the circles) so it
        // flows seamlessly under them, Airbnb-style, instead of looking like
        // a separate block butted up against a solid square.
        selected: "[&>button]:bg-ink [&>button]:text-surface [&>button]:hover:bg-ink",
        range_start:
          "bg-surface-3 rounded-l-md [&>button]:bg-ink [&>button]:text-surface [&>button]:hover:bg-ink",
        range_end: "bg-surface-3 rounded-r-md [&>button]:bg-ink [&>button]:text-surface [&>button]:hover:bg-ink",
        range_middle: "bg-surface-3 [&>button]:bg-surface-3! [&>button]:text-ink! [&>button]:hover:bg-surface-3!",
        outside: "text-ink-4",
        disabled: "text-ink-4 opacity-40 pointer-events-none",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => {
          if (orientation === "left") return <ChevronLeft className="h-4 w-4" />;
          if (orientation === "down") return <ChevronDown className="h-3.5 w-3.5" />;
          return <ChevronRight className="h-4 w-4" />;
        },
      }}
      {...props}
    />
  );
}

export type { DayButtonProps };
