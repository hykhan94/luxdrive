// ============================================
// apps/server/src/controller/partner/_shared.ts
// Shared gating helpers used by every partner controller. Centralising these
// keeps the lockout rules consistent — when business rules change (e.g. adding
// SUSPENDED-partner handling), they change here once instead of in 8 places.
// Mirrors the structure of vendor/_shared.ts.
// ============================================

import { prisma } from "../../lib/prisma";
import { BadRequestError } from "../../utils/AppError";

// The six required partner profile documents. Identical set to vendor's
// required docs because both account types submit the same Saudi-business
// paperwork. We don't import the vendor constant to keep controller layers
// from depending on each other — duplication is cheaper than coupling here.
export const REQUIRED_PARTNER_DOCUMENTS = [
  "CR",
  "VAT",
  "CHAMBER_OF_COMMERCE",
  "BALADY",
  "NATIONAL_ADDRESS",
  "IBAN_LETTER",
] as const;

export const PARTNER_DOCUMENT_LABELS: Record<string, string> = {
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
// non-expiring (most docs that require an expiry will have one set; a
// missing date here means the upload flow didn't capture it — that's a
// different problem, not an expiry problem). Returns [] when nothing is
// expired.
//
// Computed live on every call. We deliberately don't cache or store a
// "isExpired" flag column because expiry is a function of wall-clock time;
// a stored flag would go stale the moment the clock crosses the date. A
// fresh query is cheap (6-row lookup on an indexed PK) and always correct.

export async function getExpiredRequiredDocs(
  partnerId: string,
): Promise<Array<{ type: string; label: string; expiryDate: Date }>> {
  const docs = await prisma.partnerDocument.findMany({
    where: {
      partnerId,
      type: { in: [...REQUIRED_PARTNER_DOCUMENTS] },
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
      label: PARTNER_DOCUMENT_LABELS[d.type] || d.type,
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
 * Allows the partner through on any operational status (APPROVED,
 * PENDING_REVIEW, CHANGES_REQUESTED, ONBOARDING) — used for read
 * endpoints like "list my bookings" that should remain visible even
 * while the profile is under review or being filled out for the first
 * time. Blocks only INVITED (haven't accepted the link) / SUSPENDED.
 *
 * ONBOARDING is included so partners who just accepted their
 * invitation can browse the portal while completing their profile —
 * without this, every panel API call returns 400 and the dashboard
 * toasts spam the screen. The frontend's getAccessLevel already
 * collapses ONBOARDING into the "submitted" tier so tab gating is
 * uniform; this matches that.
 *
 * Does NOT check expired docs: read access stays open even with an
 * expired doc because the partner needs to see their data to
 * understand what's locked and how to fix it.
 */
export function requireOperational(status: string) {
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
 * Hard write-action gate: partner must be APPROVED AND have no expired
 * required documents. Used for the two partner write actions: creating a new
 * booking and generating a custom-range invoice.
 *
 * When expired docs block the action, the error message names them so the
 * frontend can render a useful banner pointing the partner at the profile
 * change-request flow to renew.
 */
export async function requireApprovedAndDocsValid(partner: {
  id: string;
  status: string;
}): Promise<void> {
  if (partner.status !== "APPROVED") {
    throw new BadRequestError(
      "Your profile must be approved to perform this action.",
    );
  }
  const expired = await getExpiredRequiredDocs(partner.id);
  if (expired.length > 0) {
    const names = expired.map((d) => d.label).join(", ");
    throw new BadRequestError(
      `Cannot perform this action — the following profile document${expired.length > 1 ? "s are" : " is"} expired: ${names}. Submit a profile change request to renew ${expired.length > 1 ? "them" : "it"}.`,
    );
  }
}
