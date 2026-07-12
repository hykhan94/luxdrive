// TODO(shared-profile): Duplicated from components/partner/profile/partner-profile-fields.tsx
// The two portal-specific bits are:
//   - partnerApi → vendorApi (call site of updateCompanyInfo, updateBankDetails, uploadLogo)
//   - PARTNER_FIELD_BY_KEY → VENDOR_FIELD_BY_KEY (field metadata lookup)
// The 'vendorRequest' domain naming (from useRejectionProgress) is retained
// deliberately — it names the self-requested-edit flow, not the portal.
// Consolidate into components/shared/profile/ once both flows are stable.

"use client";

// ============================================
// apps/web/components/vendor/profile/vendor-profile-fields.tsx
// The Company + Bank field sections of the vendor profile, wired to
// field-level autosave. Rendered INSIDE RejectionProgressProvider, so it reads
// per-field flag state straight from useRejectionProgress(). Specialized
// inputs (CR/VAT/IBAN/phone/…) keep their formatting; free-text fields use the
// autosave getFieldProps (event onChange + blur-flush). Logo is an inline
// cropped upload via useDocumentUpload.
//
// Takes only primitives + the autosave handle as props, so it doesn't need the
// panel's CompanyProfile type.
// ============================================

import * as React from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Image as ImageIcon,
  Landmark,
  Loader2,
  Pencil,
  Upload,
} from "lucide-react";
import {
  AccountNumberInput,
  BaladyNumberInput,
  BankSelector,
  ChamberNumberInput,
  CRNumberInput,
  EmailInput,
  IBANInput,
  PhoneInput,
  VATNumberInput,
} from "@/components/ui/form-fields";
import ImageCropper from "@/components/ui/image-cropper";
import { vendorApi } from "@/lib/api";
import { proxiedImageUrl } from "@/lib/image-url";
import { cn } from "@/lib/utils";
import type { UseFieldAutosaveResult } from "@/hooks/use-field-autosave";
import { useDocumentUpload } from "@/hooks/use-document-upload";
import { VENDOR_FIELD_BY_KEY } from "@/lib/vendor-profile-fields";
import { useRejectionProgress } from "@/components/vendor/profile/rejection-progress-context";
import { SavingIndicator } from "@/components/vendor/profile/saving-indicator";
import { InlineReadyToSubmitCta } from "@/components/vendor/profile/inline-ready-to-submit-cta";
import {
  ProfileSection,
  SectionStatusPill,
} from "@/components/vendor/profile/profile-section";

const COMPANY_FIELDS = [
  "companyName",
  "crNumber",
  "vatNumber",
  "chamberOfCommerceNumber",
  "baladyNumber",
  "contactPerson",
  "contactPhone",
  "contactEmail",
  "nationalAddress",
  "address",
];
const BANK_FIELDS = ["bankName", "bankAccountNumber", "bankIban"];
const FULL_WIDTH = new Set(["nationalAddress", "address"]);

// Fields that route to a specialized value/onChange(value) input.
const SPECIALIZED = new Set([
  "contactPhone",
  "contactEmail",
  "crNumber",
  "vatNumber",
  "chamberOfCommerceNumber",
  "baladyNumber",
  "bankIban",
  "bankAccountNumber",
  "bankName",
]);

function blobToFile(blob: Blob, name: string): File {
  const type = blob.type || "image/jpeg";
  return new File([blob], name, { type });
}

export interface VendorProfileFieldsProps {
  profileId: string;
  status: string;
  editable: boolean;
  logoUrl: string | null;
  autosave: UseFieldAutosaveResult;
  onLogoUploaded: (logoUrl: string | null) => void;
}

