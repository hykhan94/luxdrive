// TODO(shared-profile): Duplicated verbatim from components/partner/profile/rejection-progress-context.tsx
// Consolidate into components/shared/profile/ once both partner and vendor
// flows are stable in production (target: after 2 weeks of vendor prod use).

"use client";

// ============================================
// apps/web/components/vendor/profile/rejection-progress-context.tsx
// Modes 2/4 (changes-requested) progress tracker.
//
// The admin flags specific items and the backend snapshots the field values
// at that moment (profileSnapshot). This provider derives, purely on the
// client, how many flagged items the vendor has addressed — updating live as
// they edit and upload — so the four submit-visibility mechanisms (unit #5)
// know when the last item is done.
//
// "Addressed" is decided per item kind:
//   - field:    current value differs from the pre-rejection snapshot value
//   - document: the doc's uploadedAt is newer than the flagging comment
//   - mou:      the MOU's uploadedAt is newer than the flagging comment
//
// Assumes adminComments keys are field keys, document TYPEs (e.g. "CR",
// "IBAN_LETTER"), or "mou". If the admin ever flags with different aliases,
// pass a small alias map — everything else stays the same.
// ============================================

import * as React from "react";
import type { ProfileFieldConfig } from "@/lib/profile-fields";

export interface AdminComment {
  id: string;
  comment: string;
  /**
   * Comment type from the backend enum PartnerReviewCommentType. Optional
   * because legacy responses (before Step 3 of the schema refactor) may not
   * include it — in that case we fall back to prefix parsing.
   */
  type?: "ADMIN_REJECTION" | "PARTNER_REQUEST" | "ADMIN_COMMENT";
  createdAt: string;
  isResolved?: boolean;
}

export interface RejectionDoc {
  type: string;
  label: string;
  uploadedAt: string | null;
}

export type RejectionItemKind = "field" | "document" | "mou" | "unknown";

/**
 * Distinguishes the three flows that all use PartnerReviewComment / VendorReviewComment. Driven
 * directly by the backend's `type` column when present; falls back to prefix
 * detection on the comment text for pre-refactor rows.
 *
 *   admin_rejection — admin flagged a field/doc during review. UI: amber
 *     "Admin requested changes", locks on address, gates Submit.
 *   partner_request — partner asked to edit an approved field; admin granted.
 *     UI: sky "Editable at your request", no lock, no gate.
 *   admin_comment  — admin left a neutral note. UI: sky, no lock, no gate.
 */
export type FlagSource =
  | "admin_rejection"
  | "partner_request"
  | "admin_comment";

export interface RejectionFlaggedItem {
  key: string;
  label: string;
  kind: RejectionItemKind;
  source: FlagSource;
  comment: string;
  addressed: boolean;
}

export interface RejectionProgressValue {
  /** true when there is at least one flagged item (i.e. Modes 2/4). */
  active: boolean;
  items: RejectionFlaggedItem[];
  byKey: Record<string, RejectionFlaggedItem>;
  total: number;
  addressedCount: number;
  remaining: number;
  /** active && every flagged item addressed. */
  allAddressed: boolean;
  /** Most-recently-addressed key — the inline CTA anchors to it. */
  lastAddressedKey: string | null;
  /**
   * Same shape as the aggregate counts above, but scoped to admin-rejection
   * items only. The sticky bar / banner use these because a vendor-request
   * flag isn't outstanding work — it's a granted edit permission, and doesn't
   * gate submission the way an admin rejection does.
   */
  rejectionActive: boolean;
  rejectionTotal: number;
  rejectionAddressedCount: number;
  rejectionAllAddressed: boolean;
  /**
   * Vendor-request scope: total granted-edit items, and how many the vendor
   * has actually modified (current value ≠ snapshot). The submit bar uses
   * `vendorRequestChangedCount > 0` to gate submission during a pure
   * vendor-request cycle — a vendor who hasn't touched anything yet
   * shouldn't see the "ready to submit" state.
   */
  vendorRequestTotal: number;
  vendorRequestChangedCount: number;
}

