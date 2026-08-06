"use client";

// --------------------------------------------------------------
// Vendor eligibility breakdown.
//
// Shown when the "assign vendor" pool is empty (or thin) to explain
// WHY the vendors an admin expects aren't offerable. Designed to stay
// compact whether there are 2 excluded vendors or 200:
//   1. A grouped summary — counts by the dominant blocker category, so
//      the admin sees the shape of the problem at a glance (e.g. "11 ·
//      docs expire before trip" strongly implies the trip date, not the
//      vendors, is the issue). Chips filter the list.
//   2. A collapsed, scrollable, per-vendor drill-down — one row each,
//      expand for the specific document/date. Nothing floods the panel.
// --------------------------------------------------------------

import { useState } from "react";
import {
  ChevronDown,
  FileWarning,
  ShieldAlert,
  FileX,
  Ban,
} from "lucide-react";

type Category = "DOCUMENTS" | "APPROVAL" | "MISSING" | "OFFER";

interface Blocker {
  category: Category;
  message: string;
}
export interface IneligibleVendor {
  id: string;
  companyName: string;
  blockers: Blocker[];
}

const META: Record<
  Category,
  { short: string; cls: string; Icon: typeof FileWarning }
> = {
  DOCUMENTS: {
    short: "docs expire before trip",
    cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    Icon: FileWarning,
  },
  APPROVAL: {
    short: "not approved / inactive",
    cls: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    Icon: ShieldAlert,
  },
  MISSING: {
    short: "missing documents",
    cls: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    Icon: FileX,
  },
  OFFER: {
    short: "already offered / rejected",
    cls: "bg-neutral-600/30 text-neutral-300 border-neutral-600",
    Icon: Ban,
  },
};
const ORDER: Category[] = ["DOCUMENTS", "APPROVAL", "MISSING", "OFFER"];

export default function VendorEligibilityBreakdown({
  vendors,
}: {
  vendors: IneligibleVendor[];
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Category | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!vendors || vendors.length === 0) return null;

  const primary = (v: IneligibleVendor): Category =>
    v.blockers[0]?.category ?? "OFFER";

  const counts = {} as Record<Category, number>;
  for (const v of vendors) {
    const c = primary(v);
    counts[c] = (counts[c] ?? 0) + 1;
  }
  const groups = ORDER.filter((c) => counts[c]);
  const shown = filter ? vendors.filter((v) => primary(v) === filter) : vendors;

  return (
    <div className="space-y-2">
      <p className="text-amber-400/80">
        {vendors.length}{" "}
        {vendors.length > 1
          ? "vendors have a matching vehicle but aren't"
          : "vendor has a matching vehicle but isn't"}{" "}
        offerable for this trip:
      </p>

      {/* Grouped summary — counts by dominant blocker; tap to filter. */}
      <div className="flex flex-wrap gap-1.5">
        {groups.map((c) => {
          const m = META[c];
          const active = filter === c;
          return (
            <button
              key={c}
              onClick={() => {
                setFilter(active ? null : c);
                setOpen(true);
                setExpanded(null);
              }}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] transition ${m.cls} ${
                active ? "ring-1 ring-white/40" : "hover:brightness-110"
              }`}
            >
              <m.Icon className="w-3 h-3" />
              <span className="font-semibold">{counts[c]}</span>
              <span className="opacity-80">{m.short}</span>
            </button>
          );
        })}
      </div>

      {/* Drill-down toggle. */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-200"
      >
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
        {open ? "Hide" : "Show"} {filter ? `${shown.length} ` : ""}vendor
        {shown.length > 1 || !filter ? "s" : ""}
      </button>

      {/* Per-vendor list — collapsed rows, scrollable, expand for detail. */}
      {open && (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-neutral-700/70 divide-y divide-neutral-800">
          {shown.map((v) => {
            const isOpen = expanded === v.id;
            const m = META[primary(v)];
            return (
              <div key={v.id} className="bg-neutral-900/40">
                <button
                  onClick={() => setExpanded(isOpen ? null : v.id)}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-2 hover:bg-neutral-800/40 text-left"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium text-white truncate">
                      {v.companyName}
                    </span>
                    <span
                      className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${m.cls}`}
                    >
                      {m.short}
                    </span>
                    {v.blockers.length > 1 && (
                      <span className="shrink-0 text-[10px] text-neutral-500">
                        +{v.blockers.length - 1} more
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-neutral-500 shrink-0 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <ul className="px-3 pb-2.5 pt-0.5 space-y-1">
                    {v.blockers.map((b, i) => {
                      const bm = META[b.category];
                      return (
                        <li
                          key={i}
                          className="flex items-start gap-1.5 text-[11px] text-neutral-300"
                        >
                          <bm.Icon className="w-3 h-3 mt-0.5 shrink-0 opacity-70" />
                          <span>{b.message}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
