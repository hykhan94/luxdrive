// ============================================
// apps/web/components/ui/date-time-picker.tsx
//
// Composed wrapper: DatePicker + TimePicker rendered side-by-side, with
// a single value/onChange contract so callers don't juggle two pieces
// of state. Useful anywhere the app previously used a native
// <input type="datetime-local"> or paired native date/time inputs.
//
// Contract:
//   value:    "yyyy-MM-ddTHH:mm" — same shape as native datetime-local
//   onChange: fires with the composed string on every change to either
//             sub-picker. When one side is empty, the whole value is "".
//
// Both sub-pickers are themed identically to their standalone versions
// (dark surface, gold accents, custom calendar / hour-minute lists).
// ============================================

"use client";

import * as React from "react";
import { DatePicker, type DatePickerProps } from "@/components/ui/date-picker";
import { TimePicker, type TimePickerProps } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";

export interface DateTimePickerProps {
  /**
   * ISO-ish combined string "yyyy-MM-ddTHH:mm" (same shape as native
   * datetime-local). Passing "" or undefined clears both sub-pickers.
   */
  value?: string;
  onChange?: (value: string) => void;
  /**
   * Bounds — accepted in the SAME "yyyy-MM-ddTHH:mm" shape as `value`.
   * Only the date part gates the calendar; time bounds are advisory (we
   * don't disable individual minute cells, but you can post-validate on
   * submit if precise minute cutoffs matter).
   */
  min?: string;
  max?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  /** Labels shown above each sub-picker. Set to null to hide. */
  dateLabel?: string | null;
  timeLabel?: string | null;
  /** Placeholder overrides forwarded to each sub-picker. */
  datePlaceholder?: string;
  timePlaceholder?: string;
  /** Extra props passed through to each sub-picker for edge-case tuning. */
  dateProps?: Omit<
    DatePickerProps,
    "value" | "onChange" | "min" | "max" | "disabled" | "required"
  >;
  timeProps?: Omit<
    TimePickerProps,
    "value" | "onChange" | "disabled" | "required"
  >;
}

// Split "yyyy-MM-ddTHH:mm" → { date: "yyyy-MM-dd", time: "HH:mm" }.
// Missing parts return "" so the sub-pickers show their placeholder.
function splitValue(v?: string): { date: string; time: string } {
  if (!v) return { date: "", time: "" };
  const [date, time] = v.split("T");
  return { date: date ?? "", time: time ?? "" };
}

// Compose a date + time back into the combined value. If either is
// missing we return "" so downstream forms treat the field as empty
// rather than a malformed partial like "2026-07-03T" or "T09:00".
function joinValue(date: string, time: string): string {
  if (!date || !time) return "";
  return `${date}T${time}`;
}

// Peel just the date part off a "yyyy-MM-ddTHH:mm" bound so DatePicker
// can consume it (its own min/max contract is date-only).
function boundToDate(v?: string): string | undefined {
  if (!v) return undefined;
  return v.split("T")[0] || undefined;
}

export function DateTimePicker({
  value,
  onChange,
  min,
  max,
  disabled = false,
  required = false,
  className,
  dateLabel = "Date",
  timeLabel = "Time",
  datePlaceholder,
  timePlaceholder,
  dateProps,
  timeProps,
}: DateTimePickerProps) {
  const { date, time } = React.useMemo(() => splitValue(value), [value]);

  const handleDateChange = (nextDate: string) => {
    onChange?.(joinValue(nextDate, time));
  };
  const handleTimeChange = (nextTime: string) => {
    onChange?.(joinValue(date, nextTime));
  };

  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3", className)}>
      <div>
        {dateLabel !== null && (
          <label className="block text-sm text-gray-400 mb-2">
            {dateLabel}
            {required && <span className="text-red-400 ml-0.5">*</span>}
          </label>
        )}
        <DatePicker
          {...dateProps}
          value={date}
          onChange={handleDateChange}
          min={boundToDate(min)}
          max={boundToDate(max)}
          disabled={disabled}
          required={required}
          placeholder={datePlaceholder}
        />
      </div>
      <div>
        {timeLabel !== null && (
          <label className="block text-sm text-gray-400 mb-2">
            {timeLabel}
            {required && <span className="text-red-400 ml-0.5">*</span>}
          </label>
        )}
        <TimePicker
          {...timeProps}
          value={time}
          onChange={handleTimeChange}
          disabled={disabled}
          required={required}
          placeholder={timePlaceholder}
        />
      </div>
    </div>
  );
}
