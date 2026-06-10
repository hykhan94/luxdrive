// ============================================
// apps/server/src/controller/vendor/_shared.ts
// Shared gating helpers used by every vendor controller. Centralising these
// keeps the lockout rules consistent — when business rules change (e.g. adding
// SUSPENDED-vendor handling), they change here once instead of in 10 places.
// ============================================

import { prisma } from "../../lib/prisma";
import { BadRequestError } from "../../utils/AppError";

// The six required vendor profile documents. Mirrors the admin-side constant
// in controller/admin/vendor.controller.ts. If you add/remove a required doc,
// update both. (We don't import the admin constant to keep controller layers
// from depending on each other.)
export const REQUIRED_VENDOR_DOCUMENTS = [
  "CR",
  "VAT",
  "CHAMBER_OF_COMMERCE",
  "BALADY",
  "NATIONAL_ADDRESS",
  "IBAN_LETTER",
] as const;

export const VENDOR_DOCUMENT_LABELS: Record<string, string> = {
  CR: "Commercial Registration",
  VAT: "VAT Certificate",
  CHAMBER_OF_COMMERCE: "Chamber of Commerce",
  BALADY: "Balady License",
  NATIONAL_ADDRESS: "National Address",
  IBAN_LETTER: "IBAN Letter",
};

// ============== EXPIRED DOC LOOKUP ==============
// Returns the *type codes* (e.g. "BALADY") of any required document whose
// expiryDate is at or before now. A doc with no expiryDate is treated as
// non-expiring (most docs that require an expiry will have one set, and a
// missing date here means the upload flow didn't capture it — that's a
// different problem, not an expiry problem). Returns [] when nothing is
// expired.
//
// Computed live on every call. We deliberately don't cache or store a
// "isExpired" flag column because expiry is a function of wall-clock time;
// a stored flag would go stale the moment the clock crosses the date. A
// fresh query is cheap (6-row lookup on an indexed PK) and always correct.

export async function getExpiredRequiredDocs(
  vendorId: string,
): Promise<Array<{ type: string; label: string; expiryDate: Date }>> {
  const docs = await prisma.vendorDocument.findMany({
    where: {
      vendorId,
      type: { in: [...REQUIRED_VENDOR_DOCUMENTS] },
    },
    select: { type: true, expiryDate: true },
  });
  const now = new Date();
  return docs
    .filter(
      (d): d is { type: string; expiryDate: Date } =>
        d.expiryDate !== null && d.expiryDate <= now,
    )
    .map((d) => ({
      type: d.type,
      label: VENDOR_DOCUMENT_LABELS[d.type] || d.type,
      expiryDate: d.expiryDate,
    }));
}

// ============== STATUS GATING ==============
//
// Two helpers, both async (the doc-expiry check requires a DB lookup, so we
// can't keep the previous sync signature). Each controller picks the
// appropriate one based on whether the endpoint is a READ (allow operational
// statuses) or a WRITE (require fully-approved + valid docs).

/**
 * Allows the vendor through on any operational status (APPROVED,
 * PENDING_REVIEW, CHANGES_REQUESTED) — used for read endpoints like
 * "list my bookings" that should remain visible even while the profile is
 * under review. Blocks only INVITED / SUSPENDED.
 *
 * Does NOT check expired docs: read access stays open even with an expired
 * doc because the vendor needs to see their data to understand what's locked
 * and how to fix it.
 */
export function requireOperational(status: string) {
  // ONBOARDING (newly-invited, post-acceptance, not-yet-submitted)
  // included so vendors can browse the portal while filling out their
  // profile for the first time. Without this, every panel API call
  // 400s on a freshly-onboarded vendor and the dashboard toasts spam.
  // Mirrors partner/_shared.ts and the frontend's getAccessLevel.
  const allowed = [
    "APPROVED",
    "PENDING_REVIEW",
    "CHANGES_REQUESTED",
    "ONBOARDING",
  ];
  if (!allowed.includes(status)) {
    throw new BadRequestError(
      "Complete your profile and submit for review to access this section.",
    );
  }
}

/**
 * Earnings-specific read gate: same as requireOperational but ALSO allows
 * SUSPENDED. Reason: a vendor auto-suspended for non-payment needs to be
 * able to see what they owe, view receipt detail, download the PDF, and
 * upload payment proof — that's literally the path back to active status.
 *
 * Used on every read endpoint inside earnings.controller.ts. The write
 * action (uploadPaymentProof) has its own bespoke gate that mirrors this
 * but with finer-grained logic.
 *
 * Still blocks INVITED — a not-yet-onboarded vendor shouldn't be seeing
 * receipts.
 */
export function requireEarningsAccess(status: string) {
  const allowed = [
    "APPROVED",
    "PENDING_REVIEW",
    "CHANGES_REQUESTED",
    "ONBOARDING", // newly-onboarded vendors should see their (empty) earnings page
    "SUSPENDED",
  ];
  if (!allowed.includes(status)) {
    throw new BadRequestError(
      "Complete your profile and submit for review to access this section.",
    );
  }
}

/**
 * Hard write-action gate: vendor must be APPROVED AND have no expired
 * required documents. Used everywhere we'd previously called the sync
 * `requireApproved(status)` — replace with `await requireApprovedAndDocsValid(vendor)`.
 *
 * When expired docs block the action, the error message names them so the
 * frontend can render a useful banner pointing the vendor at the profile
 * change-request flow to renew.
 */
export async function requireApprovedAndDocsValid(vendor: {
  id: string;
  status: string;
}): Promise<void> {
  if (vendor.status !== "APPROVED") {
    throw new BadRequestError(
      "Your profile must be approved to perform this action.",
    );
  }
  const expired = await getExpiredRequiredDocs(vendor.id);
  if (expired.length > 0) {
    const names = expired.map((d) => d.label).join(", ");
    throw new BadRequestError(
      `Cannot perform this action — the following profile document${expired.length > 1 ? "s are" : " is"} expired: ${names}. Submit a profile change request to renew ${expired.length > 1 ? "them" : "it"}.`,
    );
  }
}
