// TODO(shared-profile): Duplicated from components/partner/profile/partner-submit-bar.tsx
// Consolidate into components/shared/profile/ once both partner and vendor
// flows are stable in production (target: after 2 weeks of vendor prod use).

"use client";

// ============================================
// apps/web/components/vendor/profile/vendor-submit-bar.tsx
// Thin provider-aware wrapper around StickySubmitBar. Because canSubmit and
// the flagged-item counts come from useRejectionProgress(), the bar has to be
// a child of RejectionProgressProvider — this component supplies that. In
// Modes 2/4 it drives off the flagged-item progress; in Mode 1 it uses the
// onboarding sections + completion passed from the panel.
// ============================================

import {
  StickySubmitBar,
  type ProgressSection,
} from "@/components/vendor/profile/sticky-submit-bar";
import { useRejectionProgress } from "@/components/vendor/profile/rejection-progress-context";

export interface VendorSubmitBarProps {
  visible: boolean;
  sections: ProgressSection[];
  onboardingComplete: boolean;
  submitting: boolean;
  onSubmit: () => void;
  sidebarInset?: "open" | "collapsed" | "none";
}

export function VendorSubmitBar({
  visible,
  sections,
  onboardingComplete,
  submitting,
  onSubmit,
  sidebarInset,
}: VendorSubmitBarProps) {
  const rp = useRejectionProgress();
  // Vendor-request flags don't gate submission — they're granted edit
  // permissions, not corrections. Only admin-rejection flags drive the
  // Mode 2/4 rejection UI and the "must address all" submit gate.
  const rejection = rp.rejectionActive
    ? {
        addressed: rp.rejectionAddressedCount,
        total: rp.rejectionTotal,
        allAddressed: rp.rejectionAllAddressed,
      }
    : null;
  // Three submit-gate cases:
  //   1. Admin rejection cycle → must address every rejection.
  //   2. Pure vendor-request cycle → must have actually modified at least one
  //      granted field/doc; a vendor who hasn't touched anything yet
  //      shouldn't be invited to submit (nothing has changed for admin to
  //      review, and re-submitting empty just wastes an admin review round).
  //   3. Onboarding / other → use the panel's onboarding completeness.
  const inVendorRequestCycle = !rp.rejectionActive && rp.vendorRequestTotal > 0;
  const canSubmit = rp.rejectionActive
    ? rp.rejectionAllAddressed
    : inVendorRequestCycle
      ? rp.vendorRequestChangedCount > 0
      : onboardingComplete;

  return (
    <StickySubmitBar
      visible={visible}
      // During a rejection cycle, sections chips are hidden (the rejection
      // count takes the slot). During a vendor-request cycle, we pass the
      // dedicated vendorRequest prop so the bar shows N of M edited with
      // informational copy ("N more if needed") that avoids implying the
      // vendor must touch every granted field.
      sections={rp.rejectionActive || inVendorRequestCycle ? null : sections}
      rejection={rejection}
      vendorRequest={
        inVendorRequestCycle
          ? {
              changed: rp.vendorRequestChangedCount,
              total: rp.vendorRequestTotal,
            }
          : null
      }
      canSubmit={canSubmit}
      submitting={submitting}
      onSubmit={onSubmit}
      sidebarInset={sidebarInset}
    />
  );
}