export function VendorProfileFields({
  profileId,
  status,
  editable,
  logoUrl,
  autosave,
  onLogoUploaded,
}: VendorProfileFieldsProps) {
  const { byKey } = useRejectionProgress();

  // ---- inline logo upload (cropped) ----
  const logoUpload = useDocumentUpload<string | null>({
    section: "vendors",
    folder: "logo",
    entityId: profileId,
    requiresExpiry: false,
    record: async ({ filePath }) => {
      const res = await vendorApi.uploadLogo({ logoUrl: filePath });
      return res.data?.logoUrl ?? null;
    },
    onUploaded: (url) => onLogoUploaded(url),
  });
  const logoInputRef = React.useRef<HTMLInputElement>(null);
  const [logoCrop, setLogoCrop] = React.useState<string | null>(null);

  const onLogoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogoCrop(reader.result as string);
    reader.readAsDataURL(file);
  };
  const onLogoCropDone = (blob: Blob) => {
    setLogoCrop(null);
    logoUpload.start(blobToFile(blob, "logo.jpg"));
  };
  const logoBusy =
    logoUpload.phase === "uploading" || logoUpload.phase === "processing";

  const renderInput = (
    key: string,
    value: string,
    set: (v: string) => void,
    locked: boolean,
    error: boolean,
  ) => {
    if (SPECIALIZED.has(key)) {
      const common = {
        value,
        onChange: set,
        label: "",
        disabled: locked,
        error,
      };
      switch (key) {
        case "contactPhone":
          return <PhoneInput {...common} />;
        case "contactEmail":
          return <EmailInput {...common} />;
        case "crNumber":
          return <CRNumberInput {...common} />;
        case "vatNumber":
          return <VATNumberInput {...common} />;
        case "chamberOfCommerceNumber":
          return <ChamberNumberInput {...common} />;
        case "baladyNumber":
          return <BaladyNumberInput {...common} />;
        case "bankIban":
          return <IBANInput {...common} />;
        case "bankAccountNumber":
          return <AccountNumberInput {...common} />;
        case "bankName":
          return <BankSelector {...common} />;
      }
    }
    // free-text: use autosave getFieldProps (event onChange + blur-flush)
    const props = autosave.getFieldProps(key);
    return (
      <input
        {...props}
        type="text"
        disabled={locked}
        className={cn(
          "w-full rounded-lg bg-neutral-800 px-4 py-3 text-white transition-colors focus:outline-none",
          locked
            ? "cursor-not-allowed border border-neutral-700 opacity-50"
            : error
              ? "border-2 border-red-500/60 focus:border-red-400"
              : "border border-neutral-700 focus:border-luxury-gold",
        )}
      />
    );
  };

  const renderField = (key: string) => {
    const cfg = VENDOR_FIELD_BY_KEY[key];
    if (!cfg) return null;
    const item = byKey[key];
    const flagged = !!item;
    const isVendorRequest = item?.source === "partner_request";
    const isAdminComment = item?.source === "admin_comment";
    // Informational = not a gating rejection; no lock, no submit gate.
    // Copy still differs: partner_request says "Editable at your request",
    // admin_comment says "Admin note".
    const isInformational = isVendorRequest || isAdminComment;
    // Lock rules:
    // - Not editable overall (approved read-only / suspended) -> locked.
    // - CHANGES_REQUESTED admin rejection: unlocked for the WHOLE cycle. Once
    //   vendor submits (status flips to PENDING_REVIEW), `editable` goes false
    //   and the outer !editable branch re-locks. No mid-flow re-lock — vendor
    //   should be free to type, correct typos, or paste different values right
    //   up until they hit Submit.
    // - CHANGES_REQUESTED informational (vendor request / admin note): same
    //   deal, unlocked the whole cycle.
    // - Other CHANGES_REQUESTED fields (unflagged) stay locked.
    const locked = !editable || (status === "CHANGES_REQUESTED" && !flagged);
    const value = String(autosave.values[key] ?? "");
    const st = autosave.getStatus(key);
    // Error border stays on for the whole rejection cycle (mirrors the amber
    // banner and red "Needs update" pill), regardless of whether provider
    // considers the value "addressed". Informational flags (partner_request /
    // admin_comment) never turn the border red.
    const error = st.state === "error" || (flagged && !isInformational);
    const set = (v: string) => autosave.setValue(key, v);

    return (
      <div key={key} className={FULL_WIDTH.has(key) ? "md:col-span-2" : ""}>
        <div
          className={cn(
            // Unflagged fields render flat as before — no container styling.
            // Flagged fields get a distinct card so the eye stops here: tinted
            // background, all-around border, a bold 4px left rail (red for
            // admin-rejection, sky for informational), rounded, and 12px of
            // internal padding. A 2-second one-shot ring pulse plays on mount
            // to draw attention without the nag of a continuous animation.
            flagged && "rounded-lg border-2 border-l-4 p-3",
            flagged && isInformational
              ? "border-sky-500/40 border-l-sky-500 bg-sky-500/5 animate-[flag-pulse-sky_2s_ease-out_1]"
              : flagged
                ? "border-red-500/40 border-l-red-500 bg-red-500/5 animate-[flag-pulse-red_2s_ease-out_1]"
                : "",
          )}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <label
              htmlFor={key}
              className="flex items-center gap-2 text-sm text-gray-400"
            >
              {cfg.label}
              {cfg.required && <span className="text-red-400">*</span>}
              {flagged &&
                (isInformational ? (
                  <span className="rounded border border-sky-500/40 bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-400">
                    {isVendorRequest ? "Editable" : "Note"}
                  </span>
                ) : (
                  <span className="rounded border border-red-500/50 bg-red-500/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-300 shadow-sm shadow-red-500/20">
                    Needs update
                  </span>
                ))}
            </label>
            <SavingIndicator status={st} />
          </div>

          {renderInput(key, value, set, locked, error)}

          {item && (
            <div
              className={cn(
                "mt-2 flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs leading-snug",
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
                  {isVendorRequest
                    ? "Editable at your request"
                    : isAdminComment
                      ? "Note from admin"
                      : "Admin requested changes"}
                </div>
                {(() => {
                  const clean = item.comment
                    .replace(/^❌\s*Rejected:\s*/i, "")
                    .replace(/^Change requested by (partner|vendor):\s*/i, "")
                    .trim();
                  return clean ? (
                    <div
                      className={cn(
                        "mt-0.5",
                        isInformational ? "text-sky-300/90" : "text-red-300/90",
                      )}
                    >
                      {clean}
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
          )}

          <InlineReadyToSubmitCta anchorKey={key} />
        </div>
      </div>
    );
  };

  return (
    <>
      {/* One-shot attention pulse for flagged fields/docs. Plays a 2s
          expanding colored glow via a box-shadow ring on mount, then rests.
          Two variants so the pulse color matches the container tint (red for
          admin rejection, sky for informational vendor-request / note). */}
      <style jsx global>{`
        @keyframes flag-pulse-red {
          0% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6);
          }
          70% {
            box-shadow: 0 0 0 12px rgba(239, 68, 68, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
          }
        }
        @keyframes flag-pulse-sky {
          0% {
            box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.55);
          }
          70% {
            box-shadow: 0 0 0 12px rgba(14, 165, 233, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(14, 165, 233, 0);
          }
        }
      `}</style>
      {/* ===== COMPANY LOGO ===== */}
      <ProfileSection
        icon={ImageIcon}
        title="Company Logo"
        subtitle={
          logoUrl ? "Displayed across your account" : "Give your profile a face"
        }
        right={
          logoUrl ? (
            <SectionStatusPill tone="complete">
              <CheckCircle2 className="h-3 w-3" /> Uploaded
            </SectionStatusPill>
          ) : (
            <SectionStatusPill tone="pending">Optional</SectionStatusPill>
          )
        }
      >
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={proxiedImageUrl(logoUrl, 150) ?? logoUrl}
                alt="Company logo"
                className="h-full w-full object-cover"
              />
            ) : (
              <Building2 className="h-7 w-7 text-neutral-600" />
            )}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-white">Company Logo</p>
            {logoBusy ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {logoUpload.phase === "processing"
                  ? "Saving…"
                  : `Uploading… ${logoUpload.progress}%`}
              </p>
            ) : logoUpload.phase === "confirmed" ? (
              <p className="flex items-center gap-1.5 text-xs text-emerald-500">
                <CheckCircle2 className="h-3.5 w-3.5" /> Logo updated
              </p>
            ) : logoUpload.phase === "error" ? (
              <button
                type="button"
                onClick={logoUpload.retry}
                className="text-xs text-red-400 underline"
              >
                {logoUpload.error ?? "Upload failed"} — retry
              </button>
            ) : (
              // Logo is optional and sits outside the review lifecycle — it
              // isn't gated by the same rules that lock profile fields on
              // APPROVED (the general `editable` prop). Any active vendor
              // status can update it; only SUSPENDED and pre-onboarding
              // INVITED are locked out.
              status !== "SUSPENDED" &&
              status !== "INVITED" && (
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 text-xs text-luxury-gold hover:underline"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {logoUrl ? "Replace logo" : "Upload logo"}
                </button>
              )
            )}
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onLogoPick}
          />
        </div>
      </ProfileSection>

      {/* ===== COMPANY INFO ===== */}
      <ProfileSection
        icon={Building2}
        title="Company Information"
        subtitle="Your legal identity and contact details"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {COMPANY_FIELDS.map(renderField)}
        </div>
      </ProfileSection>

      {/* ===== BANK DETAILS ===== */}
      <ProfileSection
        icon={Landmark}
        title="Bank Details"
        subtitle="Where we settle your payouts"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {BANK_FIELDS.map(renderField)}
        </div>
      </ProfileSection>

      {logoCrop && (
        <ImageCropper
          imageSrc={logoCrop}
          onCropComplete={onLogoCropDone}
          onCancel={() => setLogoCrop(null)}
          title="Upload Company Logo"
          saving={logoBusy}
        />
      )}
    </>
  );
}
