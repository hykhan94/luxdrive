"use client";

// --------------------------------------------------------------
// Booking modification history — a collapsible "change timeline".
// Each edit is a node on a vertical spine showing who changed it,
// when, and a per-field before -> after diff (old struck-through,
// new in gold). Collapsed by default so the detail panel stays
// uncluttered; the header alone signals the booking was edited and
// when. Shared by the admin booking list and the partner bookings
// panel so both portals render change history identically.
// --------------------------------------------------------------

import { useState } from "react";
import { History, ChevronDown, ArrowRight } from "lucide-react";

export interface ChangedField {
  field: string;
  label: string;
  from: unknown;
  to: unknown;
}

export interface BookingModificationEntry {
  id: string;
  actor: string; // PARTNER | ADMIN | VENDOR
  changedFields: ChangedField[];
  reason: string | null;
  vendorDecision: string;
  vendorDecisionReason: string | null;
  vendorDecidedAt: string | null;
  createdAt: string;
}

function fmtAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Explicit date + time, e.g. "31 Jul, 2:45 PM" — shown on each change so
// the history reads with real timestamps, matching the journey timeline.
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getDate();
  const month = d.toLocaleString("en-US", { month: "short" });
  const time = d.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${day} ${month}, ${time}`;
}

function fmtChangeVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

const ACTOR_STYLE: Record<string, { label: string; cls: string }> = {
  PARTNER: {
    label: "Partner",
    cls: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
  ADMIN: {
    label: "Admin",
    cls: "bg-luxury-gold/15 text-luxury-gold border-luxury-gold/30",
  },
  VENDOR: {
    label: "Vendor",
    cls: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  },
  // Neutral platform actor. The vendor/partner portals collapse every
  // actor that isn't "themselves" into this, so neither side learns the
  // other exists — they only ever see "you" vs "LuxDrive".
  PLATFORM: {
    label: "LuxDrive",
    cls: "bg-luxury-gold/10 text-luxury-gold/90 border-luxury-gold/25",
  },
};

export function ModificationTimeline({
  modifications,
  defaultOpen = false,
}: {
  modifications: BookingModificationEntry[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!modifications || modifications.length === 0) return null;
  const last = modifications[0];
  const n = modifications.length;

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-500/[0.06] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
            <History className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-white">
              Booking modified
              <span className="ml-1.5 text-xs font-normal text-amber-300/80">
                · {n} change{n > 1 ? "s" : ""}
              </span>
            </div>
            <div className="text-[11px] text-neutral-400">
              Last edit {fmtAgo(last.createdAt)}
            </div>
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-neutral-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1">
          <div className="relative pl-5">
            <div className="absolute left-[6px] top-1.5 bottom-1.5 w-px bg-neutral-700/70" />
            <div className="space-y-4">
              {modifications.map((m) => {
                const actor = ACTOR_STYLE[m.actor] ?? {
                  label: m.actor,
                  cls: "bg-neutral-700/40 text-neutral-300 border-neutral-600",
                };
                const decided =
                  m.vendorDecision && m.vendorDecision !== "NOT_REQUIRED";
                return (
                  <div key={m.id} className="relative">
                    <div className="absolute -left-[19px] top-[3px] w-3 h-3 rounded-full border-2 border-amber-400 bg-neutral-950" />
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded border ${actor.cls}`}
                      >
                        {actor.label}
                      </span>
                      <span
                        className="text-[11px] text-neutral-400"
                        title={fmtAgo(m.createdAt)}
                      >
                        {fmtDateTime(m.createdAt)}
                      </span>
                      {decided && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border ${
                            m.vendorDecision === "ACCEPTED"
                              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                              : m.vendorDecision === "REJECTED"
                                ? "bg-red-500/15 text-red-300 border-red-500/30"
                                : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                          }`}
                        >
                          Vendor{" "}
                          {m.vendorDecision.charAt(0) +
                            m.vendorDecision.slice(1).toLowerCase()}
                        </span>
                      )}
                    </div>
                    {m.reason && (
                      <div className="text-[11px] text-neutral-400 italic mb-1.5 pl-0.5">
                        “{m.reason}”
                      </div>
                    )}
                    <div className="space-y-1">
                      {(m.changedFields ?? []).map((f, i) => (
                        <div
                          key={i}
                          className="flex items-baseline gap-2 text-xs flex-wrap"
                        >
                          <span className="text-neutral-500 min-w-[84px] shrink-0">
                            {f.label}
                          </span>
                          <span className="text-neutral-500 line-through decoration-neutral-600/70">
                            {fmtChangeVal(f.from)}
                          </span>
                          <ArrowRight className="w-3 h-3 text-neutral-600 shrink-0 self-center" />
                          <span className="text-luxury-gold font-medium">
                            {fmtChangeVal(f.to)}
                          </span>
                        </div>
                      ))}
                    </div>
                    {m.vendorDecision === "REJECTED" &&
                      m.vendorDecisionReason && (
                        <div className="mt-1.5 text-[11px] text-red-300/80">
                          Vendor note: {m.vendorDecisionReason}
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
