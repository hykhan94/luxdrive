// TODO(shared-profile): Duplicated verbatim from components/partner/profile/rejection-banner.tsx
// Consolidate into components/shared/profile/ once both partner and vendor
// flows are stable in production (target: after 2 weeks of vendor prod use).

"use client";

// ============================================
// apps/web/components/vendor/profile/rejection-banner.tsx
// Mechanism 1 of the four submit-visibility cues: the top banner shown in
// Modes 2/4. While items remain it explains what to fix; once every flagged
// item is addressed its copy strengthens (and turns green) with an explicit
// "click Submit for Review below" instruction.
//
// Self-hiding: renders nothing when there are no flagged items (active=false),
// so the panel can mount it unconditionally.
// ============================================

import { AlertCircle, CheckCircle2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRejectionProgress } from "@/components/vendor/profile/rejection-progress-context";

export interface RejectionBannerProps {
  className?: string;
}

export function RejectionBanner({ className }: RejectionBannerProps) {
  const {
    active,
    total,
    items,
    rejectionActive,
    rejectionTotal,
    rejectionAddressedCount,
    rejectionAllAddressed,
  } = useRejectionProgress();

  // Nothing to say if there are no comments at all.
  if (!active) return null;

  // No admin rejections but vendor has open partner_request / admin_comment
  // items. Show a friendly sky-blue banner explaining editing is enabled.
  if (!rejectionActive) {
    const vendorRequestCount = items.filter(
      (i) => i.source === "partner_request",
    ).length;
    const adminNoteCount = items.filter(
      (i) => i.source === "admin_comment",
    ).length;
    return (
      <div
        className={cn(
          "rounded-lg border border-sky-500/40 bg-sky-500/10 p-4",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <Pencil className="mt-0.5 h-5 w-5 shrink-0 text-sky-400" />
          <div className="text-sm">
            <p className="font-medium text-sky-300">
              Editing enabled at your request
            </p>
            <p className="mt-0.5 text-sky-400/80">
              {vendorRequestCount > 0 && (
                <>
                  {vendorRequestCount} field
                  {vendorRequestCount === 1 ? "" : "s"} you asked to update{" "}
                  {vendorRequestCount === 1 ? "is" : "are"} unlocked below.
                </>
              )}
              {vendorRequestCount > 0 && adminNoteCount > 0 && " "}
              {adminNoteCount > 0 && (
                <>
                  Admin left {adminNoteCount === 1 ? "a note" : "notes"} on{" "}
                  {adminNoteCount} field
                  {adminNoteCount === 1 ? "" : "s"}.
                </>
              )}{" "}
              Your changes save automatically; submit when you&apos;re done.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const remaining = rejectionTotal - rejectionAddressedCount;

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        rejectionAllAddressed
          ? "border-emerald-500/50 bg-emerald-500/10"
          : "border-red-500/50 bg-red-500/10",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {rejectionAllAddressed ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
        ) : (
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
        )}
        <div className="text-sm">
          {rejectionAllAddressed ? (
            <p className="font-medium text-emerald-600 dark:text-emerald-400">
              All items addressed — click{" "}
              <span className="font-semibold">Submit for Review</span> below to
              send it back to the admin.
            </p>
          ) : (
            <>
              <p className="font-semibold text-red-200">
                The admin requested changes to {rejectionTotal} item
                {rejectionTotal === 1 ? "" : "s"}.
              </p>
              <p className="mt-0.5 text-red-300/90">
                Update the flagged items below — {remaining} still to address.
                Your changes save automatically; submit when you&apos;re done.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
