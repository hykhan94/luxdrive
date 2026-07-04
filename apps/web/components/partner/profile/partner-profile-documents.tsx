"use client";

// ============================================
// apps/web/components/profile/partner-profile-documents.tsx
// Business Documents + MOU sections. Each is a ProfileSection with mini-cards
// in a 2-col grid. Header carries X/N uploaded + optional "All Complete" pill.
// ============================================

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  Pencil,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { partnerApi } from "@/lib/api";
import {
  DocumentUploadCard,
  type DocumentItem,
} from "@/components/partner/profile/document-upload-card";
import { InlineReadyToSubmitCta } from "@/components/partner/profile/inline-ready-to-submit-cta";
import {
  ProfileSection,
  SectionStatusPill,
} from "@/components/partner/profile/profile-section";
import {
  useRejectionProgress,
  type FlagSource,
} from "@/components/partner/profile/rejection-progress-context";

export interface MouData {
  fileUrl: string | null;
  filePath: string | null;
  expiryDate: string | null;
  uploadedAt: string | null;
}

export interface PartnerProfileDocumentsProps {
  profileId: string;
  editable: boolean;
  status: string;
  documents: DocumentItem[];
  mou: MouData;
  onDocumentUploaded: (doc: DocumentItem) => void;
  onMouUploaded: (mou: MouData) => void;
  onView: (doc: DocumentItem) => void;
}

// Strip the legacy "❌ Rejected: " prefix that admin panels embed into every
// comment as a discriminator, and the "Change requested by partner: " prefix
// backend uses for approved self-request-changes. We render the label
// ourselves with a proper icon and colour.
function cleanComment(raw: string): string {
  return raw
    .replace(/^❌\s*Rejected:\s*/i, "")
    .replace(/^Change requested by partner:\s*/i, "")
    .trim();
}

// Per-item flag banner (admin comment) rendered ABOVE a flagged card.
// Intentionally does NOT flip to an emerald "Updated — pending admin re-review"
// state after the partner replaces the file: we've had reports that partners
// misread that as "done, no more work needed" while they were still mid-flow.
// The banner stays amber until submit clears the whole rejection cycle.
// (Progress is communicated via the sticky bar / section header counts, which
// still use `addressed` for their numeric progress.)
function FlagBanner({
  comment,
  source,
}: {
  comment: string;
  source: FlagSource;
}) {
  const clean = cleanComment(comment);
  const isPartnerRequest = source === "partner_request";
  const isAdminComment = source === "admin_comment";
  const isInformational = isPartnerRequest || isAdminComment;
  return (
    <div
      className={cn(
        "mb-2 flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-[11px] leading-snug",
        isInformational
          ? "border-sky-500/40 bg-sky-500/15 text-sky-200"
          : "border-red-500/40 bg-red-500/15 text-red-200",
      )}
    >
      {isInformational ? (
        <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />
      ) : (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
      )}
      <div className="min-w-0">
        <div className="font-semibold">
          {isPartnerRequest
            ? "Editable at your request"
            : isAdminComment
              ? "Note from admin"
              : "Admin requested changes"}
        </div>
        {clean && (
          <div
            className={cn(
              "mt-0.5",
              isInformational ? "text-sky-300/90" : "text-red-300/90",
            )}
          >
            {clean}
          </div>
        )}
      </div>
    </div>
  );
}