const EMPTY: RejectionProgressValue = {
  active: false,
  items: [],
  byKey: {},
  total: 0,
  addressedCount: 0,
  remaining: 0,
  allAddressed: false,
  lastAddressedKey: null,
  rejectionActive: false,
  rejectionTotal: 0,
  rejectionAddressedCount: 0,
  rejectionAllAddressed: false,
  vendorRequestTotal: 0,
  vendorRequestChangedCount: 0,
};

const RejectionProgressContext =
  React.createContext<RejectionProgressValue>(EMPTY);

export function useRejectionProgress(): RejectionProgressValue {
  return React.useContext(RejectionProgressContext);
}

const norm = (v: unknown) => (v == null ? "" : String(v)).trim();

function uploadedAfter(uploadedAt: string | null, flaggedAt: string): boolean {
  if (!uploadedAt || !flaggedAt) return false;
  const u = new Date(uploadedAt).getTime();
  const f = new Date(flaggedAt).getTime();
  return !Number.isNaN(u) && !Number.isNaN(f) && u > f;
}

export interface RejectionProgressProviderProps {
  /** adminComments from the profile GET (keys = field / doc-type / "mou"). */
  adminComments: Record<string, AdminComment[]>;
  /** profileSnapshot from the GET — pre-rejection field values. */
  profileSnapshot: Record<string, unknown> | null;
  /** Live field values (from useFieldAutosave). */
  values: Record<string, unknown>;
  /** Field config, to resolve which keys are fields and their labels. */
  fields: ProfileFieldConfig[];
  /** Live documents (type + label + uploadedAt). */
  documents: RejectionDoc[];
  /** Live MOU uploadedAt. */
  mouUploadedAt: string | null;
  children: React.ReactNode;
}

