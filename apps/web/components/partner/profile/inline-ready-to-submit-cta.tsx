"use client";

// ============================================
// apps/web/components/profile/inline-ready-to-submit-cta.tsx
// Mechanism 2 of the four submit-visibility cues: a green pill with a bouncing
// down-arrow that appears directly under the last-addressed flagged field once
// every flagged item is done, pointing the partner to the sticky Submit bar.
//
// Self-placing: render one next to each flagged field passing its key as
// `anchorKey`; it only renders for the field that matches the provider's
// lastAddressedKey, and only when allAddressed. It naturally disappears once
// the profile leaves editing mode after Submit.
// ============================================

import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRejectionProgress } from "@/components/partner/profile/rejection-progress-context";

export interface InlineReadyToSubmitCtaProps {
  anchorKey: string;
  className?: string;
}

export function InlineReadyToSubmitCta({
  anchorKey,
  className,
}: InlineReadyToSubmitCtaProps) {
  const { allAddressed, lastAddressedKey } = useRejectionProgress();

  if (!allAddressed || lastAddressedKey !== anchorKey) return null;

  return (
    <div
      role="status"
      className={cn(
        "mt-2 inline-flex items-center gap-2 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400",
        className,
      )}
    >
      <span>
        All items addressed. Submit at the bottom to send back to admin
      </span>
      <ArrowDown className="h-3.5 w-3.5 animate-bounce" aria-hidden="true" />
    </div>
  );
}
