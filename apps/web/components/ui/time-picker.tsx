// ============================================
// apps/web/components/ui/time-picker.tsx
//
// Themed time picker — trigger button opens a small popover with
// hour + minute + AM/PM controls. 12-hour by default (KSA civilian
// convention); 15-min increments by default (industry standard for
// chauffeur services). Both configurable per instance.
//
// Contract:
//   value:    "HH:mm" 24-hour string, matches native <input type="time">
//   onChange: fires with the same "HH:mm" string
//
// The 12/24 hour mode is a display concern — the string in/out is always
// 24-hour, so backend and downstream code don't need to care.
// ============================================

"use client";

import * as React from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface TimePickerProps {
  /** "HH:mm" 24-hour, matches native <input type="time"> value. */
  value?: string;
  onChange?: (value: string) => void;
  /** Minute increment for the picker (5, 10, 15, 30). Default 15. */
  step?: 1 | 5 | 10 | 15 | 30;
  /** Show AM/PM (12h) or 24h. Default 12h. */
  hour12?: boolean;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
}

interface Parsed {
  hour24: number;
  minute: number;
}

function parseValue(v?: string): Parsed | null {
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { hour24: h, minute: min };
}

function formatValue(hour24: number, minute: number): string {
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// Round a minute to the nearest step so a value like "07:23" picks up
// correctly on a 15-min picker (snapping to 07:30, closest).
function nearestStep(minute: number, step: number): number {
  const snapped = Math.round(minute / step) * step;
  return snapped >= 60 ? 0 : snapped;
}

export function TimePicker({
  value,
  onChange,
  step = 15,
  hour12 = true,
  placeholder = "Pick a time",
  disabled = false,
  required = false,
  className,
  id,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const parsed = React.useMemo(() => parseValue(value), [value]);

  // Local UI state — pending selections before commit. Initialized from
  // value (or defaults) when the popover opens. This keeps the picker
  // usable even when value is empty.
  const [hour24, setHour24] = React.useState<number>(parsed?.hour24 ?? 9);
  const [minute, setMinute] = React.useState<number>(
    nearestStep(parsed?.minute ?? 0, step),
  );

  // Sync local state whenever value changes from outside (e.g. form reset).
  React.useEffect(() => {
    if (parsed) {
      setHour24(parsed.hour24);
      setMinute(nearestStep(parsed.minute, step));
    }
  }, [parsed, step]);

  const commit = (h: number, m: number) => {
    onChange?.(formatValue(h, m));
  };

  // Display strings for the trigger button.
  const displayText = React.useMemo(() => {
    if (!parsed) return placeholder;
    if (hour12) {
      const h = parsed.hour24 % 12 || 12;
      const suffix = parsed.hour24 < 12 ? "AM" : "PM";
      return `${h}:${String(parsed.minute).padStart(2, "0")} ${suffix}`;
    }
    return formatValue(parsed.hour24, parsed.minute);
  }, [parsed, hour12, placeholder]);

  // Hour options depend on 12h vs 24h.
  const hours12 = React.useMemo(
    () => Array.from({ length: 12 }, (_, i) => i + 1), // 1..12
    [],
  );
  const hours24 = React.useMemo(
    () => Array.from({ length: 24 }, (_, i) => i), // 0..23
    [],
  );
  const minutes = React.useMemo(
    () => Array.from({ length: Math.floor(60 / step) }, (_, i) => i * step),
    [step],
  );

  // In 12h mode we split hour24 into (h12, isPm) for display; the local
  // state stays 24h so switching back is lossless.
  const h12 = hour24 % 12 || 12;
  const isPm = hour24 >= 12;

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
            "w-full h-12 justify-start text-left font-normal rounded-lg",
            "bg-neutral-800 border border-neutral-700",
            "text-white hover:bg-neutral-800 hover:text-white",
            "focus-visible:border-luxury-gold focus-visible:ring-2 focus-visible:ring-luxury-gold/20",
            !parsed && "text-gray-400",
            className,
          )}
        >
          <Clock className="mr-2 h-4 w-4 text-luxury-gold" />
          {displayText}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        // `dark` scope keeps design-token consumers inside the popover
        // resolving to dark-theme values even when `<html>` lacks the class.
        className="dark w-auto p-3 bg-neutral-900 border border-neutral-700 text-white rounded-lg shadow-2xl"
        align="start"
      >
        <div className="flex items-center gap-2">
          {/* Hour */}
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
              Hour
            </span>
            <ScrollSelect
              options={(hour12 ? hours12 : hours24).map((h) => ({
                value: h,
                label: String(h).padStart(2, "0"),
              }))}
              value={hour12 ? h12 : hour24}
              onChange={(newH) => {
                const newHour24 = hour12 ? (newH % 12) + (isPm ? 12 : 0) : newH;
                setHour24(newHour24);
                commit(newHour24, minute);
              }}
            />
          </div>

          <span className="text-white text-lg font-semibold pt-4">:</span>

          {/* Minute */}
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
              Min
            </span>
            <ScrollSelect
              options={minutes.map((m) => ({
                value: m,
                label: String(m).padStart(2, "0"),
              }))}
              value={minute}
              onChange={(m) => {
                setMinute(m);
                commit(hour24, m);
              }}
            />
          </div>

          {/* AM/PM toggle (12h mode only) */}
          {hour12 && (
            <div className="flex flex-col items-center ml-1">
              <span className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                &nbsp;
              </span>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (isPm) {
                      const newH = hour24 - 12;
                      setHour24(newH);
                      commit(newH, minute);
                    }
                  }}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                    !isPm
                      ? "bg-luxury-gold text-black"
                      : "bg-neutral-800 text-gray-400 hover:text-white",
                  )}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!isPm) {
                      const newH = hour24 + 12;
                      setHour24(newH);
                      commit(newH, minute);
                    }
                  }}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                    isPm
                      ? "bg-luxury-gold text-black"
                      : "bg-neutral-800 text-gray-400 hover:text-white",
                  )}
                >
                  PM
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            size="sm"
            className="bg-luxury-gold text-black hover:bg-luxury-gold/90 h-8"
            onClick={() => setOpen(false)}
          >
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Scrollable list of values — cleaner than a native <select> here because
// we want the popover to feel visually cohesive with the calendar.
function ScrollSelect({
  options,
  value,
  onChange,
}: {
  options: { value: number; label: string }[];
  value: number;
  onChange: (value: number) => void;
}) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const selectedRef = React.useRef<HTMLButtonElement>(null);

  // On mount + value change, scroll the selected item into view. Keeps the
  // current hour/minute visible when the popover opens.
  React.useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "center" });
  }, [value]);

  return (
    <div
      ref={listRef}
      className={cn(
        "h-40 w-14 overflow-y-auto rounded-md bg-neutral-800 border border-neutral-700",
        // Custom scrollbar styling. Native ones look bad on dark.
        "[&::-webkit-scrollbar]:w-1",
        "[&::-webkit-scrollbar-track]:bg-transparent",
        "[&::-webkit-scrollbar-thumb]:bg-neutral-600 [&::-webkit-scrollbar-thumb]:rounded",
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          ref={opt.value === value ? selectedRef : undefined}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "w-full py-1.5 text-center text-sm transition-colors",
            opt.value === value
              ? "bg-luxury-gold text-black font-semibold"
              : "text-gray-300 hover:bg-neutral-700 hover:text-white",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
