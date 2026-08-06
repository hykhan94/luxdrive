"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";

/**
 * Renders a change/reassign action that is greyed-out and non-actionable
 * once a booking is inside the admin-configured change cutoff (lead time).
 *
 * - Not locked: renders a normal button with the passed className + onClick.
 * - Locked: renders a greyed button that does NOT perform the action; instead,
 *   hovering (desktop) OR tapping (mobile) reveals a tooltip explaining why the
 *   change is blocked and that admin can be asked to allow it.
 *
 * Mobile-optimised: the reveal is driven by React state toggled on both hover
 * and tap, the panel is width-capped to the viewport, and it closes on any
 * outside tap.
 */
export function LockedChangeButton({
  locked,
  cutoffHours,
  onClick,
  className,
  lockedClassName,
  children,
}: {
  locked: boolean;
  cutoffHours?: number | null;
  onClick: () => void;
  className: string;
  lockedClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close the reveal when tapping anywhere outside (mobile).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open]);

  if (!locked) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {children}
      </button>
    );
  }

  const hoursLabel =
    cutoffHours != null
      ? `${cutoffHours} hour${cutoffHours === 1 ? "" : "s"}`
      : "the cutoff";

  return (
    <div
      ref={wrapRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-disabled="true"
        onClick={() => setOpen((v) => !v)}
        className={
          lockedClassName ??
          "inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800/60 px-4 py-2 text-sm font-medium text-gray-500 cursor-not-allowed"
        }
      >
        <Lock className="w-4 h-4 flex-shrink-0" />
        {children}
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 w-64 max-w-[78vw] -translate-x-1/2 rounded-lg border border-amber-500/30 bg-neutral-900 px-3 py-2.5 text-left shadow-xl"
        >
          <div className="flex items-start gap-2">
            <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
            <div className="space-y-1">
              <p className="text-xs font-medium text-amber-200">
                Changes are locked
              </p>
              <p className="text-[11px] leading-snug text-gray-300">
                This booking is within {hoursLabel} of its trip time, so it can
                no longer be changed here. You can request admin to allow a
                modification.
              </p>
            </div>
          </div>
          {/* caret */}
          <span className="absolute left-1/2 top-full -mt-px h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-amber-500/30 bg-neutral-900" />
        </div>
      )}
    </div>
  );
}

export default LockedChangeButton;