export function PartnerProfileDocuments({
  profileId,
  editable,
  status,
  documents,
  mou,
  onDocumentUploaded,
  onMouUploaded,
  onView,
}: PartnerProfileDocumentsProps) {
  const { byKey } = useRejectionProgress();

  // Business Documents section header math.
  // Only ADMIN-rejection flags count against "needs update" and "All Complete"
  // — partner-request items are intentional edits, not outstanding corrections.
  const uploadedCount = documents.filter((d) => d.isUploaded).length;
  const total = documents.length;
  const adminFlaggedDocs = documents.filter(
    (d) => byKey[d.type]?.source === "admin_rejection",
  );
  const adminFlaggedCount = adminFlaggedDocs.length;
  const adminFlaggedAddressedCount = adminFlaggedDocs.filter(
    (d) => byKey[d.type]?.addressed,
  ).length;
  const flaggedUnaddressedCount =
    adminFlaggedCount - adminFlaggedAddressedCount;
  const allComplete =
    uploadedCount === total && total > 0 && adminFlaggedCount === 0;

  const mouItem: DocumentItem = {
    type: "MOU",
    label: "Memorandum of Understanding",
    isUploaded: !!mou.fileUrl,
    fileUrl: mou.fileUrl,
    filePath: mou.filePath,
    fileName: null,
    expiryDate: mou.expiryDate,
    uploadedAt: mou.uploadedAt,
    requiresExpiry: true,
  };
  const mouFlag = byKey["mou"];

  return (
    <>
      {/* ===== BUSINESS DOCUMENTS ===== */}
      <ProfileSection
        icon={FileCheck2}
        title="Business Documents"
        subtitle={
          flaggedUnaddressedCount > 0
            ? `${uploadedCount}/${total} uploaded · ${flaggedUnaddressedCount} awaiting your update`
            : adminFlaggedAddressedCount > 0
              ? `${uploadedCount}/${total} uploaded · ${adminFlaggedAddressedCount} updated, pending admin re-review`
              : `${uploadedCount}/${total} uploaded`
        }
        right={
          allComplete ? (
            <SectionStatusPill tone="complete">
              <CheckCircle2 className="h-3 w-3" />
              All Complete
            </SectionStatusPill>
          ) : flaggedUnaddressedCount > 0 ? (
            <SectionStatusPill tone="attention">
              <AlertTriangle className="h-3 w-3" />
              {flaggedUnaddressedCount} need
              {flaggedUnaddressedCount === 1 ? "s" : ""} update
            </SectionStatusPill>
          ) : adminFlaggedAddressedCount > 0 ? (
            <SectionStatusPill tone="pending">
              Awaiting re-review
            </SectionStatusPill>
          ) : (
            <SectionStatusPill tone="pending">
              {total - uploadedCount} pending
            </SectionStatusPill>
          )
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          {documents.map((doc) => {
            const flag = byKey[doc.type];
            const isInformational =
              flag?.source === "partner_request" ||
              flag?.source === "admin_comment";
            // Lock rules mirror fields: informational flags (partner-request
            // or admin note) stay unlocked, admin-rejection flags lock once
            // addressed (so the fix isn't regressed).
            const locked =
              !editable ||
              (status === "CHANGES_REQUESTED" &&
                !isInformational &&
                (!flag || flag.addressed));
            const isInfo =
              flag?.source === "partner_request" ||
              flag?.source === "admin_comment";
            return (
              <div
                key={doc.type}
                className={cn(
                  "flex h-full flex-col",
                  // Same "prominent flagged" treatment as fields: tinted card
                  // with a bold left rail and a 2s one-shot pulse ring so the
                  // partner immediately sees which docs need attention.
                  flag && "rounded-lg border-2 border-l-4 p-3",
                  flag && isInfo
                    ? "border-sky-500/40 border-l-sky-500 bg-sky-500/5 animate-[flag-pulse-sky_2s_ease-out_1]"
                    : flag
                      ? "border-red-500/40 border-l-red-500 bg-red-500/5 animate-[flag-pulse-red_2s_ease-out_1]"
                      : "",
                )}
              >
                {flag && (
                  <FlagBanner comment={flag.comment} source={flag.source} />
                )}
                <div className="flex-1">
                  <DocumentUploadCard
                    doc={doc}
                    section="partners"
                    entityId={profileId}
                    disabled={locked}
                    record={async ({ filePath, fileName, expiryDate }) => {
                      const res = await partnerApi.uploadDocument({
                        type: doc.type,
                        fileUrl: filePath,
                        fileName,
                        expiryDate,
                      });
                      return res.data.document as DocumentItem;
                    }}
                    onUploaded={onDocumentUploaded}
                    onView={onView}
                  />
                </div>
                <InlineReadyToSubmitCta anchorKey={doc.type} />
              </div>
            );
          })}
        </div>
      </ProfileSection>

      {/* ===== MOU ===== */}
      <ProfileSection
        icon={ScrollText}
        title="Memorandum of Understanding"
        subtitle={
          mou.fileUrl ? "Signed and on file" : "Required to activate account"
        }
        right={
          mou.fileUrl && mou.expiryDate ? (
            <SectionStatusPill tone="complete">
              <CheckCircle2 className="h-3 w-3" />
              Signed
            </SectionStatusPill>
          ) : (
            <SectionStatusPill tone="pending">Not signed</SectionStatusPill>
          )
        }
      >
        <div
          className={cn(
            // max-w-xl anchors the width whether the container is styled
            // (flagged) or bare (not flagged) — before the flag treatment was
            // added this cap lived on the inner div, but the container needs
            // it now so the red/sky border wraps tight around the doc card
            // instead of stretching across the full section width.
            "max-w-xl",
            mouFlag && "rounded-lg border-2 border-l-4 p-3",
            mouFlag &&
              (mouFlag.source === "partner_request" ||
                mouFlag.source === "admin_comment")
              ? "border-sky-500/40 border-l-sky-500 bg-sky-500/5 animate-[flag-pulse-sky_2s_ease-out_1]"
              : mouFlag
                ? "border-red-500/40 border-l-red-500 bg-red-500/5 animate-[flag-pulse-red_2s_ease-out_1]"
                : "",
          )}
        >
          {mouFlag && (
            <FlagBanner comment={mouFlag.comment} source={mouFlag.source} />
          )}
          <DocumentUploadCard
            doc={mouItem}
            section="partners"
            folder="mou"
            entityId={profileId}
            disabled={
              !editable ||
              (status === "CHANGES_REQUESTED" &&
                mouFlag?.source !== "partner_request" &&
                mouFlag?.source !== "admin_comment" &&
                (!mouFlag || mouFlag.addressed))
            }
            record={async ({ filePath, expiryDate }) => {
              const res = await partnerApi.uploadMou({
                fileUrl: filePath,
                expiryDate: expiryDate ?? "",
              });
              const m = res.data.mou;
              return {
                type: "MOU",
                label: "Memorandum of Understanding",
                isUploaded: true,
                fileUrl: m.fileUrl,
                filePath: m.filePath,
                fileName: null,
                expiryDate: m.expiryDate,
                uploadedAt: m.uploadedAt,
                requiresExpiry: true,
              } as DocumentItem;
            }}
            onUploaded={(item) =>
              onMouUploaded({
                fileUrl: item.fileUrl,
                filePath: item.filePath,
                expiryDate: item.expiryDate,
                uploadedAt: item.uploadedAt,
              })
            }
            onView={(d) => onView(d)}
          />
          <InlineReadyToSubmitCta anchorKey="mou" />
        </div>
      </ProfileSection>
    </>
  );
}
