// TODO(shared-profile): Duplicated verbatim from components/partner/profile/sticky-submit-bar.tsx
// Consolidate into components/shared/profile/ once both partner and vendor
// flows are stable in production (target: after 2 weeks of vendor prod use).

"use client";

// ============================================
// apps/web/components/vendor/profile/sticky-submit-bar.tsx
// Bottom submit bar. Visible in editing modes (1/2/4); the panel hides it in
// 3/5 by passing visible={false}. Shows Mode-1 section chips (Company X/10 ·
// Bank X/3 · Docs X/6 · MOU) OR the Mode-2/4 linear "N of M addressed" count.
//
// Carries mechanisms 3 & 4 of the four submit-visibility cues: when the
// profile becomes ready (canSubmit flips true) the bar border turns green with
// a one-shot pop (mechanism 3) and the Submit button gets a pulsing glow
// (mechanism 4). Keyframes are injected locally so no globals.css edit is
// needed — move them there if you prefer.
// ============================================

import * as React from "react";
import { Check, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ProgressSection {
  label: string;
  filled: number;
  total: number;
}

export interface StickySubmitBarProps {
  visible: boolean;
  /**
   * Left-inset the bar so it clears the fixed sidebar on lg+. Pass
   * "open" when the sidebar is expanded, "collapsed" when narrow,
   * "none" for pages without a sidebar. Full-width on mobile.
   */
  sidebarInset?: "open" | "collapsed" | "none";
  /** Mode-1 onboarding section chips (mutually exclusive with `rejection` / `vendorRequest`). */
  sections?: ProgressSection[] | null;
  /** Mode-2/4 flagged-item progress (mutually exclusive with `sections` / `vendorRequest`). */
  rejection?: {
    addressed: number;
    total: number;
    allAddressed: boolean;
  } | null;
  /**
   * Vendor-request cycle progress (mutually exclusive with `sections` /
   * `rejection`). Informational: shows N of M items updated, but a single
   * edit is enough to enable submit — the "left" count is a nudge, not a
   * gate.
   */
  vendorRequest?: {
    changed: number;
    total: number;
  } | null;
  canSubmit: boolean;
  submitting?: boolean;
  onSubmit: () => void;
  submitLabel?: string;
  className?: string;
}

const KEYFRAMES = `
@keyframes profileReadyGlow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
  50% { box-shadow: 0 0 14px 1px rgba(16, 185, 129, 0.55); }
}
.profile-ready-glow { animation: profileReadyGlow 1.8s ease-in-out infinite; }
@keyframes profileReadyPop {
  0% { box-shadow: inset 0 3px 0 0 rgba(16, 185, 129, 0); }
  30% { box-shadow: inset 0 3px 0 0 rgba(16, 185, 129, 0.9); }
  100% { box-shadow: inset 0 3px 0 0 rgba(16, 185, 129, 0); }
}
.profile-ready-pop { animation: profileReadyPop 1.4s ease-out; }
`;

export function StickySubmitBar({
  visible,
  sections,
  rejection,
  vendorRequest,
  canSubmit,
  submitting = false,
  onSubmit,
  submitLabel = "Submit for Review",
  sidebarInset = "open",
  className,
}: StickySubmitBarProps) {
  // one-shot celebration when the bar transitions into "ready"
  const [justReady, setJustReady] = React.useState(false);
  const prevReady = React.useRef(canSubmit);
  React.useEffect(() => {
    if (canSubmit && !prevReady.current) {
      setJustReady(true);
      const t = setTimeout(() => setJustReady(false), 1400);
      prevReady.current = canSubmit;
      return () => clearTimeout(t);
    }
    prevReady.current = canSubmit;
  }, [canSubmit]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        // Fixed to the viewport bottom; left offset follows the sidebar
        // so the pill only spans the main-content column (no overlap).
        "fixed bottom-4 right-4 left-4 z-40 mx-auto max-w-3xl rounded-xl border bg-neutral-900/95 shadow-2xl shadow-black/40 backdrop-blur transition-colors",
        sidebarInset === "open" &&
          "lg:left-[calc(14rem+1rem)] xl:left-[calc(16rem+1rem)]",
        sidebarInset === "collapsed" && "lg:left-[calc(4rem+1rem)]",
        canSubmit
          ? "border-emerald-500/60 ring-1 ring-emerald-500/40"
          : "border-neutral-800",
        justReady && "profile-ready-pop",
        className,
      )}
    >
      <style>{KEYFRAMES}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          {rejection ? (
            <RejectionCount {...rejection} />
          ) : vendorRequest ? (
            <VendorRequestCount {...vendorRequest} />
          ) : sections ? (
            <SectionChips sections={sections} />
          ) : null}
        </div>

        <Button
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
          className={cn(
            "bg-luxury-gold text-black hover:bg-luxury-gold/90 disabled:opacity-50 disabled:hover:bg-luxury-gold",
            canSubmit && !submitting && "profile-ready-glow",
          )}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" /> {submitLabel}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function RejectionCount({
  addressed,
  total,
  allAddressed,
}: {
  addressed: number;
  total: number;
  allAddressed: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={cn(
          "font-medium",
          allAddressed ? "text-emerald-500" : "text-white",
        )}
      >
        {allAddressed
          ? "All items addressed — ready to send"
          : `${addressed} of ${total} item${total === 1 ? "" : "s"} addressed`}
      </span>
      {!allAddressed && (
        <span className="text-xs text-gray-400">
          — {total - addressed} left
        </span>
      )}
    </div>
  );
}

/**
 * Vendor-request-cycle progress. Same visual footprint as RejectionCount,
 * but the "left" count is informational — a vendor who only wanted to edit
 * one of the granted fields can still submit. Copy is careful not to imply
 * "you must edit all of them" (which was the confusing behavior in the
 * previous single-chip design).
 */
function VendorRequestCount({
  changed,
  total,
}: {
  changed: number;
  total: number;
}) {
  const remaining = total - changed;
  const noneYet = changed === 0;
  const allChanged = changed === total && total > 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={cn(
          "font-medium",
          allChanged
            ? "text-emerald-500"
            : noneYet
              ? "text-gray-400"
              : "text-white",
        )}
      >
        {noneYet
          ? `${total} field${total === 1 ? "" : "s"} unlocked — edit any to submit`
          : allChanged
            ? `All ${total} field${total === 1 ? "" : "s"} updated — ready to send`
            : `${changed} of ${total} field${total === 1 ? "" : "s"} updated`}
      </span>
      {!noneYet && !allChanged && (
        <span className="text-xs text-gray-500 italic">
          — {remaining} more if needed
        </span>
      )}
    </div>
  );
}

function SectionChips({ sections }: { sections: ProgressSection[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {sections.map((s) => {
        const complete = s.total > 0 && s.filled >= s.total;
        const binary = s.total === 1;
        return (
          <span
            key={s.label}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs",
              complete
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-500"
                : "border-neutral-700 bg-neutral-900 text-gray-400",
            )}
          >
            {binary ? (
              <>
                {complete && <Check className="h-3 w-3" />}
                {s.label}
              </>
            ) : (
              <>
                {s.label} {s.filled}/{s.total}
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}
