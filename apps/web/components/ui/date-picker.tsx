// ============================================
// apps/web/components/ui/date-picker.tsx
//
// A themed, controlled date picker built on shadcn Popover + Calendar
// (react-day-picker). Replaces every <input type="date"> across the app
// so the popover, chevrons, and day cells match the LuxDrive dark theme
// instead of Chrome's default OS chrome.
//
// Contract:
//   value:    string in "yyyy-mm-dd" format (matches native <input type="date">)
//   onChange: called with the same string format on selection
//   Passing "" or undefined clears the picker.
//
// Deliberately mirrors the native input's `value` shape so callers can
// swap `<input type="date" value={x} onChange={e => setX(e.target.value)}>`
// for `<DatePicker value={x} onChange={setX} />` without touching state.
// ============================================

"use client";

import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface DatePickerProps {
  /** ISO-ish "yyyy-mm-dd" string, matches native <input type="date"> value. */
  value?: string;
  onChange?: (value: string) => void;
  /** "yyyy-mm-dd"; days strictly before this date are disabled. */
  min?: string;
  /** "yyyy-mm-dd"; days strictly after this date are disabled. */
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  /**
   * Format the display when a date is selected. Defaults to `PPP` from
   * date-fns ("Jul 3, 2026"). Override to something denser like `PP`
   * ("Jul 3, 2026") or `yyyy-MM-dd` if space is tight.
   */
  displayFormat?: string;
  id?: string;
}

// Parse the ISO-ish string the input contract accepts. Returns undefined
// for empty / malformed strings so callers can use it in Calendar
// `selected` prop without extra null checks.
function toDate(iso?: string): Date | undefined {
  if (!iso) return undefined;
  const d = parse(iso, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
}

// Reverse: Date → "yyyy-mm-dd" so onChange stays contract-compatible with
// the native input the callers used before.
function toIso(date?: Date): string {
  return date ? format(date, "yyyy-MM-dd") : "";
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "Pick a date",
  disabled = false,
  required = false,
  className,
  displayFormat = "PPP",
  id,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = React.useMemo(() => toDate(value), [value]);
  const minDate = React.useMemo(() => toDate(min), [min]);
  const maxDate = React.useMemo(() => toDate(max), [max]);

  // Bound the month + year dropdowns to the picker's actual usable range.
  // Without startMonth/endMonth, react-day-picker's year dropdown shows a
  // sliding range centered on the currently visible month — so a picker
  // whose min is today happily lets you scroll to 2020 in the year list
  // even though every day would be disabled. We clip it here.
  //
  //   startMonth = first day of min's month (or today's month as fallback)
  //   endMonth   = last day of max's month (or +2 years from start as
  //                fallback — long enough for advance bookings, short
  //                enough to keep the year dropdown readable)
  const startMonth = React.useMemo(() => {
    const base = minDate ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  }, [minDate]);
  const endMonth = React.useMemo(() => {
    if (maxDate) {
      return new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);
    }
    return new Date(startMonth.getFullYear() + 2, startMonth.getMonth(), 0);
  }, [maxDate, startMonth]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-required={required || undefined}
          className={cn(
            // Explicit colors instead of relying on shadcn design tokens —
            // the app doesn't put `.dark` on <html>, so light-theme tokens
            // resolve and would render text near-black on a dark input.
            "w-full h-12 justify-start text-left font-normal rounded-lg",
            "bg-neutral-800 border border-neutral-700",
            "text-white hover:bg-neutral-800 hover:text-white",
            "focus-visible:border-luxury-gold focus-visible:ring-2 focus-visible:ring-luxury-gold/20",
            !selected && "text-gray-400",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 text-luxury-gold" />
          {selected ? format(selected, displayFormat) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        // `dark` wraps the calendar so any design-token consumer resolves
        // dark values (the app doesn't set `class="dark"` on <html>).
        // `[color-scheme:dark]` tells Chrome to render the native <select>
        // dropdown popup (month + year lists) in dark mode — otherwise
        // that popup appears as a white OS panel on top of our dark UI.
        className="dark [color-scheme:dark] w-auto p-0 bg-neutral-900 border border-neutral-700 text-white rounded-lg shadow-2xl"
        align="start"
      >
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            onChange?.(toIso(d));
            if (d) setOpen(false);
          }}
          disabled={(d) => {
            if (minDate && d < minDate) return true;
            if (maxDate && d > maxDate) return true;
            return false;
          }}
          startMonth={startMonth}
          endMonth={endMonth}
          captionLayout="dropdown"
          autoFocus
          // Override only the color-related bits. Layout classes (weekdays
          // flex, dropdown_root / dropdown overlay trick that hides the
          // native <select> behind the caption label) MUST stay from
          // shadcn's Calendar — otherwise the native selects render on
          // top of the labels ("Jul ˅ Jul") and weekdays collapse.
          className="bg-transparent text-white"
          classNames={{
            today:
              "bg-luxury-gold/15 text-luxury-gold rounded-md font-semibold",
            outside: "text-gray-600 aria-selected:text-gray-500",
            disabled: "text-gray-700 opacity-50",
            weekday:
              "text-gray-400 rounded-md flex-1 font-normal text-[0.8rem] select-none",
            caption_label:
              "select-none font-medium text-sm text-white flex items-center gap-1 px-2",
            // The dropdown_root is the WRAPPER that holds the invisible
            // <select> layered on top of the caption. Giving it explicit
            // min-width and padding ensures the click target matches the
            // visible label and dropdowns don't look cramped. `has-focus`
            // adds a gold ring when the select is focused (keyboard nav).
            dropdown_root:
              "relative min-w-[70px] border border-neutral-700 hover:border-neutral-600 rounded-md bg-neutral-800 has-focus:border-luxury-gold has-focus:ring-2 has-focus:ring-luxury-gold/20 transition-colors",
            button_previous:
              "text-white hover:bg-neutral-800 rounded-md size-8 p-0",
            button_next:
              "text-white hover:bg-neutral-800 rounded-md size-8 p-0",
          }}
          // Style the day buttons via a `components.DayButton` override
          // instead of a className string, since the DayButton in Calendar
          // has its own selected-state data attributes.
          components={{
            DayButton: ({ className, day, modifiers, ...btnProps }) => (
              <button
                {...btnProps}
                data-day={day.date.toLocaleDateString()}
                data-selected-single={
                  modifiers.selected &&
                  !modifiers.range_start &&
                  !modifiers.range_end &&
                  !modifiers.range_middle
                }
                className={cn(
                  "flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 items-center justify-center rounded-md text-sm font-normal leading-none transition-colors",
                  "text-gray-200 hover:bg-neutral-800",
                  "data-[selected-single=true]:bg-luxury-gold data-[selected-single=true]:text-black data-[selected-single=true]:font-semibold data-[selected-single=true]:hover:bg-luxury-gold",
                  "disabled:pointer-events-none disabled:opacity-40",
                  className,
                )}
              />
            ),
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
