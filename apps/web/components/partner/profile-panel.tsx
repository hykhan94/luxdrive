"use client";

// ============================================
// components/partner/profile/profile-panel.tsx
// Partner Portal — Company Profile & Team
// With GCS signed URL file upload for documents, MOU, logo
// ============================================

import { useState, useEffect, useCallback, useRef } from "react";
import { partnerApi, uploadApi } from "@/lib/api";
import { useNotification } from "@/lib/notification-context";
import { PhoneInput, EmailInput } from "@/components/ui/form-fields";
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

import DocumentViewer from "@/components/ui/document-viewer";

import { proxiedImageUrl } from "@/lib/image-url";
import { PARTNER_PROFILE_FIELDS } from "@/lib/partner-profile-fields";
import { useFieldAutosave } from "@/hooks/use-field-autosave";
import { RejectionProgressProvider } from "@/components/partner/profile/rejection-progress-context";
import { UnsavedChangesGuard } from "@/components/partner/profile/unsaved-changes-guard";
import { PartnerProfileFields } from "@/components/partner/profile/partner-profile-fields";
import { PartnerProfileDocuments } from "@/components/partner/profile/partner-profile-documents";
import { PartnerSubmitBar } from "@/components/partner/profile/partner-submit-bar";
import { RejectionBanner } from "@/components/partner/profile/rejection-banner";
import { groupProgress } from "@/lib/profile-fields";
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

// ============== MAIN COMPONENT ==============

interface ProfilePanelProps {
  refreshBadges: () => void;
  isApproved: boolean;
  /** Current sidebar state — used to inset the sticky submit bar. */
  sidebarOpen?: boolean;
}