export function RejectionProgressProvider({
  adminComments,
  profileSnapshot,
  values,
  fields,
  documents,
  mouUploadedAt,
  children,
}: RejectionProgressProviderProps) {
  const fieldByKey = React.useMemo(() => {
    const m: Record<string, ProfileFieldConfig> = {};
    for (const f of fields) m[f.key] = f;
    return m;
  }, [fields]);

  const docByType = React.useMemo(() => {
    const m: Record<string, RejectionDoc> = {};
    for (const d of documents) m[d.type] = d;
    return m;
  }, [documents]);

  const computed = React.useMemo(() => {
    const keys = Object.keys(adminComments ?? {}).filter(
      (k) => (adminComments[k]?.length ?? 0) > 0,
    );
    if (keys.length === 0) return EMPTY;

    const snapshot = profileSnapshot ?? {};
    const items: RejectionFlaggedItem[] = keys.map((key) => {
      const latest = adminComments[key]?.[0]; // GET returns newest-first
      const comment = latest?.comment ?? "";
      const flaggedAt = latest?.createdAt ?? "";
      // Detect the flow. Prefer the backend enum (Step 3+); fall back to the
      // legacy comment prefix for any pre-refactor rows still in flight.
      let source: FlagSource;
      if (latest?.type === "PARTNER_REQUEST") {
        source = "partner_request";
      } else if (latest?.type === "ADMIN_COMMENT") {
        source = "admin_comment";
      } else if (latest?.type === "ADMIN_REJECTION") {
        source = "admin_rejection";
      } else if (
        comment.startsWith("Change requested by partner:") ||
        comment.startsWith("Change requested by vendor:")
      ) {
        source = "partner_request";
      } else {
        source = "admin_rejection";
      }
      // Only admin_rejection auto-addresses on edit and gates submit.
      const isRejection = source === "admin_rejection";

      if (fieldByKey[key]) {
        const cfg = fieldByKey[key];
        // For an ADMIN_REJECTION on a field, "addressed" needs stronger
        // evidence than "any character differs from snapshot":
        //   1. Non-empty (clearing a field isn't a fix; also matches the
        //      "empty values allowed" contract in ProfileFieldConfig).
        //   2. Passes the field's validator if one exists — a Chamber of
        //      Commerce number partway typed (say 3 digits of 12) isn't a
        //      valid replacement, so it shouldn't flip the status yet.
        //   3. Differs from the snapshot (the actual "changed" signal).
        // This prevents the sticky bar and REJECTED-vs-addressed indicators
        // from flipping true on the first keystroke.
        const current = norm(values[key]);
        const validatorOk = cfg.validate
          ? cfg.validate(current) === null
          : true;
        const addressed = isRejection
          ? current.length > 0 && validatorOk && current !== norm(snapshot[key])
          : false;
        return {
          key,
          label: cfg.label,
          kind: "field",
          source,
          comment,
          addressed,
        };
      }
      if (key === "mou") {
        return {
          key,
          label: "MOU",
          kind: "mou",
          source,
          comment,
          addressed: isRejection
            ? uploadedAfter(mouUploadedAt, flaggedAt)
            : false,
        };
      }
      const d = docByType[key];
      if (d) {
        return {
          key,
          label: d.label,
          kind: "document",
          source,
          comment,
          addressed: isRejection
            ? uploadedAfter(d.uploadedAt, flaggedAt)
            : false,
        };
      }
      return {
        key,
        label: key,
        kind: "unknown",
        source,
        comment,
        addressed: false,
      };
    });

    const byKey: Record<string, RejectionFlaggedItem> = {};
    for (const it of items) byKey[it.key] = it;
    const total = items.length;
    const addressedCount = items.filter((i) => i.addressed).length;

    const rejectionItems = items.filter((i) => i.source === "admin_rejection");
    const rejectionTotal = rejectionItems.length;
    const rejectionAddressedCount = rejectionItems.filter(
      (i) => i.addressed,
    ).length;

    // Vendor-request "changed" — has the vendor actually modified any of
    // the fields/docs they were granted permission to edit? Uses the same
    // signals as admin-rejection addressed (value vs snapshot for fields,
    // uploadedAt vs flaggedAt for docs), but we don't fold it into the item
    // object because vendor-request items intentionally never show "addressed"
    // UI — this is only for the submit-gate check.
    const vendorRequestItems = items.filter(
      (i) => i.source === "partner_request",
    );
    const vendorRequestTotal = vendorRequestItems.length;
    const vendorRequestChangedCount = vendorRequestItems.filter((it) => {
      const latest = adminComments[it.key]?.[0];
      const flaggedAt = latest?.createdAt ?? "";
      if (it.kind === "field") {
        // Same guard as the addressed check for rejections — a partly-typed
        // value shouldn't count toward the "any edit unlocks submit" gate.
        const cfg = fieldByKey[it.key];
        const current = norm(values[it.key]);
        if (current.length === 0) return false;
        if (cfg?.validate && cfg.validate(current) !== null) return false;
        return current !== norm(snapshot[it.key]);
      }
      if (it.kind === "mou") {
        return uploadedAfter(mouUploadedAt, flaggedAt);
      }
      if (it.kind === "document") {
        return uploadedAfter(docByType[it.key]?.uploadedAt, flaggedAt);
      }
      return false;
    }).length;

    return {
      active: total > 0,
      items,
      byKey,
      total,
      addressedCount,
      remaining: total - addressedCount,
      allAddressed: total > 0 && addressedCount === total,
      lastAddressedKey: null as string | null,
      rejectionActive: rejectionTotal > 0,
      rejectionTotal,
      rejectionAddressedCount,
      rejectionAllAddressed:
        rejectionTotal > 0 && rejectionAddressedCount === rejectionTotal,
      vendorRequestTotal,
      vendorRequestChangedCount,
    } satisfies RejectionProgressValue;
  }, [
    adminComments,
    profileSnapshot,
    values,
    fieldByKey,
    docByType,
    mouUploadedAt,
  ]);

  // Track which key most recently flipped to "addressed" — the inline CTA
  // anchors to it.
  const [lastAddressedKey, setLastAddressedKey] = React.useState<string | null>(
    null,
  );
  const prevAddressedRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    const nowAddressed = new Set(
      computed.items.filter((i) => i.addressed).map((i) => i.key),
    );
    let newlyAddressed: string | null = null;
    nowAddressed.forEach((k) => {
      if (!prevAddressedRef.current.has(k)) newlyAddressed = k;
    });
    if (newlyAddressed) setLastAddressedKey(newlyAddressed);
    prevAddressedRef.current = nowAddressed;
  }, [computed.items]);

  const value = React.useMemo<RejectionProgressValue>(
    () => ({ ...computed, lastAddressedKey }),
    [computed, lastAddressedKey],
  );

  return (
    <RejectionProgressContext.Provider value={value}>
      {children}
    </RejectionProgressContext.Provider>
  );
}
