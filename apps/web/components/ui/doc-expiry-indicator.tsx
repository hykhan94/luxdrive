"use client";

/**
 * DocExpiryIndicator — shared pill + popover for documents nearing or past
 * their expiry date. Extracted from components/vendor/{drivers,fleet}.tsx
 * so the admin portal (vendor + partner + driver + vehicle lists) can render
 * the exact same UX vendors see, without duplicating the popover logic.
 *
 * Data shape matches what vendor-side endpoints return: an ExpiryDoc has
 * { type, label, expiryDate } — where expiryDate is either a Date object,
 * an ISO string, or null (nothing to show for that doc).
 */

import { AlertCircle, Clock, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface ExpiryDoc {
  type: string;
  label: string;
  expiryDate: string | Date | null;
}

function daysUntil(date: string | Date | null): number | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function shortDate(date: string | Date | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ExpiryDocRow({ doc, expired }: { doc: ExpiryDoc; expired: boolean }) {
  const days = daysUntil(doc.expiryDate);
  let chipClass = "bg-amber-500/15 text-amber-300 border-amber-500/30";
  let chipText: string;
  if (expired || (days !== null && days <= 0)) {
    chipClass = "bg-red-500/20 text-red-300 border-red-500/40";
    chipText = days !== null && days < 0 ? `${Math.abs(days)}d ago` : "Expired";
  } else if (days !== null && days <= 7) {
    chipClass = "bg-red-500/15 text-red-300 border-red-500/30";
    chipText = `${days}d left`;
  } else if (days !== null && days <= 14) {
    chipClass = "bg-orange-500/15 text-orange-300 border-orange-500/30";
    chipText = `${days}d left`;
  } else if (days !== null) {
    chipClass = "bg-amber-500/15 text-amber-300 border-amber-500/30";
    chipText = `${days}d left`;
  } else {
    chipText = "—";
  }
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-sm text-white truncate">{doc.label}</p>
        <p className="text-[11px] text-gray-500">{shortDate(doc.expiryDate)}</p>
      </div>
      <span
        className={`px-2 py-0.5 text-[11px] rounded border whitespace-nowrap ${chipClass}`}
      >
        {chipText}
      </span>
    </div>
  );
}

export default function DocExpiryIndicator({
  expiringDocs,
  expiredDocs,
  footnote,
}: {
  expiringDocs?: ExpiryDoc[];
  expiredDocs?: ExpiryDoc[];
  /** Optional muted line under the list. Defaults to the vendor-side wording. */
  footnote?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);

  const expired = expiredDocs ?? [];
  const expiring = expiringDocs ?? [];

  const computePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = Math.min(288, window.innerWidth - 16);
    const margin = 8;
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - popoverWidth - margin;
    }
    if (left < margin) left = margin;
    let top = rect.bottom + 8;
    const estimatedHeight = 240;
    if (top + estimatedHeight > window.innerHeight - margin) {
      const above = rect.top - estimatedHeight - 8;
      if (above >= margin) top = above;
    }
    setPos({ top, left, width: popoverWidth });
  };

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      const popover = document.getElementById("doc-expiry-popover");
      if (popover?.contains(target)) return;
      setOpen(false);
    };
    const handleReflow = () => computePosition();
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    window.addEventListener("scroll", handleReflow, true);
    window.addEventListener("resize", handleReflow);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      window.removeEventListener("scroll", handleReflow, true);
      window.removeEventListener("resize", handleReflow);
    };
  }, [open]);

  if (expired.length === 0 && expiring.length === 0) return null;

  const isExpired = expired.length > 0;
  const soonest = !isExpired
    ? [...expiring]
        .map((d) => ({ ...d, days: daysUntil(d.expiryDate) }))
        .filter((d): d is ExpiryDoc & { days: number } => d.days !== null)
        .sort((a, b) => a.days - b.days)[0]
    : null;

  const pillClass = isExpired
    ? "bg-red-500/15 text-red-400 border-red-500/40"
    : "bg-amber-500/10 text-amber-400 border-amber-500/30";
  const pillIcon = isExpired ? (
    <AlertCircle className="w-3 h-3" />
  ) : (
    <Clock className="w-3 h-3" />
  );
  const pillLabel = isExpired
    ? expired.length === 1
      ? `${expired[0].label} Expired`
      : `${expired.length} Documents Expired`
    : expiring.length === 1
      ? `${soonest!.label} — ${soonest!.days}d`
      : `${expiring.length} Expiring (${soonest!.days}d)`;

  const handleOpen = () => {
    computePosition();
    setOpen(true);
  };
  const handleClose = () => setOpen(false);

  return (
    <>
      <span
        ref={triggerRef}
        className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded border cursor-help ${pillClass}`}
        onMouseEnter={handleOpen}
        onMouseLeave={() => {
          setTimeout(() => {
            const popover = document.getElementById("doc-expiry-popover");
            if (popover && popover.matches(":hover")) return;
            setOpen(false);
          }, 120);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (open) handleClose();
          else handleOpen();
        }}
      >
        {pillIcon}
        {pillLabel}
      </span>

      {open && pos && (
        <div
          id="doc-expiry-popover"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: pos.width,
            maxHeight: "min(60vh, 420px)",
          }}
          className="z-[100] p-3 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-y-auto"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <div className="flex items-center justify-between mb-2 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {isExpired ? (
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              ) : (
                <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />
              )}
              <p className="text-xs font-medium text-white truncate">
                {isExpired ? "Expired Documents" : "Expiring Soon"}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
              className="p-0.5 text-gray-500 hover:text-white rounded"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-neutral-800">
            {expired.map((d) => (
              <ExpiryDocRow key={`exp-${d.type}`} doc={d} expired />
            ))}
            {expiring.map((d) => (
              <ExpiryDocRow key={`expg-${d.type}`} doc={d} expired={false} />
            ))}
          </div>

          <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
            {footnote ??
              "Failure to update these documents will result in suspension."}
          </p>
        </div>
      )}
    </>
  );
}