export default function ProfilePanel({
  refreshBadges,
  isApproved,
  sidebarOpen = true,
}: ProfilePanelProps) {
  const { showNotification } = useNotification();

  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editData, setEditData] = useState<
    CompanyProfile["companyInfo"] | null
  >(null);
  const [saving, setSaving] = useState(false);

  // Bank details
  const [bankData, setBankData] = useState<
    CompanyProfile["bankDetails"] | null
  >(null);

  // MOU
  const [mouExpiry, setMouExpiry] = useState("");

  // Pending uploads for docs that require an expiry date (CR / CHAMBER /
  // BALADY). Each entry stores: the picked file (or cropped blob result),
  // the user-entered expiry date, and whether we're currently saving. The
  // doc card renders a date input + Save button while a file is pending;
  // we only call the upload API once both are present.
  // Keyed by doc type (e.g. "CR" → { file, expiryDate, saving }).

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
  const [cropperDocType, setCropperDocType] = useState<string | null>(null);
  // Whether the doc being cropped requires an expiry date. Threads the
  // requiresExpiry flag from the doc card through the crop step so
  // handleCropComplete knows to push the result into pending state vs upload
  // it directly.

  // Document viewer
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerFileName, setViewerFileName] = useState<string | undefined>(
    undefined,
  );
  const [viewerTitle, setViewerTitle] = useState<string | undefined>(undefined);

  // ---- Field-level autosave (company + bank) ----
  const saveField = useCallback(
    async (group: string, body: Record<string, unknown>) => {
      const res =
        group === "bank"
          ? await partnerApi.updateBankDetails(body)
          : await partnerApi.updateCompanyInfo(body);
      return (res.data ?? undefined) as Record<string, unknown> | undefined;
    },
    [],
  );

  const autosave = useFieldAutosave({
    fields: PARTNER_PROFILE_FIELDS,
    initialValues: {},
    save: saveField,
    enabled: profile?.isEditable ?? false,
  });

  // Seed / re-seed the autosave working copy from the loaded profile — on
  // first load and whenever the status changes (e.g. a new review cycle).
  const { setValues: seedAutosave } = autosave;
  const lastSyncedStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (profile && profile.status !== lastSyncedStatusRef.current) {
      seedAutosave({ ...profile.companyInfo, ...profile.bankDetails });
      lastSyncedStatusRef.current = profile.status;
    }
  }, [profile, seedAutosave]);

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

  // If ALL of the partner's outstanding review comments are from an approved
  // self-service change request, show a friendlier status than the generic
  // "Changes Requested by Admin" copy. Backend now ships a `type` field per
  // comment (Step 3+); fall back to the legacy prefix for pre-refactor rows.
  const commentValues = Object.values(profile.adminComments ?? {})
    .flat()
    .filter(Boolean);
  const allCommentsArePartnerRequests =
    commentValues.length > 0 &&
    commentValues.every((c: any) => {
      if (c?.type === "PARTNER_REQUEST") return true;
      if (c?.type) return false; // typed but not PARTNER_REQUEST
      return c?.comment?.startsWith("Change requested by partner:");
    });
  const statusInfo =
    profile.status === "CHANGES_REQUESTED" && allCommentsArePartnerRequests
      ? {
          label: "Editing enabled at your request",
          color: "text-sky-400",
          bgColor: "bg-sky-500/10 border-sky-500/30",
          icon: STATUS_DISPLAY.CHANGES_REQUESTED.icon,
        }
      : STATUS_DISPLAY[profile.status] || STATUS_DISPLAY.INVITED;
  const StatusIcon = statusInfo.icon;
  const editable = profile.isEditable;

  // ---- onboarding progress (Mode 1 chips + submit gate) ----
  const companyProg = groupProgress(
    PARTNER_PROFILE_FIELDS,
    "company",
    autosave.values,
  );
  const bankProg = groupProgress(
    PARTNER_PROFILE_FIELDS,
    "bank",
    autosave.values,
  );
  const docsUploaded = profile.documents.items.filter(
    (d) => d.isUploaded,
  ).length;
  const allDocsUploaded = profile.documents.items.every((d) => d.isUploaded);
  const mouComplete = !!profile.mou.fileUrl && !!profile.mou.expiryDate;
  const onboardingSections = [
    { label: "Company", filled: companyProg.filled, total: companyProg.total },
    { label: "Bank", filled: bankProg.filled, total: bankProg.total },
    {
      label: "Docs",
      filled: docsUploaded,
      total: profile.documents.items.length,
    },
    { label: "MOU", filled: mouComplete ? 1 : 0, total: 1 },
  ];
  const requiredFieldsFilled = PARTNER_PROFILE_FIELDS.filter(
    (f) => f.required,
  ).every((f) => String(autosave.values[f.key] ?? "").trim() !== "");
  const onboardingComplete =
    requiredFieldsFilled && allDocsUploaded && mouComplete;

  // Bar visibility: visible whenever the partner has something to submit —
  // that's every editable state (INVITED / PENDING_REVIEW / CHANGES_REQUESTED),
  // including the "profile now complete, waiting for the user to hit Submit"
  // moment. Post-submit the backend clears `isEditable`, so the bar hides
  // naturally without an extra guard. Not visible in APPROVED (read-only) or
  // SUSPENDED.
  const hasPendingWork = editable;

  // Map profile field keys to possible admin comment keys (backend may use UPPERCASE doc-style keys)
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
  // MOU expiry is intentionally not tracked separately — it lives on the
  // uploaded PDF, so requesting to change the MOU document covers both.
  const allAffectedFieldKeys: string[] = [];
  for (const doc of profile.documents.items) {
    if (!doc.isUploaded || !doc.expiryDate) continue;
    const info = expiryUrgency(doc.expiryDate);
    if (info) allAffectedFieldKeys.push(doc.type);
  }
  if (profile.mou.expiryDate) {
    const info = expiryUrgency(profile.mou.expiryDate);
    if (info) allAffectedFieldKeys.push("mou");
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
  // Only surface rejection-progress state during CHANGES_REQUESTED. In
  // PENDING_REVIEW / APPROVED / SUSPENDED there's nothing the partner can act
  // on, so we pass an empty adminComments map — provider goes inactive,
  // rejection banner + per-field amber banners disappear. The underlying
  // ADMIN_REJECTION rows on the DB stay live (unresolved), preserving the
  // admin's outstanding-complaints signal for the re-review.
  const providerAdminComments =
    profile.status === "CHANGES_REQUESTED" ? profile.adminComments : {};
  return (
    <RejectionProgressProvider
      adminComments={providerAdminComments}
      profileSnapshot={profile.profileSnapshot}
      values={autosave.values}
      fields={PARTNER_PROFILE_FIELDS}
      documents={profile.documents.items}
      mouUploadedAt={profile.mou.uploadedAt}
    >
      <div className="relative space-y-6 w-full pb-32">
        {/* Status Banner — CHANGES_REQUESTED / rejection state is now driven by
          RejectionBanner (rendered from PartnerProfileFields' provider
          context). We keep this legacy banner ONLY for non-rejection status
          states (APPROVED, SUSPENDED, etc.) where the "N items need your
          attention" subtitle would be misleading. */}
        {profile.status !== "CHANGES_REQUESTED" && (
          <div
            className={`p-4 rounded-xl border ${statusInfo.bgColor} flex items-center gap-3`}
          >
            <StatusIcon
              className={`w-5 h-5 flex-shrink-0 ${statusInfo.color}`}
            />
            <div className="flex-1">
              <p className={`text-sm font-medium ${statusInfo.color}`}>
                {statusInfo.label}
              </p>
            </div>
            {profile.status === "APPROVED" && (
              <span className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-medium rounded-full border border-green-500/30">
                Verified
              </span>
            )}
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
            const expired = expiringItems.filter(
              (i) => i.urgency === "expired",
            );
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

        {/* ===== REVIEW BANNER ===== */}
        <RejectionBanner />
        {/* ===== COMPANY + BANK (autosave) ===== */}
        <PartnerProfileFields
          profileId={profile.id}
          status={profile.status}
          editable={editable}
          logoUrl={profile.companyInfo.logoUrl}
          autosave={autosave}
          onLogoUploaded={(logoUrl) =>
            setProfile((p) =>
              p ? { ...p, companyInfo: { ...p.companyInfo, logoUrl } } : p,
            )
          }
        />
        {/* ===== DOCUMENTS + MOU (cards) ===== */}
        <PartnerProfileDocuments
          profileId={profile.id}
          editable={editable}
          status={profile.status}
          documents={profile.documents.items}
          mou={profile.mou}
          onDocumentUploaded={(doc) =>
            setProfile((prev) =>
              prev
                ? {
                    ...prev,
                    documents: {
                      ...prev.documents,
                      items: prev.documents.items.map((d) =>
                        d.type === doc.type ? doc : d,
                      ),
                    },
                  }
                : prev,
            )
          }
          onMouUploaded={(mou) =>
            setProfile((prev) =>
              prev ? { ...prev, mou: { ...prev.mou, ...mou } } : prev,
            )
          }
          onView={(doc) =>
            handleViewDocument(
              doc.fileUrl ?? "",
              doc.fileName ?? undefined,
              doc.label,
            )
          }
        />
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
                <h2 className="text-xl font-semibold text-white">
                  Team Members
                </h2>
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
              tracking so you can onboard colleagues to your partner account.
              This section will activate once the feature ships.
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
                          {
                            key: "NATIONAL_ADDRESS",
                            label: "National Address",
                          },
                          { key: "IBAN_LETTER", label: "IBAN Letter" },
                        ],
                      },
                      {
                        section: "MOU",
                        icon: ScrollText,
                        fields: [
                          // MOU expiry is derived from whichever PDF the partner
                          // uploads — you can't change one without the other.
                          // We expose only the document; if it's replaced, the
                          // partner picks a new expiry as part of that upload.
                          { key: "mou", label: "MOU Document" },
                        ],
                      },
                    ].map((group) => {
                      const Icon = group.icon;
                      const selectedInGroup = group.fields.filter((f) =>
                        changeRequestFields.includes(f.key),
                      ).length;
                      const allSelected =
                        selectedInGroup === group.fields.length;
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
        {/* ===== SUBMIT BAR ===== */}
        <PartnerSubmitBar
          visible={hasPendingWork}
          sections={onboardingSections}
          onboardingComplete={onboardingComplete}
          submitting={submitting}
          onSubmit={handleSubmit}
          sidebarInset={sidebarOpen ? "open" : "collapsed"}
        />
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
      <UnsavedChangesGuard when={autosave.isSaving} />
    </RejectionProgressProvider>
  );
}
