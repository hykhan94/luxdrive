"use client";

// ============================================
// components/partner/profile/profile-panel.tsx
// Partner Portal — Company Profile & Team
// With GCS signed URL file upload for documents, MOU, logo
// ============================================

import { useState, useEffect, useCallback, useRef } from "react";
import { partnerApi, uploadApi } from "@/lib/api";
import { useNotification } from "@/lib/notification-context";
import {
  PhoneInput,
  EmailInput,
  CRNumberInput,
  VATNumberInput,
  IBANInput,
  AccountNumberInput,
  BankSelector,
  ChamberNumberInput,
  BaladyNumberInput,
} from "@/components/ui/form-fields";
import {
  Building2,
  Edit2,
  Save,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Users,
  Plus,
  User,
  Upload,
  Send,
  RefreshCw,
  UserX,
  UserCheck,
  Trash2,
  ShieldCheck,
  Landmark,
  CreditCard,
  Eye,
  FileUp,
  AlertTriangle,
  Clock,
  Receipt,
  ScrollText,
  MapPin,
} from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

import ImageCropper from "@/components/ui/image-cropper";
import DocumentViewer from "@/components/ui/document-viewer";

import { proxiedImageUrl } from "@/lib/image-url";
// ============== TYPES ==============

interface CompanyProfile {
  id: string;
  status: string;
  isEditable: boolean;
  // Logo edit uses a softer rule than the rest of the profile —
  // branding isn't subject to admin review. Optional for backwards
  // compat with older API responses; falls back to isEditable when
  // missing.
  canEditLogo?: boolean;
  isApproved: boolean;
  isProfileComplete: boolean;
  companyInfo: {
    companyName: string;
    logoUrl: string | null;
    crNumber: string | null;
    vatNumber: string | null;
    chamberOfCommerceNumber: string | null;
    baladyNumber: string | null;
    nationalAddress: string | null;
    contactPerson: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    address: string | null;
  };
  bankDetails: {
    bankName: string | null;
    bankAccountNumber: string | null;
    bankIban: string | null;
  };
  documents: {
    items: Array<{
      type: string;
      label: string;
      isUploaded: boolean;
      fileUrl: string | null;
      // Stable GCS object path (raw, never signed). The backend writes
      // this alongside `fileUrl` so client-side diffs against the
      // snapshot use a stable identifier instead of the per-request
      // signed URL — without it, every flagged doc would read as
      // "addressed" because the signed URL token rotates on each
      // getProfile call even when the underlying file hasn't changed.
      filePath: string | null;
      fileName: string | null;
      expiryDate: string | null;
      uploadedAt: string | null;
      // Backend tells us which of the 6 required docs need a forced expiry
      // date on upload. We use this to render an inline date input next to
      // the upload button.
      requiresExpiry: boolean;
    }>;
    allUploaded: boolean;
    missingDocuments: string[];
    uploadedCount: number;
    requiredCount: number;
  };
  mou: {
    fileUrl: string | null;
    // Mirror of the doc-level filePath — stable, raw GCS path for
    // client-side snapshot diffs.
    filePath: string | null;
    expiryDate: string | null;
    uploadedAt: string | null;
  };
  adminComments: Record<
    string,
    Array<{ id: string; comment: string; createdAt: string }>
  >;
  unresolvedCommentCount: number;
  // Snapshot of field values + doc fileUrls at the moment admin
  // clicked "Request Changes." Used to diff current values against
  // the pre-rejection baseline so we can flag fields the partner
  // has already addressed in this round (emerald state) vs ones
  // still needing attention (red state). Null when no review cycle
  // is active. Mirror of the vendor side — same shape, same purpose.
  profileSnapshot: Record<string, any> | null;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  roleLabel: string;
  status: string;
  isActive: boolean;
  invitationSentAt: string | null;
  createdAt: string;
}

interface TeamRole {
  key: string;
  label: string;
  description: string;
}

// ============== HELPERS ==============

const STATUS_DISPLAY: Record<
  string,
  { label: string; color: string; bgColor: string; icon: typeof CheckCircle2 }
> = {
  INVITED: {
    label: "Invited — Complete Your Profile",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/30",
    icon: AlertCircle,
  },
  CHANGES_REQUESTED: {
    label: "Changes Requested by Admin",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/30",
    icon: AlertTriangle,
  },
  PENDING_REVIEW: {
    label: "Submitted — Awaiting Admin Review",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10 border-purple-500/30",
    icon: Clock,
  },
  APPROVED: {
    label: "Approved",
    color: "text-green-400",
    bgColor: "bg-green-500/10 border-green-500/30",
    icon: ShieldCheck,
  },
  SUSPENDED: {
    label: "Suspended",
    color: "text-red-400",
    bgColor: "bg-red-500/10 border-red-500/30",
    icon: AlertTriangle,
  },
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Document type icons
const DOC_ICONS: Record<string, { icon: typeof Building2; color: string }> = {
  CR: { icon: Building2, color: "text-blue-400 bg-blue-500/10" },
  VAT: { icon: Receipt, color: "text-emerald-400 bg-emerald-500/10" },
  CHAMBER_OF_COMMERCE: {
    icon: Landmark,
    color: "text-purple-400 bg-purple-500/10",
  },
  BALADY: { icon: ScrollText, color: "text-amber-400 bg-amber-500/10" },
  NATIONAL_ADDRESS: { icon: MapPin, color: "text-rose-400 bg-rose-500/10" },
  IBAN_LETTER: { icon: CreditCard, color: "text-cyan-400 bg-cyan-500/10" },
};

function AdminCommentBadge({
  comments,
}: {
  comments?: Array<{ comment: string; createdAt: string }>;
}) {
  if (!comments || comments.length === 0) return null;
  return (
    <div className="mt-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
      {comments.map((c, i) => (
        <p key={i} className="text-xs text-amber-400">
          <AlertCircle className="w-3 h-3 inline mr-1" />
          {c.comment}
        </p>
      ))}
    </div>
  );
}

// ============== FILE UPLOAD HOOK ==============

function useFileUpload(onSuccess: () => void, entityId: string) {
  const { showNotification } = useNotification();
  const [uploading, setUploading] = useState<string | null>(null);

  const uploadFile = async (
    file: File,
    category: "document" | "logo" | "mou",
    documentType?: string,
    // ISO date string for docs in DOCS_WITH_EXPIRY (CR, Chamber, Balady).
    // Backend rejects the upload with 400 if missing for those types.
    expiryDate?: string,
  ): Promise<string | null> => {
    const trackingKey = documentType || category;
    setUploading(trackingKey);

    try {
      // Validate file size
      const maxSize = category === "logo" ? 2 : 10; // MB
      if (file.size > maxSize * 1024 * 1024) {
        throw new Error(`File must be less than ${maxSize}MB`);
      }

      // Step 1: Get signed URL from shared upload endpoint
      const signedRes = await uploadApi.getSignedUploadUrl({
        fileName: file.name,
        fileType: file.type,
        section: "partners",
        folder:
          category === "logo"
            ? "logo"
            : category === "mou"
              ? "mou"
              : "documents",
        entityId,
      });

      if (!signedRes.data?.uploadUrl || !signedRes.data?.readUrl) {
        throw new Error("Failed to get upload URL");
      }

      const { uploadUrl, readUrl, filePath } = signedRes.data;

      // Step 2: Upload file directly to GCS via signed URL
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("File upload to storage failed");
      }

      // Step 3: Notify backend about the uploaded file
      if (category === "document" && documentType) {
        await partnerApi.uploadDocument({
          type: documentType,
          fileUrl: filePath,
          fileName: file.name,
          expiryDate,
        });
      } else if (category === "logo") {
        await partnerApi.uploadLogo({ logoUrl: filePath });
      }
      // MOU is handled separately (needs expiry date)

      showNotification("success", `${file.name} uploaded successfully`);
      onSuccess();
      return readUrl;
    } catch (err: any) {
      showNotification("error", err.message || "Upload failed");
      return null;
    } finally {
      setUploading(null);
    }
  };

  return { uploadFile, uploading };
}

// ============== FILE INPUT COMPONENT ==============

function FileUploadButton({
  label,
  accept,
  uploading,
  onFileSelect,
  variant = "default",
}: {
  label: string;
  accept: string;
  uploading: boolean;
  onFileSelect: (file: File) => void;
  variant?: "default" | "replace" | "primary";
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
      e.target.value = "";
    }
  };

  const styles =
    variant === "primary"
      ? "px-4 py-2 bg-luxury-gold text-black rounded-lg hover:bg-luxury-gold/90 text-sm font-medium"
      : variant === "replace"
        ? "text-xs text-luxury-gold hover:underline cursor-pointer"
        : "inline-flex items-center gap-2 px-3 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 text-sm cursor-pointer";

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={`${styles} transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {uploading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" />
            Uploading...
          </>
        ) : (
          <>
            {variant !== "replace" && (
              <Upload className="w-4 h-4 inline mr-1" />
            )}
            {label}
          </>
        )}
      </button>
    </>
  );
}

// ============== MAIN COMPONENT ==============

interface ProfilePanelProps {
  refreshBadges: () => void;
  isApproved: boolean;
}

export default function ProfilePanel({
  refreshBadges,
  isApproved,
}: ProfilePanelProps) {
  const { showNotification } = useNotification();

  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<
    CompanyProfile["companyInfo"] | null
  >(null);
  const [saving, setSaving] = useState(false);

  // Bank details
  const [bankEditing, setBankEditing] = useState(false);
  const [bankData, setBankData] = useState<
    CompanyProfile["bankDetails"] | null
  >(null);
  const [savingBank, setSavingBank] = useState(false);

  // MOU
  const [mouExpiry, setMouExpiry] = useState("");
  const [mouFilePath, setMouFilePath] = useState<string | null>(null);
  const [mouReadUrl, setMouReadUrl] = useState<string | null>(null);
  const [savingMou, setSavingMou] = useState(false);

  // Pending uploads for docs that require an expiry date (CR / CHAMBER /
  // BALADY). Each entry stores: the picked file (or cropped blob result),
  // the user-entered expiry date, and whether we're currently saving. The
  // doc card renders a date input + Save button while a file is pending;
  // we only call the upload API once both are present.
  // Keyed by doc type (e.g. "CR" → { file, expiryDate, saving }).
  const [pendingDocUploads, setPendingDocUploads] = useState<
    Record<string, { file: File; expiryDate: string; saving: boolean }>
  >({});

  // Submit
  const [submitting, setSubmitting] = useState(false);

  // Team
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "viewer",
  });
  const [addingMember, setAddingMember] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Document viewer
  const [viewingDoc, setViewingDoc] = useState<string | null>(null);
  const [docViewUrl, setDocViewUrl] = useState<string | null>(null);
  const [loadingDocView, setLoadingDocView] = useState(false);

  // Change request
  const [showChangeRequestModal, setShowChangeRequestModal] = useState(false);
  const [changeRequestFields, setChangeRequestFields] = useState<string[]>([]);
  const [changeRequestReason, setChangeRequestReason] = useState("");
  const [submittingChangeRequest, setSubmittingChangeRequest] = useState(false);
  const [changeRequests, setChangeRequests] = useState<
    Array<{
      id: string;
      fields: string[];
      reason: string;
      status: string;
      adminNote: string | null;
      createdAt: string;
      reviewedAt: string | null;
    }>
  >([]);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);

  // Image cropper
  const [cropperImage, setCropperImage] = useState<string | null>(null);
  const [cropperCategory, setCropperCategory] = useState<
    "logo" | "document" | "mou"
  >("logo");
  const [cropperDocType, setCropperDocType] = useState<string | null>(null);
  // Whether the doc being cropped requires an expiry date. Threads the
  // requiresExpiry flag from the doc card through the crop step so
  // handleCropComplete knows to push the result into pending state vs upload
  // it directly.
  const [cropperRequiresExpiry, setCropperRequiresExpiry] = useState(false);

  // Document viewer
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerFileName, setViewerFileName] = useState<string | undefined>(
    undefined,
  );
  const [viewerTitle, setViewerTitle] = useState<string | undefined>(undefined);

  // ---- Fetch Profile ----
  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await partnerApi.getProfile();
      if (res.data) {
        setProfile(res.data);
        setEditData(res.data.companyInfo);
        setBankData(res.data.bankDetails);
        if (res.data.mou.expiryDate)
          setMouExpiry(
            new Date(res.data.mou.expiryDate).toISOString().split("T")[0],
          );
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // ---- Fetch Team ----
  const fetchTeam = useCallback(async () => {
    setLoadingTeam(true);
    try {
      const res = await partnerApi.getTeamMembers();
      if (res.data) {
        setTeamMembers(res.data.members || []);
        setRoles(res.data.availableRoles || []);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load team");
    } finally {
      setLoadingTeam(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const fetchChangeRequests = useCallback(async () => {
    if (profile?.status !== "APPROVED") return;
    try {
      const res = await partnerApi.getChangeRequests();
      if (res.data) {
        setChangeRequests(res.data.requests || []);
        setHasPendingRequest(res.data.hasPending || false);
      }
    } catch {}
  }, [profile?.status]);

  useEffect(() => {
    fetchChangeRequests();
  }, [fetchChangeRequests]);

  // Auto-clear profile notifications only when there's nothing pending
  useEffect(() => {
    if (
      profile &&
      profile.status === "APPROVED" &&
      profile.unresolvedCommentCount === 0
    ) {
      partnerApi
        .markAllNotificationsAsRead({ category: "PROFILE" })
        .then(() => refreshBadges())
        .catch(() => {});
    }
  }, [profile?.status, profile?.unresolvedCommentCount]);

  // File upload hook
  const { uploadFile, uploading } = useFileUpload(
    fetchProfile,
    profile?.id || "",
  );

  const handleSubmitChangeRequest = async () => {
    if (changeRequestFields.length === 0) {
      showNotification("error", "Select at least one field");
      return;
    }
    if (!changeRequestReason.trim()) {
      showNotification("error", "Provide a reason");
      return;
    }
    setSubmittingChangeRequest(true);
    try {
      await partnerApi.requestProfileChanges({
        fields: changeRequestFields,
        reason: changeRequestReason,
      });
      showNotification(
        "success",
        "Change request submitted. Admin will review it shortly.",
      );
      setShowChangeRequestModal(false);
      setChangeRequestFields([]);
      setChangeRequestReason("");
      fetchChangeRequests();
    } catch (err: any) {
      showNotification("error", err.message || "Failed to submit");
    } finally {
      setSubmittingChangeRequest(false);
    }
  };

  // ---- View document (get fresh signed read URL) ----
  const handleViewDocument = async (
    fileUrl: string,
    fileName?: string,
    title?: string,
  ) => {
    // The profile API already returns signed read URLs
    // So just open the viewer directly — no need to call getSignedReadUrl again
    if (fileUrl.startsWith("http")) {
      setViewerUrl(fileUrl);
      setViewerFileName(fileName || undefined);
      setViewerTitle(title || undefined);
      return;
    }

    // Only call getSignedReadUrl if we have a raw GCS path (shouldn't happen normally)
    setLoadingDocView(true);
    setViewingDoc(fileUrl);
    try {
      const res = await uploadApi.getSignedReadUrl({ filePath: fileUrl });
      if (res.data?.readUrl) {
        setViewerUrl(res.data.readUrl);
        setViewerFileName(fileName || undefined);
        setViewerTitle(title || undefined);
      }
    } catch {
      showNotification("error", "Failed to load document");
    } finally {
      setLoadingDocView(false);
      setViewingDoc(null);
    }
  };
  if (loading || !profile)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
      </div>
    );

  const statusInfo = STATUS_DISPLAY[profile.status] || STATUS_DISPLAY.INVITED;
  const StatusIcon = statusInfo.icon;
  const editable = profile.isEditable;

  // Map profile field keys to possible admin comment keys (backend may use UPPERCASE doc-style keys)
  const FIELD_TO_COMMENT_KEYS: Record<string, string[]> = {
    baladyNumber: ["baladyNumber"],
    crNumber: ["crNumber"],
    vatNumber: ["vatNumber"],
    chamberOfCommerceNumber: ["chamberOfCommerceNumber"],
    nationalAddress: ["nationalAddress"],
    address: ["address"],
    contactPerson: ["contactPerson"],
    contactPhone: ["contactPhone"],
    contactEmail: ["contactEmail", "email"],
    companyName: ["companyName"],
    bankName: ["bankName"],
    bankAccountNumber: ["bankAccountNumber"],
    bankIban: ["bankIban"],
    // Document types — uppercase keys match exactly what admin selects
    CR: ["CR"],
    VAT: ["VAT"],
    CHAMBER_OF_COMMERCE: ["CHAMBER_OF_COMMERCE"],
    BALADY: ["BALADY"],
    NATIONAL_ADDRESS: ["NATIONAL_ADDRESS"],
    IBAN_LETTER: ["IBAN_LETTER"],
    mou: ["mou"],
  };

  const getFieldComments = (fieldKey: string) => {
    const keys = FIELD_TO_COMMENT_KEYS[fieldKey] || [fieldKey];
    for (const k of keys) {
      if (profile.adminComments[k]?.length > 0) return profile.adminComments[k];
    }
    return [];
  };

  // True when admin has rejected this specific field/doc (vs. just left
  // a plain comment). Drives the bold red border + "NEEDS UPDATE" badge
  // pattern that mirrors the vendor portal — vendor needs to spot the
  // affected items at a glance without reading every comment.
  const isFieldRejected = (fieldKey: string) =>
    getFieldComments(fieldKey).some((c: any) =>
      c.comment?.startsWith?.("❌ Rejected:"),
    );

  // True when (a) admin rejected this field AND (b) the partner has
  // already changed it from the snapshot baseline. Mirrors the vendor
  // portal — see vendor/profile.tsx for the full UX story. currentValue
  // is whatever the form has now (editData[key] for inputs, doc.fileUrl
  // for uploads). Both sides normalized so empty-string vs null isn't
  // treated as a change.
  //
  // Important nuance for partner: the snapshot map and adminComments
  // map both key by the BACKEND field name (e.g. "CR" for the CR
  // document). The FIELD_TO_COMMENT_KEYS table above already does the
  // UI-key → backend-key mapping for comments; we mirror that here.
  const isFieldAddressed = (fieldKey: string, currentValue: any): boolean => {
    if (!isFieldRejected(fieldKey)) return false;
    const snap = profile.profileSnapshot;
    if (!snap || typeof snap !== "object" || Object.keys(snap).length === 0) {
      return false;
    }
    // Try each candidate snapshot key the comment-mapper would have
    // tried, plus the UI key itself as a fallback.
    const candidateKeys = [
      ...(FIELD_TO_COMMENT_KEYS[fieldKey] || []),
      fieldKey,
    ];
    const norm = (v: any) => (v === undefined || v === null ? "" : String(v));
    for (const k of candidateKeys) {
      const prev = (snap as Record<string, any>)[k];
      if (prev === undefined) continue;
      return norm(prev) !== norm(currentValue);
    }
    return false;
  };

  // Summary counts for the review-progress banner at the top of the
  // panel. Walks every field with an unresolved rejection comment and
  // buckets it into addressed vs pending using the same isFieldAddressed
  // helper. Source-of-truth lookup: try editData / bankData (unsaved
  // edits) before falling back to profile.* (last-saved values) so the
  // banner stays accurate whether the partner is mid-edit or just
  // viewing. Docs and MOU read from profile.documents / profile.mou
  // since those don't have a parallel "unsaved" buffer.
  const rejectionSummary = (() => {
    if (!profile?.adminComments)
      return { rejected: [], addressed: [], pending: [] };
    const rejectedFields = Object.keys(profile.adminComments).filter((f) =>
      isFieldRejected(f),
    );
    const addressed: string[] = [];
    const pending: string[] = [];
    for (const f of rejectedFields) {
      const current =
        (editData as Record<string, any> | null)?.[f] ??
        (bankData as Record<string, any> | null)?.[f] ??
        (profile.companyInfo as Record<string, any>)[f] ??
        (profile.bankDetails as Record<string, any>)[f] ??
        profile.documents?.items?.find((d: any) => d.type === f)?.filePath ??
        (f === "mou" || f === "MOU" ? profile.mou?.filePath : undefined);
      if (isFieldAddressed(f, current)) addressed.push(f);
      else pending.push(f);
    }
    return { rejected: rejectedFields, addressed, pending };
  })();

  // ---- Handlers ----
  const handleSaveCompanyInfo = async () => {
    if (!editData) return;
    setSaving(true);
    try {
      await partnerApi.updateCompanyInfo(editData);
      showNotification("success", "Company info updated");
      setIsEditing(false);
      fetchProfile();
    } catch (err: any) {
      showNotification("error", err.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBankDetails = async () => {
    if (!bankData) return;
    setSavingBank(true);
    try {
      await partnerApi.updateBankDetails(bankData);
      showNotification("success", "Bank details updated");
      setBankEditing(false);
      fetchProfile();
    } catch (err: any) {
      showNotification("error", err.message || "Failed to update");
    } finally {
      setSavingBank(false);
    }
  };

  const handleDocumentUpload = async (
    file: File,
    docType: string,
    requiresExpiry: boolean,
  ) => {
    if (file.size > 10 * 1024 * 1024) {
      showNotification("error", "File must be less than 10MB");
      return;
    }

    // For docs that need an expiry date, stash the file in pending state and
    // wait for the user to enter the date + click Save. We can't ask for the
    // date upfront because for images we still need to go through the cropper
    // first — and for PDFs we want a consistent UX (file picked + date input
    // visible at the same time, then a single Save click).
    //
    // Images still go through the cropper; we update pending state after the
    // crop completes via handleCropComplete below.
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        setCropperImage(reader.result as string);
        setCropperCategory("document");
        setCropperDocType(docType);
        // Remember whether this doc needs expiry, so handleCropComplete
        // knows whether to push to pending state or upload directly.
        setCropperRequiresExpiry(requiresExpiry);
      };
      reader.readAsDataURL(file);
    } else if (requiresExpiry) {
      // Direct (PDF) path for expiry-required docs: stash and wait for Save
      setPendingDocUploads((prev) => ({
        ...prev,
        [docType]: { file, expiryDate: "", saving: false },
      }));
    } else {
      // Direct upload path for docs that don't need expiry
      await uploadFile(file, "document", docType);
    }
  };

  // Save handler triggered by the "Save Document" button shown next to the
  // expiry date input for a pending upload.
  const handleSavePendingDoc = async (docType: string) => {
    const pending = pendingDocUploads[docType];
    if (!pending) return;
    if (!pending.expiryDate) {
      showNotification("error", "Set the expiry date before saving");
      return;
    }
    setPendingDocUploads((prev) => ({
      ...prev,
      [docType]: { ...prev[docType], saving: true },
    }));
    try {
      const result = await uploadFile(
        pending.file,
        "document",
        docType,
        pending.expiryDate,
      );
      if (result !== null) {
        // Clear the pending entry on success
        setPendingDocUploads((prev) => {
          const { [docType]: _, ...rest } = prev;
          return rest;
        });
      } else {
        // Failed — keep file but reset saving flag so user can retry
        setPendingDocUploads((prev) => ({
          ...prev,
          [docType]: { ...prev[docType], saving: false },
        }));
      }
    } catch {
      setPendingDocUploads((prev) => ({
        ...prev,
        [docType]: { ...prev[docType], saving: false },
      }));
    }
  };

  const handleCancelPendingDoc = (docType: string) => {
    setPendingDocUploads((prev) => {
      const { [docType]: _, ...rest } = prev;
      return rest;
    });
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    // Convert blob to File for upload
    const extension = cropperCategory === "logo" ? "jpg" : "jpg";
    const fileName =
      cropperCategory === "logo"
        ? `company-logo.${extension}`
        : `${cropperDocType || "document"}.${extension}`;

    const file = new File([croppedBlob], fileName, { type: "image/jpeg" });

    setCropperImage(null); // Close cropper
    // Snapshot the flag before we reset state below
    const requiresExpiry = cropperRequiresExpiry;
    setCropperRequiresExpiry(false);

    if (cropperCategory === "logo") {
      await uploadFile(file, "logo");
    } else if (cropperCategory === "document" && cropperDocType) {
      if (requiresExpiry) {
        // Stash cropped image as a pending upload — UI will render date
        // input + Save button for the user to complete the action.
        setPendingDocUploads((prev) => ({
          ...prev,
          [cropperDocType]: { file, expiryDate: "", saving: false },
        }));
      } else {
        await uploadFile(file, "document", cropperDocType);
      }
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      showNotification("error", "File must be less than 5MB");
      return;
    }
    // For images, open cropper first
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        setCropperImage(reader.result as string);
        setCropperCategory("logo");
        setCropperDocType(null);
      };
      reader.readAsDataURL(file);
    } else {
      await uploadFile(file, "logo");
    }
  };

  const handleMouFileSelect = async (file: File) => {
    // Upload to GCS but don't save to DB yet (needs expiry date)
    const trackingKey = "mou";
    try {
      const signedRes = await uploadApi.getSignedUploadUrl({
        fileName: file.name,
        fileType: file.type,
        section: "partners",
        folder: "mou",
        entityId: profile.id,
      });

      if (!signedRes.data?.uploadUrl)
        throw new Error("Failed to get upload URL");

      const uploadResponse = await fetch(signedRes.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadResponse.ok) throw new Error("Upload failed");

      setMouFilePath(signedRes.data.filePath);
      setMouReadUrl(signedRes.data.readUrl);
      showNotification(
        "success",
        `${file.name} uploaded — now set expiry date and save`,
      );
    } catch (err: any) {
      showNotification("error", err.message || "MOU upload failed");
    }
  };

  const handleSaveMou = async () => {
    if (!mouFilePath && !profile.mou.fileUrl) {
      showNotification("error", "Upload a MOU file first");
      return;
    }
    if (!mouExpiry) {
      showNotification("error", "Set the MOU expiry date");
      return;
    }
    setSavingMou(true);
    try {
      await partnerApi.uploadMou({
        fileUrl: mouFilePath || profile.mou.fileUrl!,
        expiryDate: mouExpiry,
      });
      showNotification("success", "MOU saved");
      setMouFilePath(null);
      setMouReadUrl(null);
      fetchProfile();
    } catch (err: any) {
      showNotification("error", err.message || "Failed to save MOU");
    } finally {
      setSavingMou(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await partnerApi.submitProfileForReview();
      showNotification("success", "Profile submitted for review!");
      fetchProfile();
      refreshBadges();
    } catch (err: any) {
      showNotification("error", err.message || "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  // Team handlers
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingMember(true);
    try {
      await partnerApi.addTeamMember(addForm);
      showNotification("success", `Invitation sent to ${addForm.email}`);
      setShowAddModal(false);
      setAddForm({ name: "", email: "", phone: "", role: "viewer" });
      fetchTeam();
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setAddingMember(false);
    }
  };

  const handleResendInvite = async (id: string) => {
    setActionLoading(id);
    try {
      await partnerApi.resendTeamMemberInvite(id);
      showNotification("success", "Invitation resent");
    } catch (err: any) {
      showNotification("error", err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleChangeRole = async (id: string, role: string) => {
    setActionLoading(id);
    try {
      await partnerApi.updateTeamMemberRole(id, { role });
      showNotification("success", "Role updated");
      fetchTeam();
    } catch (err: any) {
      showNotification("error", err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivate = async (id: string) => {
    setActionLoading(id);
    try {
      await partnerApi.deactivateTeamMember(id);
      showNotification("success", "Member deactivated");
      fetchTeam();
    } catch (err: any) {
      showNotification("error", err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async (id: string) => {
    setActionLoading(id);
    try {
      await partnerApi.reactivateTeamMember(id);
      showNotification("success", "Member reactivated");
      fetchTeam();
    } catch (err: any) {
      showNotification("error", err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveMember = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} permanently?`)) return;
    setActionLoading(id);
    try {
      await partnerApi.removeTeamMember(id);
      showNotification("success", `${name} removed`);
      fetchTeam();
    } catch (err: any) {
      showNotification("error", err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // ============== EXPIRY WARNINGS ==============
  //
  // Build a unified list of docs (6 required docs + MOU) with their expiry
  // urgency. We surface anything that's expired OR expiring within 30 days as
  // a top-of-page banner so the partner sees the issue without scrolling. The
  // same chip is also rendered inline on each doc card for in-place urgency.
  //
  // Computed every render — cheap since it's a fixed-size list.
  type ExpiryUrgency = "expired" | "critical" | "warning" | "soon";
  function expiryUrgency(expiryDate: string | Date | null): {
    days: number;
    urgency: ExpiryUrgency;
  } | null {
    if (!expiryDate) return null;
    const ts = new Date(expiryDate).getTime();
    if (Number.isNaN(ts)) return null;
    const days = Math.ceil((ts - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return { days, urgency: "expired" };
    if (days <= 7) return { days, urgency: "critical" }; // red
    if (days <= 14) return { days, urgency: "warning" }; // orange
    if (days <= 30) return { days, urgency: "soon" }; // amber
    return null; // > 30 days, not surfaced
  }

  const expiringItems: Array<{
    label: string;
    days: number;
    urgency: ExpiryUrgency;
    expiryDate: string;
  }> = [];
  for (const doc of profile.documents.items) {
    if (!doc.isUploaded || !doc.expiryDate) continue;
    const info = expiryUrgency(doc.expiryDate);
    if (info)
      expiringItems.push({
        label: doc.label,
        days: info.days,
        urgency: info.urgency,
        expiryDate: doc.expiryDate,
      });
  }
  if (profile.mou.expiryDate) {
    const info = expiryUrgency(profile.mou.expiryDate);
    if (info)
      expiringItems.push({
        label: "MOU",
        days: info.days,
        urgency: info.urgency,
        expiryDate: profile.mou.expiryDate,
      });
  }
  // Sort: expired first (most urgent), then by days ascending
  expiringItems.sort((a, b) => a.days - b.days);

  // Build the list of doc types affected by expiry — both expired and
  // expiring-soon docs are surfaced. When the partner clicks Request
  // Changes, these are pre-ticked in the modal so they don't have to
  // re-check each one. Mirrors the vendor portal's allAffectedDocTypes.
  //
  // We iterate the same data as expiringItems but capture the `type`
  // (modal key) rather than the display label. MOU uses two keys: "mou"
  // for the file itself and "mouExpiry" for the date — both go in
  // because renewing an expiring MOU needs both updated.
  const allAffectedFieldKeys: string[] = [];
  for (const doc of profile.documents.items) {
    if (!doc.isUploaded || !doc.expiryDate) continue;
    const info = expiryUrgency(doc.expiryDate);
    if (info) allAffectedFieldKeys.push(doc.type);
  }
  if (profile.mou.expiryDate) {
    const info = expiryUrgency(profile.mou.expiryDate);
    if (info) {
      allAffectedFieldKeys.push("mou");
      allAffectedFieldKeys.push("mouExpiry");
    }
  }

  // Open the modal with affected fields pre-selected. Matches the vendor
  // portal: passing preSelected from the Request Changes button auto-
  // ticks those checkboxes on open; opening without args (e.g. from a
  // different trigger) leaves the list empty for full manual selection.
  const openChangeRequestModal = (preSelected: string[] = []) => {
    setChangeRequestFields(preSelected);
    setShowChangeRequestModal(true);
  };

  // Choose banner color by the worst urgency in the list
  const worstUrgency: ExpiryUrgency | null = expiringItems.length
    ? expiringItems[0].urgency
    : null;
  const bannerColors: Record<
    ExpiryUrgency,
    { bg: string; border: string; text: string; subText: string; icon: string }
  > = {
    expired: {
      bg: "bg-red-500/5",
      border: "border-red-500/30",
      text: "text-red-400",
      subText: "text-red-400/70",
      icon: "text-red-400",
    },
    critical: {
      bg: "bg-red-500/5",
      border: "border-red-500/30",
      text: "text-red-400",
      subText: "text-red-400/70",
      icon: "text-red-400",
    },
    warning: {
      bg: "bg-orange-500/5",
      border: "border-orange-500/30",
      text: "text-orange-400",
      subText: "text-orange-400/70",
      icon: "text-orange-400",
    },
    soon: {
      bg: "bg-amber-500/5",
      border: "border-amber-500/30",
      text: "text-amber-400",
      subText: "text-amber-400/70",
      icon: "text-amber-400",
    },
  };

  // ============== RENDER ==============
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Status Banner */}
      <div
        className={`p-4 rounded-xl border ${statusInfo.bgColor} flex items-center gap-3`}
      >
        <StatusIcon className={`w-5 h-5 flex-shrink-0 ${statusInfo.color}`} />
        <div className="flex-1">
          <p className={`text-sm font-medium ${statusInfo.color}`}>
            {statusInfo.label}
          </p>
          {profile.status === "CHANGES_REQUESTED" &&
            profile.unresolvedCommentCount > 0 && (
              <p className={`text-xs opacity-80 mt-0.5 ${statusInfo.color}`}>
                {profile.unresolvedCommentCount} item(s) need your attention —
                see highlighted fields below
              </p>
            )}
        </div>
        {profile.status === "APPROVED" && (
          <span className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-medium rounded-full border border-green-500/30">
            Verified
          </span>
        )}
      </div>

      {/* ============== REVIEW PROGRESS BANNER ==============
          Only renders when admin has an active review cycle (at least
          one field has an unresolved rejection comment). Shows running
          counts so the partner knows how many items they've addressed
          in this round vs how many still need attention — useful
          before clicking Submit so they don't bounce back from admin
          for an item they overlooked. Mirrors the vendor portal banner. */}
      {rejectionSummary.rejected.length > 0 && (
        <div
          className={`p-4 rounded-xl border ${
            rejectionSummary.pending.length === 0
              ? "bg-emerald-500/10 border-emerald-500/30"
              : "bg-amber-500/10 border-amber-500/30"
          }`}
        >
          <div className="flex items-start gap-3">
            {rejectionSummary.pending.length === 0 ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p
                className={`text-sm font-medium ${
                  rejectionSummary.pending.length === 0
                    ? "text-emerald-400"
                    : "text-amber-400"
                }`}
              >
                {rejectionSummary.pending.length === 0
                  ? `All ${rejectionSummary.rejected.length} flagged item${rejectionSummary.rejected.length === 1 ? "" : "s"} addressed — ready to submit`
                  : `${rejectionSummary.addressed.length} of ${rejectionSummary.rejected.length} flagged item${rejectionSummary.rejected.length === 1 ? "" : "s"} addressed — ${rejectionSummary.pending.length} still pending`}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {rejectionSummary.pending.length === 0
                  ? "Save your changes; admin will be notified to review."
                  : "Scroll down — pending items are marked in red, addressed items in green."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===== EXPIRY WARNING BANNERS ===== */}
      {/* Matches the vendor portal pattern: stacked individual banners, one
          per urgency bucket, rather than a single combined banner. Each
          banner uses the vendor's exact styling: p-4 rounded-xl border,
          icon on the left, title + comma-separated affected items.
          Partner profile has 2 buckets (no "incomplete uploads" concept
          like vendor fleet): Expired and Expiring Soon. */}
      {/* Expiry banners — APPROVED-only. Pre-approval the warning is
          misleading: admin hasn't yet validated those uploads, the
          partner can't trigger the renewal flow (Request Changes is
          locked to APPROVED), and the noise distracts from the
          immediate task of submitting the profile. Once approved,
          renewal is real and time-sensitive, so the banners come
          back. */}
      {profile.status === "APPROVED" &&
        expiringItems.length > 0 &&
        (() => {
          const expired = expiringItems.filter((i) => i.urgency === "expired");
          // Expiring soon = anything not yet expired but flagged
          // (critical/warning/soon, i.e. 30 days or less)
          const expiringSoon = expiringItems.filter(
            (i) => i.urgency !== "expired",
          );
          return (
            <div className="space-y-2">
              {expired.length > 0 && (
                <div className="p-4 rounded-xl border bg-red-500/5 border-red-500/20 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-400">
                      Expired Documents
                    </p>
                    <p className="text-xs text-red-400/70 mt-0.5">
                      {expired
                        .map(
                          (i) =>
                            `${i.label} (expired ${Math.abs(i.days)}d ago)`,
                        )
                        .join(", ")}{" "}
                      —{" "}
                      {profile.status === "APPROVED"
                        ? "submit a profile change request to upload renewed copies. Expired documents block new bookings and invoice generation."
                        : "update expired documents to maintain eligibility."}
                    </p>
                  </div>
                </div>
              )}
              {expiringSoon.length > 0 && (
                <div className="p-4 rounded-xl border bg-yellow-500/5 border-yellow-500/20 flex items-start gap-3">
                  <Clock className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-400">
                      Documents Expiring Soon
                    </p>
                    <p className="text-xs text-yellow-400/70 mt-0.5">
                      {expiringSoon
                        .map(
                          (i) =>
                            `${i.label} (${i.days === 0 ? "today" : `${i.days}d`})`,
                        )
                        .join(", ")}{" "}
                      — renew before expiry to avoid suspension.
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      {/* ===== CHANGE REQUEST (shown only when approved) ===== */}
      {profile.status === "APPROVED" && (
        <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Edit2 className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">
                  Need to update your profile?
                </p>
                <p className="text-xs text-gray-500">
                  Submit a change request to admin for approval
                </p>
              </div>
            </div>
            <button
              onClick={() => openChangeRequestModal(allAffectedFieldKeys)}
              disabled={hasPendingRequest}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {hasPendingRequest ? (
                <>
                  <Clock className="w-4 h-4" /> Request Pending
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" /> Request Changes
                </>
              )}
            </button>
          </div>

          {/* Show recent change requests */}
          {changeRequests.length > 0 && (
            <div className="mt-4 pt-4 border-t border-neutral-800 space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                Recent Requests
              </p>
              {changeRequests.slice(0, 3).map((req) => (
                <div
                  key={req.id}
                  className={`p-3 rounded-lg border text-sm ${
                    req.status === "PENDING"
                      ? "bg-amber-500/5 border-amber-500/20"
                      : req.status === "APPROVED"
                        ? "bg-green-500/5 border-green-500/20"
                        : "bg-red-500/5 border-red-500/20"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        req.status === "PENDING"
                          ? "bg-amber-500/20 text-amber-400"
                          : req.status === "APPROVED"
                            ? "bg-green-500/20 text-green-400"
                            : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {req.status === "PENDING"
                        ? "⏳ Pending"
                        : req.status === "APPROVED"
                          ? "✓ Approved"
                          : "✗ Rejected"}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDate(req.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    Fields: {(req.fields as string[]).join(", ")}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Reason: {req.reason}
                  </p>
                  {req.adminNote && (
                    <p className="text-xs text-luxury-gold mt-1">
                      Admin: {req.adminNote}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== COMPANY INFO ===== */}
      {(() => {
        const companyFields = [
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
        const companyCommentCount = companyFields.reduce(
          (count, f) => count + (profile.adminComments[f]?.length || 0),
          0,
        );
        return (
          <div
            className={`p-6 bg-neutral-900 border rounded-xl ${companyCommentCount > 0 ? "border-amber-500/30" : "border-neutral-800"}`}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-white">
                  Company Information
                </h2>
                {companyCommentCount > 0 && !isEditing && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 text-amber-400 text-xs rounded-full border border-amber-500/20">
                    <AlertCircle className="w-3 h-3" />
                    {companyCommentCount} field
                    {companyCommentCount > 1 ? "s" : ""} need
                    {companyCommentCount === 1 ? "s" : ""} attention
                  </span>
                )}
              </div>
              {editable && !isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm ${
                    // First-time onboarding partners need a clearly-
                    // visible CTA — gold on dark, "Add Details" copy.
                    // After the data exists (any later state), drop to
                    // a quiet "Edit" since the user knows the form.
                    profile.status === "ONBOARDING" ||
                    profile.status === "INVITED"
                      ? "bg-luxury-gold text-black font-semibold hover:bg-luxury-gold/90"
                      : "bg-neutral-800 text-white hover:bg-neutral-700"
                  }`}
                >
                  <Edit2 className="w-4 h-4" />
                  {profile.status === "ONBOARDING" ||
                  profile.status === "INVITED"
                    ? "Add Details"
                    : "Edit"}
                </button>
              )}
              {isEditing && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setEditData(profile.companyInfo);
                    }}
                    className="px-4 py-2 bg-neutral-800 text-gray-400 rounded-lg hover:bg-neutral-700 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveCompanyInfo}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-luxury-gold text-black rounded-lg hover:bg-luxury-gold/90 transition-colors text-sm disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              )}
            </div>

            {isEditing && editData ? (
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  { key: "companyName", label: "Company Name *" },
                  { key: "crNumber", label: "CR Number *" },
                  { key: "vatNumber", label: "VAT Number *" },
                  {
                    key: "chamberOfCommerceNumber",
                    label: "Chamber of Commerce *",
                  },
                  { key: "baladyNumber", label: "Balady Number *" },
                  { key: "contactPerson", label: "Contact Person *" },
                  { key: "contactPhone", label: "Contact Phone *" },
                  { key: "contactEmail", label: "Contact Email" },
                ].map((field) => {
                  const hasComment = getFieldComments(field.key).length > 0;
                  const isRejected = isFieldRejected(field.key);
                  const currentValue = (editData as any)[field.key] || "";
                  // Addressed means admin rejected this field AND the partner
                  // has since changed it from the snapshot baseline. We split
                  // needsUpdate from isRejected so the red visual drops the
                  // moment the partner enters a new value; the comment text
                  // (rendered by AdminCommentBadge below) stays visible.
                  const isAddressed = isFieldAddressed(field.key, currentValue);
                  const needsUpdate = isRejected && !isAddressed;
                  const isFieldLocked =
                    profile.status === "CHANGES_REQUESTED" && !hasComment;
                  return (
                    <div key={field.key}>
                      <label className="text-sm text-gray-400 mb-2 flex items-center gap-2">
                        {field.label}
                        {/* NEEDS UPDATE / ADDRESSED / Action Required —
                            mutually exclusive label badges. Addressed wins
                            over Needs Update once the partner has typed a
                            value different from the snapshot baseline. */}
                        {isAddressed ? (
                          <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] rounded font-semibold uppercase tracking-wider border border-emerald-500/40">
                            Addressed
                          </span>
                        ) : needsUpdate ? (
                          <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded font-semibold uppercase tracking-wider border border-red-500/40">
                            Needs Update
                          </span>
                        ) : hasComment ? (
                          <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded font-medium">
                            Action Required
                          </span>
                        ) : null}
                        {isFieldLocked && (
                          <span className="px-1.5 py-0.5 bg-neutral-700 text-gray-500 text-[10px] rounded font-medium">
                            Locked
                          </span>
                        )}
                      </label>
                      {/* Dispatch by field.key to a specialized input
                          from form-fields where we have one. The branches
                          all pass label="" (parent owns the label above)
                          and forward `needsUpdate || hasComment` as the
                          `error` flag so the component's border turns
                          red. Locked state disables the input as before.
                          Free-form fields (contactPerson and the
                          fallback) keep the original plain input which
                          preserves the parent's full ring/border
                          decoration including the amber hasComment ring
                          — the form-fields components support red but
                          not the in-between amber, so we fall through
                          for that visual when needed. */}
                      {(() => {
                        const v = (editData as any)[field.key] || "";
                        const setV = (val: string) => {
                          if (!isFieldLocked)
                            setEditData({ ...editData, [field.key]: val });
                        };
                        // Specialized inputs don't have an "addressed"
                        // mode — they can only render red on error or
                        // neutral otherwise. Forwarding `needsUpdate`
                        // (not `isRejected`) makes the red border drop
                        // the moment the partner makes a change; the
                        // emerald state is conveyed by the label badge
                        // above. hasComment still triggers the amber
                        // ring through the fallback path below.
                        const errorState = needsUpdate || hasComment;
                        if (field.key === "contactPhone") {
                          return (
                            <PhoneInput
                              value={v}
                              onChange={setV}
                              label=""
                              disabled={isFieldLocked}
                              error={errorState}
                            />
                          );
                        }
                        if (field.key === "contactEmail") {
                          return (
                            <EmailInput
                              value={v}
                              onChange={setV}
                              label=""
                              disabled={isFieldLocked}
                              error={errorState}
                            />
                          );
                        }
                        if (field.key === "crNumber") {
                          return (
                            <CRNumberInput
                              value={v}
                              onChange={setV}
                              label=""
                              disabled={isFieldLocked}
                              error={errorState}
                            />
                          );
                        }
                        if (field.key === "vatNumber") {
                          return (
                            <VATNumberInput
                              value={v}
                              onChange={setV}
                              label=""
                              disabled={isFieldLocked}
                              error={errorState}
                            />
                          );
                        }
                        if (field.key === "chamberOfCommerceNumber") {
                          return (
                            <ChamberNumberInput
                              value={v}
                              onChange={setV}
                              label=""
                              disabled={isFieldLocked}
                              error={errorState}
                            />
                          );
                        }
                        if (field.key === "baladyNumber") {
                          return (
                            <BaladyNumberInput
                              value={v}
                              onChange={setV}
                              label=""
                              disabled={isFieldLocked}
                              error={errorState}
                            />
                          );
                        }
                        // Fallback: free-form text (contactPerson etc.)
                        // Four-state border: emerald (addressed) → red
                        // (still needs update) → amber (plain comment) →
                        // neutral. Locked state still wins.
                        return (
                          <input
                            type="text"
                            value={v}
                            onChange={(e) => setV(e.target.value)}
                            disabled={isFieldLocked}
                            className={`w-full px-4 py-3 bg-neutral-800 rounded-lg text-white focus:outline-none transition-colors ${
                              isFieldLocked
                                ? "border border-neutral-700 opacity-50 cursor-not-allowed"
                                : isAddressed
                                  ? "border-2 border-emerald-500/60 focus:border-emerald-400"
                                  : needsUpdate
                                    ? "border-2 border-red-500/60 focus:border-red-400"
                                    : hasComment
                                      ? "border border-amber-500/50 focus:border-amber-400 ring-1 ring-amber-500/20"
                                      : "border border-neutral-700 focus:border-luxury-gold"
                            }`}
                          />
                        );
                      })()}
                      <AdminCommentBadge
                        comments={getFieldComments(field.key)}
                      />
                    </div>
                  );
                })}
                {[
                  { key: "nationalAddress", label: "National Address *" },
                  { key: "address", label: "Address *" },
                ].map((field) => {
                  const hasComment =
                    profile.adminComments[field.key]?.length > 0;
                  const isRejected = isFieldRejected(field.key);
                  const currentValue = (editData as any)[field.key] || "";
                  const isAddressed = isFieldAddressed(field.key, currentValue);
                  const needsUpdate = isRejected && !isAddressed;
                  const isFieldLocked =
                    profile.status === "CHANGES_REQUESTED" && !hasComment;
                  return (
                    <div key={field.key} className="md:col-span-2">
                      <label className="text-sm text-gray-400 mb-2 flex items-center gap-2">
                        {field.label}
                        {isAddressed ? (
                          <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] rounded font-semibold uppercase tracking-wider border border-emerald-500/40">
                            Addressed
                          </span>
                        ) : needsUpdate ? (
                          <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded font-semibold uppercase tracking-wider border border-red-500/40">
                            Needs Update
                          </span>
                        ) : hasComment ? (
                          <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded font-medium">
                            Action Required
                          </span>
                        ) : null}
                        {isFieldLocked && (
                          <span className="px-1.5 py-0.5 bg-neutral-700 text-gray-500 text-[10px] rounded font-medium">
                            Locked
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={(editData as any)[field.key] || ""}
                        onChange={(e) => {
                          if (!isFieldLocked)
                            setEditData({
                              ...editData,
                              [field.key]: e.target.value,
                            });
                        }}
                        disabled={isFieldLocked}
                        className={`w-full px-4 py-3 bg-neutral-800 rounded-lg text-white focus:outline-none transition-colors ${
                          isFieldLocked
                            ? "border border-neutral-700 opacity-50 cursor-not-allowed"
                            : isAddressed
                              ? "border-2 border-emerald-500/60 focus:border-emerald-400"
                              : needsUpdate
                                ? "border-2 border-red-500/60 focus:border-red-400"
                                : hasComment
                                  ? "border border-amber-500/50 focus:border-amber-400 ring-1 ring-amber-500/20"
                                  : "border border-neutral-700 focus:border-luxury-gold"
                        }`}
                      />
                      <AdminCommentBadge
                        comments={profile.adminComments[field.key]}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              /* READ-ONLY VIEW — now shows comment badges inline */
              <div className="space-y-0">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-4 md:col-span-2">
                    <div className="w-16 h-16 rounded-xl bg-luxury-gold/10 border border-luxury-gold/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {profile.companyInfo.logoUrl ? (
                        <img
                          src={
                            proxiedImageUrl(profile.companyInfo.logoUrl, 150) ??
                            profile.companyInfo.logoUrl
                          }
                          alt="Logo"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Building2 className="w-8 h-8 text-luxury-gold" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-semibold text-white truncate">
                        {profile.companyInfo.companyName}
                      </p>
                      <p className="text-sm text-gray-400">
                        CR: {profile.companyInfo.crNumber || "—"} · VAT:{" "}
                        {profile.companyInfo.vatNumber || "—"}
                      </p>
                      {/* Logo upload — the `handleLogoUpload` handler
                          existed in the codebase but was never wired
                          to UI. Logo edit uses a softer rule than the
                          rest of the profile: branding isn't subject
                          to admin review, so partners can change it
                          any time unless their account is SUSPENDED.
                          Backend exposes this as `canEditLogo` —
                          falls back to `editable` for older API
                          responses that don't include the field. */}
                      {(profile.canEditLogo ?? editable) && (
                        <div className="mt-2">
                          <FileUploadButton
                            label={
                              profile.companyInfo.logoUrl
                                ? "Replace logo"
                                : "Upload logo"
                            }
                            accept="image/jpeg,image/png,image/webp"
                            uploading={uploading === "logo"}
                            onFileSelect={handleLogoUpload}
                            variant={
                              profile.companyInfo.logoUrl
                                ? "replace"
                                : undefined
                            }
                          />
                          <p className="text-[10px] text-gray-600 mt-1.5">
                            JPG, PNG, WEBP • Max 2MB • Square images recommended
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  {[
                    {
                      label: "Chamber of Commerce",
                      value: profile.companyInfo.chamberOfCommerceNumber,
                      key: "chamberOfCommerceNumber",
                    },
                    {
                      label: "Balady",
                      value: profile.companyInfo.baladyNumber,
                      key: "baladyNumber",
                    },
                    {
                      label: "Contact Person",
                      value: profile.companyInfo.contactPerson,
                      key: "contactPerson",
                    },
                    {
                      label: "Contact Phone",
                      value: profile.companyInfo.contactPhone,
                      key: "contactPhone",
                    },
                    {
                      label: "Email",
                      value: profile.companyInfo.contactEmail,
                      key: "contactEmail",
                    },
                    {
                      label: "National Address",
                      value: profile.companyInfo.nationalAddress,
                      key: "nationalAddress",
                    },
                    {
                      label: "Address",
                      value: profile.companyInfo.address,
                      key: "address",
                    },
                  ].map((item) => {
                    const hasComments = getFieldComments(item.key).length > 0;
                    const needsUpdate = isFieldRejected(item.key);
                    return (
                      <div
                        key={item.key}
                        className={`p-3 rounded-lg ${
                          needsUpdate
                            ? "bg-red-500/5 border-2 border-red-500/40"
                            : hasComments
                              ? "bg-amber-500/5 border border-amber-500/20"
                              : ""
                        }`}
                      >
                        <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-2">
                          {item.label}
                          {needsUpdate && (
                            <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded font-semibold uppercase tracking-wider border border-red-500/40">
                              Needs Update
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-white">
                          {item.value || "—"}
                        </p>
                        {hasComments && (
                          <div className="mt-1.5">
                            {getFieldComments(item.key).map(
                              (c: any, i: number) => (
                                <p
                                  key={i}
                                  className="text-xs text-amber-400 flex items-start gap-1 mt-1"
                                >
                                  <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                  {c.comment}
                                </p>
                              ),
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ===== BANK DETAILS ===== */}
      {(() => {
        const bankFields = ["bankName", "bankAccountNumber", "bankIban"];
        const bankCommentCount = bankFields.reduce(
          (count, f) => count + (getFieldComments(f).length || 0),
          0,
        );
        return (
          <div
            className={`p-6 bg-neutral-900 border rounded-xl ${bankCommentCount > 0 ? "border-amber-500/30" : "border-neutral-800"}`}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-white">
                  Bank Details
                </h2>
                {bankCommentCount > 0 && !bankEditing && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 text-amber-400 text-xs rounded-full border border-amber-500/20">
                    <AlertCircle className="w-3 h-3" />
                    {bankCommentCount} field{bankCommentCount > 1 ? "s" : ""}{" "}
                    need{bankCommentCount === 1 ? "s" : ""} attention
                  </span>
                )}
              </div>
              {editable && !bankEditing && (
                <button
                  onClick={() => setBankEditing(true)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm ${
                    // Highlight for first-time onboarding (same logic
                    // as the Company Info button above).
                    (profile.status === "ONBOARDING" ||
                      profile.status === "INVITED") &&
                    !profile.bankDetails.bankName
                      ? "bg-luxury-gold text-black font-semibold hover:bg-luxury-gold/90"
                      : "bg-neutral-800 text-white hover:bg-neutral-700"
                  }`}
                >
                  <Edit2 className="w-4 h-4" />
                  {(profile.status === "ONBOARDING" ||
                    profile.status === "INVITED") &&
                  !profile.bankDetails.bankName
                    ? "Add Bank Details"
                    : "Edit"}
                </button>
              )}
              {bankEditing && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setBankEditing(false);
                      setBankData(profile.bankDetails);
                    }}
                    className="px-4 py-2 bg-neutral-800 text-gray-400 rounded-lg hover:bg-neutral-700 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveBankDetails}
                    disabled={savingBank}
                    className="flex items-center gap-2 px-4 py-2 bg-luxury-gold text-black rounded-lg hover:bg-luxury-gold/90 transition-colors text-sm disabled:opacity-50"
                  >
                    {savingBank ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {savingBank ? "Saving..." : "Save"}
                  </button>
                </div>
              )}
            </div>

            {bankEditing && bankData ? (
              <div className="grid md:grid-cols-3 gap-4">
                {[
                  { key: "bankName", label: "Bank Name *" },
                  { key: "bankAccountNumber", label: "Account Number" },
                  { key: "bankIban", label: "IBAN *" },
                ].map((field) => {
                  const hasComment = getFieldComments(field.key).length > 0;
                  const isRejected = isFieldRejected(field.key);
                  const currentValue = (bankData as any)[field.key] || "";
                  const isAddressed = isFieldAddressed(field.key, currentValue);
                  const needsUpdate = isRejected && !isAddressed;
                  const isFieldLocked =
                    profile.status === "CHANGES_REQUESTED" &&
                    profile.unresolvedCommentCount > 0 &&
                    !hasComment;
                  return (
                    <div key={field.key}>
                      <label className="text-sm text-gray-400 mb-2 flex items-center gap-2">
                        {field.label}
                        {isAddressed ? (
                          <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] rounded font-semibold uppercase tracking-wider border border-emerald-500/40">
                            Addressed
                          </span>
                        ) : needsUpdate ? (
                          <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded font-semibold uppercase tracking-wider border border-red-500/40">
                            Needs Update
                          </span>
                        ) : hasComment ? (
                          <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded font-medium">
                            Action Required
                          </span>
                        ) : null}
                        {isFieldLocked && (
                          <span className="px-1.5 py-0.5 bg-neutral-700 text-gray-500 text-[10px] rounded font-medium">
                            Locked
                          </span>
                        )}
                      </label>
                      {/* Same dispatch pattern as the company-info
                          renderer above — pick a specialized input
                          where available, fall through to a plain
                          input for anything else. */}
                      {(() => {
                        const v = (bankData as any)[field.key] || "";
                        const setV = (val: string) => {
                          if (!isFieldLocked)
                            setBankData({ ...bankData, [field.key]: val });
                        };
                        const errorState = needsUpdate || hasComment;
                        if (field.key === "bankName") {
                          return (
                            <BankSelector
                              value={v}
                              onChange={setV}
                              label=""
                              disabled={isFieldLocked}
                              error={errorState}
                            />
                          );
                        }
                        if (field.key === "bankAccountNumber") {
                          return (
                            <AccountNumberInput
                              value={v}
                              onChange={setV}
                              label=""
                              disabled={isFieldLocked}
                              error={errorState}
                            />
                          );
                        }
                        if (field.key === "bankIban") {
                          return (
                            <IBANInput
                              value={v}
                              onChange={setV}
                              label=""
                              disabled={isFieldLocked}
                              error={errorState}
                            />
                          );
                        }
                        return (
                          <input
                            type="text"
                            value={v}
                            onChange={(e) => setV(e.target.value)}
                            disabled={isFieldLocked}
                            className={`w-full px-4 py-3 bg-neutral-800 rounded-lg text-white focus:outline-none transition-colors ${
                              isFieldLocked
                                ? "border border-neutral-700 opacity-50 cursor-not-allowed"
                                : isAddressed
                                  ? "border-2 border-emerald-500/60 focus:border-emerald-400"
                                  : needsUpdate
                                    ? "border-2 border-red-500/60 focus:border-red-400"
                                    : hasComment
                                      ? "border border-amber-500/50 focus:border-amber-400 ring-1 ring-amber-500/20"
                                      : "border border-neutral-700 focus:border-luxury-gold"
                            }`}
                          />
                        );
                      })()}
                      <AdminCommentBadge
                        comments={getFieldComments(field.key)}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-4">
                {[
                  {
                    label: "Bank",
                    value: profile.bankDetails.bankName,
                    key: "bankName",
                  },
                  {
                    label: "Account",
                    value: profile.bankDetails.bankAccountNumber,
                    key: "bankAccountNumber",
                  },
                  {
                    label: "IBAN",
                    value: profile.bankDetails.bankIban,
                    key: "bankIban",
                  },
                ].map((item) => {
                  const hasComments = getFieldComments(item.key).length > 0;
                  return (
                    <div
                      key={item.key}
                      className={`p-3 rounded-lg ${hasComments ? "bg-amber-500/5 border border-amber-500/20" : ""}`}
                    >
                      <p className="text-xs text-gray-500 mb-0.5">
                        {item.label}
                      </p>
                      <p className="text-sm text-white font-mono">
                        {item.value || "—"}
                      </p>
                      {hasComments && (
                        <div className="mt-1.5">
                          {getFieldComments(item.key).map(
                            (c: any, i: number) => (
                              <p
                                key={i}
                                className="text-xs text-amber-400 flex items-start gap-1 mt-1"
                              >
                                <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                {c.comment}
                              </p>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ===== DOCUMENTS ===== */}
      {/* ===== DOCUMENTS ===== */}
      {(() => {
        const docTypes = [
          "CR",
          "VAT",
          "CHAMBER_OF_COMMERCE",
          "BALADY",
          "NATIONAL_ADDRESS",
          "IBAN_LETTER",
        ];
        const totalDocComments = docTypes.reduce(
          (count, t) => count + (getFieldComments(t).length || 0),
          0,
        );
        return (
          <div
            className={`p-6 bg-neutral-900 border rounded-xl ${totalDocComments > 0 ? "border-amber-500/30" : "border-neutral-800"}`}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Required Documents
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {profile.documents.uploadedCount} of{" "}
                  {profile.documents.requiredCount} uploaded
                </p>
              </div>
              {(() => {
                if (totalDocComments > 0) {
                  return (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                      <span className="text-xs text-amber-400 font-medium">
                        {totalDocComments} doc{totalDocComments > 1 ? "s" : ""}{" "}
                        need
                        {totalDocComments === 1 ? "s" : ""} attention
                      </span>
                    </div>
                  );
                }
                if (profile.documents.allUploaded) {
                  return (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 rounded-lg border border-green-500/20">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      <span className="text-xs text-green-400 font-medium">
                        All Complete
                      </span>
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 bg-neutral-800 rounded-full mb-6 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-luxury-gold to-luxury-gold/70 rounded-full transition-all duration-500"
                style={{
                  width: `${(profile.documents.uploadedCount / profile.documents.requiredCount) * 100}%`,
                }}
              />
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {profile.documents.items.map((doc) => {
                const docComments = getFieldComments(doc.type);
                const hasDocComment = docComments.length > 0;
                const isRejected = isFieldRejected(doc.type);
                // Addressed when admin rejected this doc AND the
                // partner has uploaded a replacement file (fileUrl
                // differs from snapshot baseline). Same rule as the
                // vendor side — keeps the visual story consistent.
                const isAddressed = isFieldAddressed(doc.type, doc.filePath);
                const needsUpdate = isRejected && !isAddressed;
                return (
                  <div
                    key={doc.type}
                    className={`p-4 rounded-xl transition-all duration-200 ${
                      isAddressed
                        ? "bg-emerald-500/5 border-2 border-emerald-500/60"
                        : needsUpdate
                          ? "bg-red-500/5 border-2 border-red-500/60"
                          : hasDocComment
                            ? "border border-amber-500/30 bg-amber-500/5"
                            : doc.isUploaded
                              ? "bg-green-500/5 border border-green-500/20 hover:border-green-500/40"
                              : "bg-neutral-800/30 border border-neutral-700 border-dashed hover:border-neutral-600"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 mb-3 flex-wrap">
                      {(() => {
                        const docIcon = DOC_ICONS[doc.type];
                        if (!docIcon)
                          return <FileText className="w-4 h-4 text-gray-400" />;
                        const Icon = docIcon.icon;
                        return (
                          <div
                            className={`w-7 h-7 rounded-md flex items-center justify-center ${docIcon.color}`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                        );
                      })()}
                      <span className="text-sm text-white font-medium flex-1 flex items-center gap-2 flex-wrap">
                        {doc.label}
                        {/* NEEDS UPDATE / ADDRESSED — mutually exclusive.
                            Mirrors the input + MOU + vendor-side pattern. */}
                        {needsUpdate && (
                          <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded font-semibold uppercase tracking-wider border border-red-500/40">
                            Needs Update
                          </span>
                        )}
                        {isAddressed && (
                          <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] rounded font-semibold uppercase tracking-wider border border-emerald-500/40">
                            Addressed
                          </span>
                        )}
                      </span>
                      {hasDocComment ? (
                        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      ) : doc.isUploaded ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-neutral-600 flex-shrink-0" />
                      )}
                    </div>

                    {doc.isUploaded ? (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-400 truncate">
                          {doc.fileName || "Document uploaded"}
                        </p>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="w-3 h-3" />
                          {formatDate(doc.uploadedAt)}
                        </div>
                        {doc.expiryDate &&
                          (() => {
                            const info = expiryUrgency(doc.expiryDate);
                            // Past 30 days = no chip; show plain calendar date
                            if (!info) {
                              return (
                                <p className="text-xs text-gray-400">
                                  Expires: {formatDate(doc.expiryDate)}
                                </p>
                              );
                            }
                            const colors = bannerColors[info.urgency];
                            return (
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-xs text-gray-400">
                                  Expires: {formatDate(doc.expiryDate)}
                                </p>
                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border ${colors.bg} ${colors.border} ${colors.text}`}
                                >
                                  <Clock className="w-2.5 h-2.5" />
                                  {info.days < 0
                                    ? `Expired ${Math.abs(info.days)}d ago`
                                    : info.days === 0
                                      ? "Expires today"
                                      : `${info.days}d left`}
                                </span>
                              </div>
                            );
                          })()}
                        <div className="flex items-center gap-3 pt-2 border-t border-neutral-800/50">
                          {doc.fileUrl && (
                            <button
                              onClick={() =>
                                handleViewDocument(
                                  doc.fileUrl!,
                                  doc.fileName || undefined,
                                  doc.label,
                                )
                              }
                              disabled={viewingDoc === doc.fileUrl}
                              className="text-xs text-luxury-gold hover:underline flex items-center gap-1 disabled:opacity-50"
                            >
                              {viewingDoc === doc.fileUrl ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Eye className="w-3 h-3" />
                              )}
                              View
                            </button>
                          )}
                          {editable &&
                            (() => {
                              const docLocked =
                                profile.status === "CHANGES_REQUESTED" &&
                                profile.unresolvedCommentCount > 0 &&
                                !hasDocComment;
                              if (docLocked) return null;
                              return (
                                <FileUploadButton
                                  label="Replace"
                                  accept="application/pdf,image/jpeg,image/png"
                                  uploading={uploading === doc.type}
                                  onFileSelect={(file) =>
                                    handleDocumentUpload(
                                      file,
                                      doc.type,
                                      doc.requiresExpiry,
                                    )
                                  }
                                  variant="replace"
                                />
                              );
                            })()}
                        </div>
                      </div>
                    ) : editable ? (
                      <div className="mt-1">
                        <FileUploadButton
                          label="Upload"
                          accept="application/pdf,image/jpeg,image/png"
                          uploading={uploading === doc.type}
                          onFileSelect={(file) =>
                            handleDocumentUpload(
                              file,
                              doc.type,
                              doc.requiresExpiry,
                            )
                          }
                        />
                        <p className="text-[10px] text-gray-600 mt-2">
                          PDF, JPG, PNG • Max 10MB
                          {doc.requiresExpiry && <> • Expiry date required</>}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 mt-1 italic">
                        Not uploaded
                      </p>
                    )}

                    {/* Pending upload — file picked + expiry-date input + Save.
                        Only renders for docs in DOCS_WITH_EXPIRY (CR/Chamber/
                        Balady) when the user has selected a file but hasn't
                        provided the expiry date yet. Mirrors the MOU save flow
                        so both upload patterns feel consistent. */}
                    {pendingDocUploads[doc.type] && (
                      <div className="mt-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/30 space-y-2">
                        <p className="text-xs text-amber-400 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          {pendingDocUploads[doc.type].file.name} — set expiry
                          date and save
                        </p>
                        {/* Stack vertically, always. Previously this row
                            tried to switch to inline at the `sm:` viewport
                            breakpoint (640px), but the doc card itself
                            stays narrow in a multi-column grid, so the
                            inline layout fired even when the card had no
                            room for it — collapsing the date input to
                            ~70px wide and hiding most of "dd/mm/yyyy".
                            A clean vertical stack reads correctly at every
                            width and gives the date picker the room it
                            needs. */}
                        <input
                          type="date"
                          value={pendingDocUploads[doc.type].expiryDate}
                          min={new Date().toISOString().split("T")[0]}
                          onChange={(e) =>
                            setPendingDocUploads((prev) => ({
                              ...prev,
                              [doc.type]: {
                                ...prev[doc.type],
                                expiryDate: e.target.value,
                              },
                            }))
                          }
                          className="w-full px-2 py-1.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-white focus:border-luxury-gold focus:outline-none"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSavePendingDoc(doc.type)}
                            disabled={
                              pendingDocUploads[doc.type].saving ||
                              !pendingDocUploads[doc.type].expiryDate
                            }
                            className="flex-1 justify-center px-3 py-1.5 text-xs bg-luxury-gold text-black font-medium rounded hover:bg-luxury-gold/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                          >
                            {pendingDocUploads[doc.type].saving ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Save className="w-3.5 h-3.5" />
                            )}
                            Save
                          </button>
                          <button
                            onClick={() => handleCancelPendingDoc(doc.type)}
                            disabled={pendingDocUploads[doc.type].saving}
                            className="flex-1 justify-center px-3 py-1.5 text-xs bg-neutral-800 text-gray-400 rounded hover:bg-neutral-700 disabled:opacity-50 flex items-center"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    <AdminCommentBadge comments={docComments} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ===== MOU ===== */}
      {(() => {
        const mouComments = getFieldComments("mou");
        const hasMouComments = mouComments.length > 0;
        const mouRejected = isFieldRejected("mou");
        // Addressed when admin rejected MOU AND partner has uploaded
        // a replacement file (fileUrl differs from snapshot baseline).
        // Snapshot writer has used both "mou" and "MOU" keys in this
        // codebase — try both. Same approach as the vendor side.
        const mouAddressed = isFieldAddressed("mou", profile.mou.filePath);
        const mouNeedsUpdate = mouRejected && !mouAddressed;
        const mouLocked =
          profile.status === "CHANGES_REQUESTED" &&
          profile.unresolvedCommentCount > 0 &&
          !hasMouComments;
        return (
          <div
            className={`p-6 bg-neutral-900 rounded-xl ${
              mouAddressed
                ? "border-2 border-emerald-500/60"
                : mouNeedsUpdate
                  ? "border-2 border-red-500/60"
                  : hasMouComments
                    ? "border border-amber-500/30"
                    : "border border-neutral-800"
            }`}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2 flex-wrap">
                Memorandum of Understanding (MOU)
                {/* NEEDS UPDATE / ADDRESSED — mutually exclusive, mirrors
                    the input + doc field pattern. */}
                {mouNeedsUpdate && (
                  <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded font-semibold uppercase tracking-wider border border-red-500/40">
                    Needs Update
                  </span>
                )}
                {mouAddressed && (
                  <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] rounded font-semibold uppercase tracking-wider border border-emerald-500/40">
                    Addressed
                  </span>
                )}
              </h2>
              {hasMouComments && !mouNeedsUpdate && !mouAddressed && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <span className="text-xs text-amber-400 font-medium">
                    Needs attention
                  </span>
                </span>
              )}
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                {profile.mou.fileUrl || mouFilePath ? (
                  <div
                    className={`p-4 rounded-xl space-y-3 ${
                      mouAddressed
                        ? "bg-emerald-500/5 border-2 border-emerald-500/60"
                        : mouNeedsUpdate
                          ? "bg-red-500/5 border-2 border-red-500/60"
                          : hasMouComments
                            ? "bg-amber-500/5 border border-amber-500/20"
                            : "bg-green-500/5 border border-green-500/20"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {hasMouComments ? (
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      )}
                      <span
                        className={`text-sm font-medium ${hasMouComments ? "text-amber-400" : "text-green-400"}`}
                      >
                        {mouFilePath
                          ? "New MOU uploaded — set expiry and save"
                          : hasMouComments
                            ? "MOU requires update"
                            : "MOU Uploaded"}
                      </span>
                    </div>
                    {profile.mou.expiryDate &&
                      !mouFilePath &&
                      (() => {
                        const info = expiryUrgency(profile.mou.expiryDate);
                        if (!info) {
                          return (
                            <p className="text-sm text-gray-400">
                              Expires: {formatDate(profile.mou.expiryDate)}
                            </p>
                          );
                        }
                        const colors = bannerColors[info.urgency];
                        return (
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm text-gray-400">
                              Expires: {formatDate(profile.mou.expiryDate)}
                            </p>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border ${colors.bg} ${colors.border} ${colors.text}`}
                            >
                              <Clock className="w-3 h-3" />
                              {info.days < 0
                                ? `Expired ${Math.abs(info.days)}d ago`
                                : info.days === 0
                                  ? "Expires today"
                                  : `${info.days}d left`}
                            </span>
                          </div>
                        );
                      })()}
                    {profile.mou.fileUrl && (
                      <button
                        onClick={() =>
                          handleViewDocument(
                            profile.mou.fileUrl!,
                            undefined,
                            "Memorandum of Understanding",
                          )
                        }
                        className="text-sm text-luxury-gold hover:underline flex items-center gap-1"
                      >
                        <FileText className="w-4 h-4" /> View MOU
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-neutral-800/30 border border-neutral-700 border-dashed rounded-xl text-center">
                    <FileUp className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No MOU uploaded yet</p>
                    <p className="text-xs text-gray-600 mt-1">
                      PDF, JPG, PNG • Max 10MB
                    </p>
                  </div>
                )}

                {editable && !mouLocked && (
                  <div className="space-y-3">
                    <FileUploadButton
                      label={
                        profile.mou.fileUrl || mouFilePath
                          ? "Replace MOU"
                          : "Upload MOU"
                      }
                      accept="application/pdf,image/jpeg,image/png"
                      uploading={uploading === "mou"}
                      onFileSelect={handleMouFileSelect}
                    />
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        MOU Expiry Date *
                      </label>
                      <input
                        type="date"
                        value={mouExpiry}
                        onChange={(e) => setMouExpiry(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:border-luxury-gold focus:outline-none transition-colors"
                      />
                    </div>
                    <button
                      onClick={handleSaveMou}
                      disabled={
                        savingMou ||
                        (!mouFilePath && !profile.mou.fileUrl) ||
                        !mouExpiry
                      }
                      className="flex items-center gap-2 px-4 py-2 bg-luxury-gold text-black rounded-lg hover:bg-luxury-gold/90 text-sm disabled:opacity-50 transition-colors"
                    >
                      {savingMou ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      {savingMou ? "Saving..." : "Save MOU"}
                    </button>
                  </div>
                )}
                {editable && mouLocked && (
                  <p className="text-xs text-gray-500 italic">
                    MOU editing is locked — no changes requested for this
                    section
                  </p>
                )}
                <AdminCommentBadge comments={mouComments} />
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== SUBMIT FOR REVIEW ===== */}
      {editable && (
        <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-luxury-gold/10 flex items-center justify-center flex-shrink-0">
              <Send className="w-6 h-6 text-luxury-gold" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-1">
                Submit for Review
              </h3>
              <p className="text-sm text-gray-400 mb-4">
                Ensure all {profile.documents.requiredCount} documents are
                uploaded, bank details are complete, and MOU is attached.
              </p>
              {profile.documents.missingDocuments.length > 0 && (
                <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <p className="text-xs text-amber-400 font-medium mb-1">
                    Missing:
                  </p>
                  <p className="text-xs text-amber-400/70">
                    {profile.documents.missingDocuments.join(", ")}
                  </p>
                </div>
              )}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-3 bg-luxury-gold text-black font-medium rounded-lg hover:bg-luxury-gold/90 disabled:opacity-50 transition-colors"
              >
                {submitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
                {submitting ? "Submitting..." : "Submit Profile for Review"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== TEAM MEMBERS =====
          Coming Soon placeholder. The team-member feature is partially
          built on the partner side (invite, role-change, deactivate
          actions all exist), but the rollout isn't finalised, and the
          live list was confusing partners who don't have real
          colleagues to manage yet. Kept the card shell so the page
          rhythm stays stable when the feature ships — swap the body
          back in and remove the placeholder. */}
      <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Team Members</h2>
              <p className="text-xs text-gray-500">
                Manage colleagues with access to this partner account
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase rounded-full bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/20 whitespace-nowrap">
            Coming Soon
          </span>
        </div>

        <div className="border border-dashed border-neutral-700 rounded-xl py-12 px-6 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center mb-4">
            <Clock className="w-6 h-6 text-gray-400" />
          </div>
          <h4 className="text-white font-medium mb-1">
            Team management is on the way
          </h4>
          <p className="text-sm text-gray-500 max-w-md">
            We&apos;re building invite flows, role-based access, and activity
            tracking so you can onboard colleagues to your partner account. This
            section will activate once the feature ships.
          </p>
        </div>
      </div>

      {/* ===== ADD TEAM MEMBER MODAL ===== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowAddModal(false)}
          />
          <div className="relative w-full max-w-lg mx-4 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold text-lg">
                  Add Team Member
                </h3>
                <p className="text-sm text-gray-400">Invite a new member</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 hover:bg-neutral-800 rounded"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleAddMember} className="p-5 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={addForm.name}
                  onChange={(e) =>
                    setAddForm((p) => ({ ...p, name: e.target.value }))
                  }
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:border-luxury-gold focus:outline-none"
                  placeholder="Enter full name"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Email *
                </label>
                {/* Use the shared EmailInput so format validation is
                    consistent with the rest of the portal. Raw
                    <input type="email"> only triggers the browser's
                    native validator and doesn't share styling. */}
                <EmailInput
                  value={addForm.email}
                  onChange={(email) => setAddForm((p) => ({ ...p, email }))}
                  label=""
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Phone
                </label>
                {/* PhoneInput handles country code + libphonenumber
                    validation. Same component used everywhere else
                    (vendor profile, partner profile, inline driver
                    edit). */}
                <PhoneInput
                  value={addForm.phone}
                  onChange={(phone) => setAddForm((p) => ({ ...p, phone }))}
                  label=""
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Role *
                </label>
                <select
                  value={addForm.role}
                  onChange={(e) =>
                    setAddForm((p) => ({ ...p, role: e.target.value }))
                  }
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:border-luxury-gold focus:outline-none"
                >
                  {roles.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label} — {r.description}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-3 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingMember}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-luxury-gold text-black font-semibold rounded-lg hover:bg-luxury-gold/90 disabled:opacity-50 transition-colors"
                >
                  {addingMember ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {addingMember ? "Sending..." : "Send Invitation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ===== CHANGE REQUEST MODAL ===== */}
      {showChangeRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowChangeRequestModal(false)}
          />
          <div className="relative w-full max-w-lg mx-4 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold text-lg">
                  Request Profile Changes
                </h3>
                <p className="text-sm text-gray-400">
                  Select fields you need to update and provide a reason
                </p>
              </div>
              <button
                onClick={() => setShowChangeRequestModal(false)}
                className="p-1 hover:bg-neutral-800 rounded"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              {/* Field selection */}
              <div>
                <label className="block text-sm text-gray-400 mb-3">
                  Which fields do you need to update? *
                </label>
                <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                  {[
                    {
                      section: "Company Information",
                      icon: Building2,
                      fields: [
                        { key: "companyName", label: "Company Name" },
                        { key: "crNumber", label: "CR Number" },
                        { key: "vatNumber", label: "VAT Number" },
                        {
                          key: "chamberOfCommerceNumber",
                          label: "Chamber of Commerce",
                        },
                        { key: "baladyNumber", label: "Balady Number" },
                        { key: "nationalAddress", label: "National Address" },
                        { key: "contactPerson", label: "Contact Person" },
                        { key: "contactPhone", label: "Contact Phone" },
                        { key: "contactEmail", label: "Contact Email" },
                        { key: "address", label: "Address" },
                        { key: "logo", label: "Company Logo" },
                      ],
                    },
                    {
                      section: "Bank Details",
                      icon: Landmark,
                      fields: [
                        { key: "bankName", label: "Bank Name" },
                        { key: "bankAccountNumber", label: "Account Number" },
                        { key: "bankIban", label: "IBAN" },
                      ],
                    },
                    {
                      section: "Required Documents",
                      icon: FileText,
                      fields: [
                        { key: "CR", label: "Commercial Registration" },
                        { key: "VAT", label: "VAT Certificate" },
                        {
                          key: "CHAMBER_OF_COMMERCE",
                          label: "Chamber of Commerce",
                        },
                        { key: "BALADY", label: "Balady License" },
                        { key: "NATIONAL_ADDRESS", label: "National Address" },
                        { key: "IBAN_LETTER", label: "IBAN Letter" },
                      ],
                    },
                    {
                      section: "MOU",
                      icon: ScrollText,
                      fields: [
                        { key: "mou", label: "MOU Document" },
                        { key: "mouExpiry", label: "MOU Expiry Date" },
                      ],
                    },
                  ].map((group) => {
                    const Icon = group.icon;
                    const selectedInGroup = group.fields.filter((f) =>
                      changeRequestFields.includes(f.key),
                    ).length;
                    const allSelected = selectedInGroup === group.fields.length;
                    return (
                      <div
                        key={group.section}
                        className="border border-neutral-800 rounded-xl overflow-hidden"
                      >
                        {/* Section header — click to select/deselect all */}
                        <button
                          type="button"
                          onClick={() => {
                            const groupKeys = group.fields.map((f) => f.key);
                            if (allSelected) {
                              setChangeRequestFields((prev) =>
                                prev.filter((k) => !groupKeys.includes(k)),
                              );
                            } else {
                              setChangeRequestFields((prev) => [
                                ...prev.filter((k) => !groupKeys.includes(k)),
                                ...groupKeys,
                              ]);
                            }
                          }}
                          className="w-full flex items-center justify-between p-3 bg-neutral-800/50 hover:bg-neutral-800 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <Icon className="w-3.5 h-3.5 text-gray-500" />
                            <span className="text-xs font-medium text-gray-300">
                              {group.section}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {selectedInGroup > 0 && (
                              <span className="px-1.5 py-0.5 bg-luxury-gold/20 text-luxury-gold text-[10px] rounded font-medium">
                                {selectedInGroup}/{group.fields.length}
                              </span>
                            )}
                            <div
                              className={`w-4 h-4 rounded border flex items-center justify-center ${
                                allSelected
                                  ? "bg-luxury-gold border-luxury-gold"
                                  : selectedInGroup > 0
                                    ? "bg-luxury-gold/30 border-luxury-gold/50"
                                    : "border-neutral-600"
                              }`}
                            >
                              {allSelected && (
                                <CheckCircle2 className="w-3 h-3 text-black" />
                              )}
                              {selectedInGroup > 0 && !allSelected && (
                                <div className="w-1.5 h-1.5 bg-luxury-gold rounded-sm" />
                              )}
                            </div>
                          </div>
                        </button>
                        {/* Individual fields */}
                        <div className="flex flex-wrap gap-1.5 p-2.5 bg-neutral-900/50">
                          {group.fields.map((field) => {
                            const isSelected = changeRequestFields.includes(
                              field.key,
                            );
                            return (
                              <button
                                key={field.key}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    setChangeRequestFields((prev) =>
                                      prev.filter((f) => f !== field.key),
                                    );
                                  } else {
                                    setChangeRequestFields((prev) => [
                                      ...prev,
                                      field.key,
                                    ]);
                                  }
                                }}
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] border transition-all ${
                                  isSelected
                                    ? "bg-luxury-gold/15 border-luxury-gold/40 text-luxury-gold font-medium"
                                    : "bg-neutral-800/50 border-neutral-700/50 text-gray-500 hover:text-gray-300 hover:border-neutral-600"
                                }`}
                              >
                                {field.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {changeRequestFields.length > 0 && (
                  <p className="text-xs text-luxury-gold mt-3">
                    {changeRequestFields.length} field(s) selected
                  </p>
                )}
              </div>

              {/* Reason */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Reason for changes *
                </label>
                <textarea
                  value={changeRequestReason}
                  onChange={(e) => setChangeRequestReason(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:border-luxury-gold focus:outline-none resize-none transition-colors"
                  placeholder="e.g. Company name changed after merger, need to update CR certificate with new registration..."
                />
              </div>

              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-xs text-blue-400">
                  Your request will be reviewed by the admin team. Once
                  approved, the selected fields will become editable and your
                  profile status will temporarily change to allow updates.
                </p>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-neutral-800">
              <button
                onClick={() => setShowChangeRequestModal(false)}
                className="flex-1 px-4 py-3 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitChangeRequest}
                disabled={
                  submittingChangeRequest ||
                  changeRequestFields.length === 0 ||
                  !changeRequestReason.trim()
                }
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-luxury-gold text-black font-semibold rounded-lg hover:bg-luxury-gold/90 disabled:opacity-50 transition-colors"
              >
                {submittingChangeRequest ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {submittingChangeRequest ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ===== IMAGE CROPPER MODAL =====
          Both logo and document uploads use free-aspect cropping —
          partners shouldn't be forced into a square (1:1) or 4:3
          frame for content where the original ratio matters. A 16:9
          banner-style logo or an A4 portrait scan needs to fit fully.
          Shape is always rect; round-shape only made sense back when
          the logo was locked to 1:1. The "Use Full Image" button in
          the cropper lets users upload as-is without dragging. */}
      {cropperImage && (
        <ImageCropper
          imageSrc={cropperImage}
          onCropComplete={handleCropComplete}
          onCancel={() => setCropperImage(null)}
          title={
            cropperCategory === "logo"
              ? "Upload Company Logo"
              : "Upload Document Image"
          }
          saving={uploading !== null}
        />
      )}
      {/* ===== DOCUMENT VIEWER ===== */}
      {viewerUrl && (
        <DocumentViewer
          url={viewerUrl}
          fileName={viewerFileName}
          title={viewerTitle}
          onClose={() => {
            setViewerUrl(null);
            setViewerFileName(undefined);
            setViewerTitle(undefined);
          }}
        />
      )}
    </div>
  );
}
