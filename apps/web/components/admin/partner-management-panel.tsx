"use client";

import { useState, useEffect, useCallback } from "react";
import { adminApi, ApiError } from "@/lib/api";
import {
  Briefcase,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  Eye,
  CheckCircle2,
  Clock,
  XCircle,
  Users,
  CalendarDays,
  Mail,
  Send,
  MessageSquare,
  AlertTriangle,
  FileText,
  ChevronDown,
  Shield,
  Upload,
  Download,
  ZoomIn,
  ExternalLink,
  Edit2,
  RefreshCw,
  Ban,
} from "lucide-react";
import { useNotification } from "@/lib/notification-context";
import DocumentViewer from "@/components/ui/document-viewer";
import { proxiedImageUrl } from "@/lib/image-url";

interface Partner {
  id: string;
  companyName: string;
  email: string | null;
  contact: { name: string | null; phone: string | null; email: string | null };
  crNumber: string | null;
  vatNumber: string | null;
  status: string;
  bookings: { active: number; total: number };
  creditLimit: number | null;
  currentBalance: number | null;
  createdAt: string;
  invitationSentAt: string | null;
  profileSubmittedAt: string | null;
  /** Signed read URL from backend (or null when the partner hasn't uploaded one). */
  logoUrl?: string | null;
  /** Populated only when status === "SUSPENDED"; drives the reason column in the Suspended tab. */
  suspendedAt?: string | null;
  suspensionReason?: string | null;
}

interface PartnerDocument {
  type: string;
  label: string;
  uploaded: boolean;
  fileUrl: string | null;
  fileName: string | null;
  expiryDate: string | null;
  uploadedAt?: string | null;
  updatedAt?: string | null;
  // Backend flag: true when partner re-uploaded the doc after admin's
  // most recent unresolved rejection on that doc type. Drives the
  // REPLACED badge + isAddressed transition in the review UI.
  replacedSinceLastReview?: boolean;
}

interface PartnerDetail {
  id: string;
  companyName: string;
  status: string;
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  crNumber: string | null;
  vatNumber: string | null;
  address: string | null;
  creditLimit: number | null;
  currentBalance: number | null;
  createdAt: string;
  bookingStats: { active: number; thisMonth: number; total: number };
  mouExpiryWarning: { isExpiring: boolean; daysLeft: number } | null;
  mou?: {
    fileUrl: string | null;
    expiryDate: string | null;
    uploadedAt: string | null;
  };
  documents?: PartnerDocument[];
  missingDocCount?: number;
  logoUrl?: string | null;
}

interface ReviewProfile {
  id: string;
  status: string;
  companyName: string;
  profile: Record<string, string | null>;
  mou?: {
    fileUrl: string | null;
    expiryDate: string | null;
    uploadedAt: string | null;
    expiryWarning: any;
    replacedSinceLastReview?: boolean;
  };
  documents?: PartnerDocument[];
  allDocumentsUploaded?: boolean;
  missingDocuments?: string[];
  comments: Record<
    string,
    Array<{
      id: string;
      comment: string;
      type?: "ADMIN_REJECTION" | "PARTNER_REQUEST" | "ADMIN_COMMENT";
      isResolved: boolean;
      /** Set when the backend marks the comment resolved. Populated in the
       *  admin panel because backend now ships both live and current-round
       *  resolved comments so admin sees the field scope for this cycle. */
      resolvedAt?: string | null;
      createdAt: string;
    }>
  >;
  unresolvedCommentCount: number;
  submittedAt: string | null;
  previousProfile?: Record<string, string | null>;
  logoUrl?: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const statusColors: Record<string, string> = {
  INVITED: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  PENDING_REVIEW: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  CHANGES_REQUESTED: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  APPROVED: "bg-green-500/10 text-green-400 border-green-500/30",
  SUSPENDED: "bg-red-500/10 text-red-400 border-red-500/30",
};

const statusLabels: Record<string, string> = {
  INVITED: "Invited",
  PENDING_REVIEW: "Pending Review",
  CHANGES_REQUESTED: "Changes Requested",
  APPROVED: "Active",
  SUSPENDED: "Suspended",
};

function isPdf(url: string | null): boolean {
  if (!url) return false;
  return url.toLowerCase().endsWith(".pdf") || url.includes("/pdf");
}

// ============== PROPS ==============
// Optional deep-link prop from the admin dashboard router. When the
// Overview panel sends the user here, it stashes a partnerId so this
// panel can auto-open that partner's detail view. Currently treated
// as reserved-for-future-wiring; declared so the parent typechecks.
interface PartnerManagementPanelProps {
  initialOpenPartnerId?: string | null;
  onInitialOpenConsumed?: () => void;
}

/**
 * Is this comment an admin rejection? Prefer the backend enum (Step 3+);
 * fall back to the legacy "❌ Rejected:" prefix for pre-refactor rows.
 */
function isRejectionComment(c: {
  comment: string;
  type?: "ADMIN_REJECTION" | "PARTNER_REQUEST" | "ADMIN_COMMENT";
}): boolean {
  if (c.type) return c.type === "ADMIN_REJECTION";
  return c.comment.startsWith("❌ Rejected:");
}

/**
 * Strip the legacy prefix from a comment for display — new comments (Step 6+)
 * don't have it, but old rows still do.
 */
function stripRejectionPrefix(comment: string): string {
  return comment.replace(/^❌\s*Rejected:\s*/, "");
}

/**
 * Small square tile that shows the partner's logo when uploaded and falls
 * back to the existing Briefcase-in-a-blue-square placeholder otherwise. The
 * fallback path matches the pre-logo styling that used to be everywhere so
 * partners without a logo look identical to before.
 *
 * `size` is the outer square in px (Tailwind class needs to resolve — 40 / 48
 * are the two used sites; 40 => w-10 h-10, 48 => w-12 h-12).
 */
function PartnerLogoTile({
  logoUrl,
  size = 40,
}: {
  logoUrl?: string | null;
  size?: 40 | 48;
}) {
  const boxCls = size === 48 ? "w-12 h-12" : "w-10 h-10";
  const iconCls = size === 48 ? "w-6 h-6" : "w-5 h-5";
  if (logoUrl) {
    // Signed URL comes straight from the backend GET; the proxy resizes to
    // 2× the display size for sharp rendering on retina displays.
    return (
      <div
        className={`${boxCls} rounded-lg overflow-hidden border border-neutral-700 bg-neutral-800 shrink-0`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={proxiedImageUrl(logoUrl, size * 2) ?? logoUrl}
          alt="Company logo"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }
  return (
    <div
      className={`${boxCls} bg-blue-500/20 rounded-lg flex items-center justify-center shrink-0`}
    >
      <Briefcase className={`${iconCls} text-blue-400`} />
    </div>
  );
}

/**
 * "Did the admin Accept this field this round?" Answered by looking for any
 * resolved ADMIN_COMMENT-typed comment in the current review round. That
 * comment is what admin per-field Accept creates on the backend (via
 * addPartnerReviewComment with resolveOnCreate=true). Also matches on the
 * generic pattern "resolved comment during this round" so acceptance of a
 * previously-rejected field (via resolving the rejection comment) is treated
 * as accepted too.
 */
function isAcceptedInRound(
  comments: Array<{
    type?: "ADMIN_REJECTION" | "PARTNER_REQUEST" | "ADMIN_COMMENT";
    isResolved: boolean;
  }>,
): boolean {
  return comments.some(
    (c) =>
      c.isResolved &&
      (c.type === "ADMIN_COMMENT" || c.type === "ADMIN_REJECTION"),
  );
}

export default function PartnerManagementPanel({
  initialOpenPartnerId,
  onInitialOpenConsumed,
}: PartnerManagementPanelProps = {}) {
  // Reserved deep-link props — wiring TBD.
  void initialOpenPartnerId;
  void onInitialOpenConsumed;
  const { showNotification } = useNotification();

  const [summary, setSummary] = useState({
    total: 0,
    active: 0,
    pending: 0,
    bookings: { count: 0, active: 0, month: "" },
  });
  const [partners, setPartners] = useState<Partner[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPartner, setSelectedPartner] = useState<PartnerDetail | null>(
    null,
  );
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ companyName: "", email: "" });
  const [isInviting, setIsInviting] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewProfile, setReviewProfile] = useState<ReviewProfile | null>(
    null,
  );
  const [isLoadingReview, setIsLoadingReview] = useState(false);
  const [pendingReviews, setPendingReviews] = useState<
    Array<{
      id: string;
      companyName: string;
      contactPerson: string | null;
      submittedAt: string | null;
    }>
  >([]);
  const [viewerDoc, setViewerDoc] = useState<{
    url: string;
    title: string;
    isPdf: boolean;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Change requests
  const [changeRequests, setChangeRequests] = useState<
    Array<{
      id: string;
      fields: string[];
      reason: string;
      status: string;
      adminNote: string | null;
      createdAt: string;
      partner: { id: string; companyName: string };
    }>
  >([]);
  const [loadingChangeRequests, setLoadingChangeRequests] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);

  const [rejectingField, setRejectingField] = useState<string | null>(null);
  const [rejectFieldComment, setRejectFieldComment] = useState("");

  // Unsuspend modal state. Holds the ID of the partner being unsuspended
  // (or null when closed) plus an optional admin-supplied reason string
  // that gets stored in the audit log alongside the unpaid-invoice
  // IDs at unsuspend time.
  const [showUnsuspendModal, setShowUnsuspendModal] = useState<string | null>(
    null,
  );
  const [unsuspendReason, setUnsuspendReason] = useState("");

  // Suspend modal state. Reason is REQUIRED (backend enforces >= 5 chars).
  // The partner sees this verbatim on their locked dashboard, so admin
  // must write something meaningful.
  const [showSuspendModal, setShowSuspendModal] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState("");

  const fetchSummary = useCallback(async () => {
    try {
      const res = await adminApi.getPartnerSummary();
      if (res.success && res.data?.cards) {
        setSummary({
          total: res.data.cards.totalPartners,
          active: res.data.cards.activePartners,
          pending: res.data.cards.pendingApproval,
          bookings: res.data.cards.totalBookings,
        });
      }
    } catch {
      /* silent */
    }
  }, []);

  const fetchPartners = useCallback(
    async (page = 1, search = "", status = "all") => {
      setIsLoading(true);
      try {
        const params: Record<string, any> = { page, limit: 10 };
        if (search) params.search = search;
        if (status !== "all") params.status = status;
        const res = await adminApi.getPartners(params);
        if (res.success && res.data) {
          setPartners(res.data.partners || []);
          setPagination(
            res.data.pagination || {
              page: 1,
              limit: 10,
              total: 0,
              totalPages: 0,
            },
          );
          setStatusCounts(res.data.statusCounts || {});
        }
      } catch (err: any) {
        showNotification("error", err.message || "Failed to load partners");
      } finally {
        setIsLoading(false);
      }
    },
    [showNotification],
  );

  useEffect(() => {
    fetchSummary();
    fetchPartners(1);
  }, [fetchSummary, fetchPartners]);
  useEffect(() => {
    const timer = setTimeout(
      () => fetchPartners(1, searchQuery, statusFilter),
      400,
    );
    return () => clearTimeout(timer);
  }, [searchQuery, statusFilter]);

  const fetchChangeRequests = useCallback(async () => {
    setLoadingChangeRequests(true);
    try {
      const res = await adminApi.getPartnerChangeRequests();
      if (res.success && res.data) setChangeRequests(res.data.requests || []);
    } catch {
      /* silent */
    } finally {
      setLoadingChangeRequests(false);
    }
  }, []);

  useEffect(() => {
    fetchChangeRequests();
  }, [fetchChangeRequests]);

  const handleApproveChangeRequest = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await adminApi.approvePartnerChangeRequest(id, {
        adminNote: "Approved — please update the requested fields and resubmit",
      });
      if (res.success) {
        showNotification("success", res.message || "Change request approved");
        fetchChangeRequests();
        fetchPartners(pagination.page, searchQuery, statusFilter);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to approve");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectField = async (fieldName: string, partnerId: string) => {
    if (!rejectFieldComment.trim()) {
      showNotification("error", "Please provide a reason for rejection");
      return;
    }
    setActionLoading("reject-" + fieldName);
    try {
      // First resolve all existing comments on this field
      const existingComments =
        reviewProfile?.comments[fieldName]?.filter((c) => !c.isResolved) || [];
      for (const c of existingComments) {
        await adminApi.resolvePartnerReviewComment(partnerId, c.id);
      }
      // Then add the rejection comment. The `type` field discriminates
      // this from a plain admin comment on the backend — no need for the
      // legacy "❌ Rejected:" prefix in the stored text anymore.
      await adminApi.addPartnerReviewComment(partnerId, {
        fieldName,
        comment: rejectFieldComment.trim(),
        type: "ADMIN_REJECTION",
      });
      showNotification("info", "Field rejected — will be sent back to partner");
      setRejectingField(null);
      setRejectFieldComment("");
      handleOpenReviewProfile(partnerId);
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Persistent per-field / per-doc / per-MOU Accept. Two backend flavors:
   *   - If there are unresolved comments on the field, resolve each one.
   *     That already fires a notification if the comment was a rejection.
   *   - Otherwise (CHANGED-but-uncommented field), create a resolved
   *     ADMIN_COMMENT ("Accepted") with resolveOnCreate=true so the audit
   *     trail records the acceptance without pinging the partner.
   * Both paths refresh the review afterwards so `isAcceptedInRound` picks
   * up the new state and the emerald ACCEPTED pill sticks across refreshes.
   */
  const handleAcceptField = async (
    fieldName: string,
    partnerId: string,
    unresolvedComments: Array<{ id: string }>,
  ) => {
    setActionLoading("accept-" + fieldName);
    try {
      if (unresolvedComments.length > 0) {
        for (const c of unresolvedComments) {
          await adminApi.resolvePartnerReviewComment(partnerId, c.id);
        }
      } else {
        await adminApi.addPartnerReviewComment(partnerId, {
          fieldName,
          comment: "Accepted",
          type: "ADMIN_COMMENT",
          resolveOnCreate: true,
        });
      }
      handleOpenReviewProfile(partnerId);
    } catch (err: any) {
      showNotification("error", err.message || "Failed to accept");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectChangeRequest = async (id: string) => {
    if (!rejectNote.trim()) {
      showNotification("error", "Please provide a reason for rejection");
      return;
    }
    setActionLoading(id);
    try {
      const res = await adminApi.rejectPartnerChangeRequest(id, {
        adminNote: rejectNote.trim(),
      });
      if (res.success) {
        showNotification("info", res.message || "Change request rejected");
        setShowRejectModal(null);
        setRejectNote("");
        fetchChangeRequests();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to reject");
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewPartner = async (id: string) => {
    setIsLoadingDetail(true);
    try {
      const res = await adminApi.getPartner(id);
      if (res.success && res.data) setSelectedPartner(res.data);
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load partner");
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteForm.companyName || !inviteForm.email) return;
    setIsInviting(true);
    try {
      const res = await adminApi.invitePartner(inviteForm);
      if (res.success) {
        showNotification("success", res.message || "Invitation sent");
        setShowInviteModal(false);
        setInviteForm({ companyName: "", email: "" });
        fetchPartners(pagination.page, searchQuery, statusFilter);
        fetchSummary();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to send invitation");
    } finally {
      setIsInviting(false);
    }
  };

  const handleResendInvitation = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await adminApi.resendPartnerInvitation(id);
      if (res.success) showNotification("success", "Invitation resent");
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenReviews = async () => {
    setShowReviewModal(true);
    setReviewProfile(null);
    setIsLoadingReview(true);
    try {
      const res = await adminApi.getPendingPartnerReviews();
      if (res.success && res.data) setPendingReviews(res.data.pending || []);
    } catch {
      /* silent */
    } finally {
      setIsLoadingReview(false);
    }
  };

  const handleOpenReviewProfile = async (id: string) => {
    setIsLoadingReview(true);
    try {
      const res = await adminApi.getPartnerForReview(id);
      if (res.success && res.data) setReviewProfile(res.data);
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setIsLoadingReview(false);
    }
  };

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await adminApi.approvePartner(id);
      if (res.success) {
        showNotification("success", "Partner approved");
        setReviewProfile(null);
        handleOpenReviews();
        fetchPartners(pagination.page, searchQuery, statusFilter);
        fetchSummary();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to approve");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequestChanges = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await adminApi.requestPartnerChanges(id);
      if (res.success) {
        showNotification("info", "Changes requested");
        setReviewProfile(null);
        handleOpenReviews();
        fetchPartners(pagination.page, searchQuery, statusFilter);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSuspend = async (id: string, reason: string) => {
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      showNotification("error", "Please provide a reason (5+ characters)");
      return;
    }
    setActionLoading(id);
    try {
      const res = await adminApi.suspendPartner(id, { reason: trimmed });
      if (res.success) {
        showNotification("info", "Partner suspended");
        setShowSuspendModal(null);
        setSuspendReason("");
        setSelectedPartner(null);
        fetchPartners(pagination.page, searchQuery, statusFilter);
        fetchSummary();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  // Plain admin-driven reactivate — used from the Suspended tab / drawer
  // for partners suspended via `suspendPartner`. Distinct from the
  // payment-driven `handleUnsuspend` below (which uses manualUnsuspend
  // and captures unpaid-invoice audit context).
  const handleReactivate = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await adminApi.reactivatePartner(id);
      if (res.success) {
        showNotification("success", res.message || "Partner reactivated");
        setSelectedPartner(null);
        fetchPartners(pagination.page, searchQuery, statusFilter);
        fetchSummary();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  // ============== UNSUSPEND PARTNER (Stage 3B-2) ==============
  //
  // Replaces the prior plain "reactivate" action. Uses the new
  // manualUnsuspendPartner endpoint, which:
  //   - Audit-logs any unpaid invoice IDs at the time of unsuspend
  //     (per Stage 3B-2 spec — traces who unsuspended whom with what
  //     outstanding balance).
  //   - Accepts an optional admin-provided reason string.
  //   - Allows unsuspend even when invoices remain unpaid; if the
  //     partner stays delinquent, the next 6th-of-month cron run will
  //     auto-re-suspend them (no grace flag per spec).
  //
  // The modal flow is intentionally minimal — single optional textarea
  // — because most unsuspends are routine ("they paid, just unsuspend").
  // The reason field exists for the audit trail when admin needs to
  // capture context for an exceptional unsuspend (e.g. "VIP override —
  // payment promised by EOD").
  const handleUnsuspend = async (id: string, reason?: string) => {
    setActionLoading(id);
    try {
      const res = await adminApi.manualUnsuspendPartner(
        id,
        reason && reason.trim() ? { reason: reason.trim() } : undefined,
      );
      if (res.success) {
        showNotification(
          "success",
          res.message ||
            `Partner reactivated${res.data?.unpaidInvoicesAtUnsuspend ? ` (${res.data.unpaidInvoicesAtUnsuspend} invoice(s) still unpaid)` : ""}`,
        );
        setShowUnsuspendModal(null);
        setUnsuspendReason("");
        setSelectedPartner(null);
        fetchPartners(pagination.page, searchQuery, statusFilter);
        fetchSummary();
      }
    } catch (err: any) {
      const msg =
        err instanceof ApiError ? err.message : err?.message || "Failed";
      showNotification("error", msg);
    } finally {
      setActionLoading(null);
    }
  };

  const openDocViewer = (doc: PartnerDocument) => {
    if (!doc.fileUrl) return;
    setViewerDoc({
      url: doc.fileUrl,
      title: doc.label,
      isPdf: isPdf(doc.fileUrl),
    });
  };

  const handleResolveComment = async (commentId: string, partnerId: string) => {
    setActionLoading(commentId);
    try {
      const res = await adminApi.resolvePartnerReviewComment(
        partnerId,
        commentId,
      );
      if (res.success) {
        showNotification("success", "Comment resolved");
        handleOpenReviewProfile(partnerId);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to resolve");
    } finally {
      setActionLoading(null);
    }
  };

  // Bulk-accept only partner_request / admin_comment items. Admin rejections
  // must NOT be bulk-resolved — the admin's next step for a rejection is to
  // send the profile back to the partner via Request Changes, not silently
  // resolve it. If any rejection is present, the calling UI should hide the
  // Accept-All entry point entirely (defense-in-depth: this handler also
  // filters them out).
  const handleResolveAllComments = async (partnerId: string) => {
    setActionLoading("resolve-all");
    try {
      const allComments: { id: string }[] = [];
      Object.values(reviewProfile!.comments).forEach((fieldComments) => {
        fieldComments
          .filter((c) => !c.isResolved && !isRejectionComment(c))
          .forEach((c) => allComments.push(c));
      });
      for (const c of allComments) {
        await adminApi.resolvePartnerReviewComment(partnerId, c.id);
      }
      showNotification("success", `${allComments.length} comment(s) resolved`);
      handleOpenReviewProfile(partnerId);
    } catch (err: any) {
      showNotification("error", err.message || "Failed to resolve comments");
    } finally {
      setActionLoading(null);
    }
  };

  // Document card sub-component
  const DocumentCard = ({
    doc,
    showComments,
    comments,
  }: {
    doc: PartnerDocument;
    showComments?: boolean;
    comments?: Array<{ id: string; comment: string; isResolved: boolean }>;
  }) => {
    const unresolvedComments = comments?.filter((c) => !c.isResolved) || [];
    return (
      <div
        className={`bg-neutral-800 rounded-lg p-3 border transition-colors ${!doc.uploaded ? "border-red-500/30" : unresolvedComments.length > 0 ? "border-yellow-500/30" : "border-neutral-700"}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${doc.uploaded ? "bg-green-500/20" : "bg-red-500/20"}`}
            >
              {doc.uploaded ? (
                <CheckCircle2 className="w-4 h-4 text-green-400" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm text-white font-medium truncate">
                {doc.label}
              </p>
              {doc.uploaded ? (
                <p className="text-xs text-gray-500 truncate">
                  {doc.fileName || "Uploaded"}
                  {doc.expiryDate &&
                    ` · Exp: ${new Date(doc.expiryDate).toLocaleDateString()}`}
                </p>
              ) : (
                <p className="text-xs text-red-400">Not uploaded</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {unresolvedComments.length > 0 && (
              <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-[10px] rounded font-medium">
                {unresolvedComments.length} comment
                {unresolvedComments.length > 1 ? "s" : ""}
              </span>
            )}
            {doc.uploaded && doc.fileUrl && (
              <button
                onClick={() => openDocViewer(doc)}
                className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
                title="View document"
              >
                <Eye className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        {showComments &&
          unresolvedComments.map((c) => (
            <div
              key={c.id}
              className="mt-2 p-2 bg-yellow-500/10 rounded text-xs text-yellow-400 border border-yellow-500/20"
            >
              {c.comment}
            </div>
          ))}
      </div>
    );
  };

  const getApprovalBlockReasons = (profile: ReviewProfile): string[] => {
    const reasons: string[] = [];
    // Only ADMIN_REJECTION comments block approval — PARTNER_REQUEST comments
    // are granted edit permissions, not corrections the admin owes. Once the
    // partner re-submits after using their granted permission, the request has
    // served its purpose; nothing for admin to "resolve." Filter them out of
    // the block count. Legacy prefix fallback for pre-refactor rows.
    const unresolvedRejections = Object.values(profile.comments)
      .flat()
      .filter(
        (c) =>
          !c.isResolved &&
          (c.type
            ? c.type === "ADMIN_REJECTION"
            : c.comment.startsWith("❌ Rejected:")),
      );
    if (unresolvedRejections.length > 0)
      reasons.push(`${unresolvedRejections.length} unresolved rejection(s)`);
    if (
      !profile.allDocumentsUploaded &&
      profile.missingDocuments &&
      profile.missingDocuments.length > 0
    )
      reasons.push(`${profile.missingDocuments.length} missing document(s)`);
    return reasons;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">
            Partner Management
          </h2>
          <p className="text-sm text-gray-500">
            Manage corporate partner accounts
          </p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-luxury-gold text-black font-semibold rounded-lg hover:bg-luxury-gold/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Invite Partner
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-sm text-gray-400">Total Partners</span>
          </div>
          <p className="text-2xl font-bold text-white">{summary.total}</p>
        </div>
        <div className="p-5 bg-neutral-900 border border-green-500/30 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            </div>
            <span className="text-sm text-gray-400">Active</span>
          </div>
          <p className="text-2xl font-bold text-green-400">{summary.active}</p>
        </div>
        <div className="p-5 bg-neutral-900 border border-yellow-500/30 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-400" />
            </div>
            <span className="text-sm text-gray-400">Pending Review</span>
          </div>
          <p className="text-2xl font-bold text-yellow-400">
            {summary.pending}
          </p>
        </div>
        <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-purple-400" />
            </div>
            <span className="text-sm text-gray-400">
              {summary.bookings.month} Bookings
            </span>
          </div>
          <p className="text-2xl font-bold text-white">
            {summary.bookings.count}{" "}
            <span className="text-sm text-gray-500 font-normal">
              ({summary.bookings.active} active)
            </span>
          </p>
        </div>
      </div>

      {/* Pending Review Alert */}
      {summary.pending > 0 && (
        <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-white font-medium">
                {summary.pending} partner{summary.pending > 1 ? "s" : ""}{" "}
                pending review
              </p>
              <p className="text-sm text-purple-400/70">
                New partners need profile review before activation
              </p>
            </div>
          </div>
          <button
            onClick={handleOpenReviews}
            className="px-4 py-2 bg-purple-500 text-white text-sm font-semibold rounded-lg hover:bg-purple-400 transition-colors"
          >
            Review Profiles
          </button>
        </div>
      )}

      {/* Change Requests from Approved Partners */}
      {changeRequests.length > 0 && (
        <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                <Edit2 className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-white font-medium">
                  {changeRequests.length} Profile Change Request
                  {changeRequests.length > 1 ? "s" : ""}
                </p>
                <p className="text-sm text-amber-400/70">
                  Approved partners requesting to edit their profile
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {changeRequests.map((req) => (
              <div
                key={req.id}
                className="bg-neutral-900 border border-neutral-800 rounded-xl p-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-white font-medium">
                        {req.partner.companyName}
                      </p>
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded-full font-medium">
                        {req.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mb-2">
                      Reason: {req.reason}
                    </p>
                    {(() => {
                      const FIELD_LABELS: Record<
                        string,
                        { label: string; group: string }
                      > = {
                        companyName: {
                          label: "Company Name",
                          group: "Profile",
                        },
                        crNumber: { label: "CR Number", group: "Profile" },
                        vatNumber: { label: "VAT Number", group: "Profile" },
                        chamberOfCommerceNumber: {
                          label: "Chamber of Commerce",
                          group: "Profile",
                        },
                        baladyNumber: {
                          label: "Balady Number",
                          group: "Profile",
                        },
                        nationalAddress: {
                          label: "National Address",
                          group: "Profile",
                        },
                        contactPerson: {
                          label: "Contact Person",
                          group: "Profile",
                        },
                        contactPhone: {
                          label: "Contact Phone",
                          group: "Profile",
                        },
                        contactEmail: {
                          label: "Contact Email",
                          group: "Profile",
                        },
                        address: { label: "Address", group: "Profile" },
                        logo: { label: "Company Logo", group: "Profile" },
                        bankName: { label: "Bank Name", group: "Bank" },
                        bankAccountNumber: {
                          label: "Account Number",
                          group: "Bank",
                        },
                        bankIban: { label: "IBAN", group: "Bank" },
                        CR: {
                          label: "Commercial Registration",
                          group: "Documents",
                        },
                        VAT: { label: "VAT Certificate", group: "Documents" },
                        CHAMBER_OF_COMMERCE: {
                          label: "Chamber of Commerce",
                          group: "Documents",
                        },
                        BALADY: { label: "Balady License", group: "Documents" },
                        NATIONAL_ADDRESS: {
                          label: "National Address",
                          group: "Documents",
                        },
                        IBAN_LETTER: {
                          label: "IBAN Letter",
                          group: "Documents",
                        },
                        mou: { label: "MOU Document", group: "MOU" },
                        mouExpiry: { label: "MOU Expiry Date", group: "MOU" },
                      };
                      const GROUP_COLORS: Record<string, string> = {
                        Profile:
                          "bg-blue-500/10 text-blue-400 border-blue-500/20",
                        Bank: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                        Documents:
                          "bg-purple-500/10 text-purple-400 border-purple-500/20",
                        MOU: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
                      };
                      const grouped: Record<string, string[]> = {};
                      (req.fields as string[]).forEach((field) => {
                        const info = FIELD_LABELS[field];
                        const group = info?.group || "Other";
                        if (!grouped[group]) grouped[group] = [];
                        grouped[group].push(field);
                      });
                      return (
                        <div className="space-y-1.5">
                          {Object.entries(grouped).map(([group, fields]) => (
                            <div
                              key={group}
                              className="flex items-center gap-1.5 flex-wrap"
                            >
                              <span
                                className={`px-1.5 py-0.5 text-[9px] rounded font-semibold uppercase tracking-wider border ${GROUP_COLORS[group] || "bg-neutral-700 text-gray-400 border-neutral-600"}`}
                              >
                                {group}
                              </span>
                              {fields.map((field) => (
                                <span
                                  key={field}
                                  className="px-2 py-0.5 bg-neutral-800 text-gray-300 text-[10px] rounded"
                                >
                                  {FIELD_LABELS[field]?.label || field}
                                </span>
                              ))}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    <p className="text-[10px] text-gray-600 mt-2">
                      Submitted: {new Date(req.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleApproveChangeRequest(req.id)}
                      disabled={actionLoading === req.id}
                      className="px-3 py-2 bg-green-500/20 text-green-400 text-xs font-medium rounded-lg hover:bg-green-500/30 border border-green-500/30 transition-colors disabled:opacity-50"
                    >
                      {actionLoading === req.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        "Approve"
                      )}
                    </button>
                    <button
                      onClick={() => setShowRejectModal(req.id)}
                      disabled={actionLoading === req.id}
                      className="px-3 py-2 bg-red-500/20 text-red-400 text-xs font-medium rounded-lg hover:bg-red-500/30 border border-red-500/30 transition-colors disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search company, CR, email..."
            className="w-full pl-9 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-luxury-gold/50"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { key: "all", label: "All" },
            { key: "APPROVED", label: "Active" },
            { key: "ONBOARDING", label: "Onboarding" },
            { key: "PENDING_REVIEW", label: "Pending" },
            { key: "INVITED", label: "Invited" },
            { key: "SUSPENDED", label: "Suspended" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${statusFilter === f.key ? "bg-luxury-gold text-black font-semibold" : "bg-neutral-800 text-gray-400 hover:text-white"}`}
            >
              {f.label}{" "}
              {f.key !== "all" && statusCounts[f.key]
                ? `(${statusCounts[f.key]})`
                : ""}
            </button>
          ))}
        </div>
      </div>

      {/* Partners Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
          </div>
        ) : partners.length === 0 ? (
          <div className="text-center py-16">
            <Briefcase className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-white font-medium">No partners found</p>
            <p className="text-sm text-gray-500">
              Try adjusting your filters or invite a new partner
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full min-w-[800px]">
                <thead className="bg-neutral-800/50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Company
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Contact
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      CR Number
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Bookings
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Status
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {partners.map((p) => (
                    <tr key={p.id} className="hover:bg-neutral-800/30">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <PartnerLogoTile logoUrl={p.logoUrl} />
                          <div>
                            <p className="text-white font-medium">
                              {p.companyName}
                            </p>
                            <p className="text-xs text-gray-500">{p.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-white text-sm">
                          {p.contact.name || "—"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {p.contact.phone || "—"}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-sm text-white font-mono">
                        {p.crNumber || "—"}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-white text-sm">
                          {p.bookings.active} active
                        </p>
                        <p className="text-xs text-gray-500">
                          {p.bookings.total} total
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusColors[p.status] || "bg-neutral-800 text-gray-400"}`}
                        >
                          {statusLabels[p.status] || p.status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleViewPartner(p.id)}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-neutral-700 rounded transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {p.status === "INVITED" && (
                            <button
                              onClick={() => handleResendInvitation(p.id)}
                              disabled={actionLoading === p.id}
                              className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded hover:bg-blue-500/30 disabled:opacity-50"
                            >
                              Resend
                            </button>
                          )}
                          {p.status === "PENDING_REVIEW" && (
                            <button
                              onClick={() => {
                                handleOpenReviews();
                                setTimeout(
                                  () => handleOpenReviewProfile(p.id),
                                  500,
                                );
                              }}
                              className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded hover:bg-yellow-500/30"
                            >
                              Review
                            </button>
                          )}
                          {/* Row-level Suspend — surfaces on any non-INVITED,
                              non-SUSPENDED row so admin can act from the list
                              without opening the drawer. Opens the reason
                              modal; actual API call happens there. */}
                          {p.status !== "INVITED" &&
                            p.status !== "SUSPENDED" && (
                              <button
                                onClick={() => {
                                  setShowSuspendModal(p.id);
                                  setSuspendReason("");
                                }}
                                className="px-2 py-1 bg-red-500/15 text-red-400 text-xs rounded hover:bg-red-500/25 border border-red-500/20"
                                title="Suspend partner"
                              >
                                Suspend
                              </button>
                            )}
                          {p.status === "SUSPENDED" && (
                            <button
                              onClick={() => handleReactivate(p.id)}
                              disabled={actionLoading === p.id}
                              className="px-2 py-1 bg-green-500/15 text-green-400 text-xs rounded hover:bg-green-500/25 border border-green-500/20 disabled:opacity-50"
                              title="Reactivate partner"
                            >
                              {actionLoading === p.id ? "..." : "Reactivate"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden space-y-3 p-4">
              {partners.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleViewPartner(p.id)}
                  className="bg-neutral-800 rounded-xl p-4 cursor-pointer border border-neutral-700 hover:border-blue-500/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <PartnerLogoTile logoUrl={p.logoUrl} />
                      <div>
                        <p className="text-white font-medium text-sm">
                          {p.companyName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {p.contact.name || p.email}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium border ${statusColors[p.status] || ""}`}
                    >
                      {statusLabels[p.status] || p.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-neutral-700">
                    <span className="text-xs text-gray-400">
                      CR: {p.crNumber || "—"}
                    </span>
                    <span className="text-sm text-white">
                      {p.bookings.active} active / {p.bookings.total} total
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {pagination.total > 0 && (
          <div className="px-5 py-4 border-t border-neutral-800 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
              of {pagination.total}
            </p>
            {pagination.totalPages > 1 && (
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    fetchPartners(
                      pagination.page - 1,
                      searchQuery,
                      statusFilter,
                    )
                  }
                  disabled={pagination.page === 1}
                  className="px-3 py-1.5 bg-neutral-800 text-white text-sm rounded-lg disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() =>
                    fetchPartners(
                      pagination.page + 1,
                      searchQuery,
                      statusFilter,
                    )
                  }
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-3 py-1.5 bg-neutral-800 text-white text-sm rounded-lg disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ============== PARTNER DETAIL SLIDE-IN ============== */}
      {(selectedPartner || isLoadingDetail) && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40"
            onClick={() => setSelectedPartner(null)}
          />
          <div className="fixed inset-y-0 right-0 w-full sm:w-[520px] bg-neutral-900 border-l border-neutral-800 z-50 overflow-y-auto">
            {isLoadingDetail ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
              </div>
            ) : (
              selectedPartner && (
                <div className="p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4 min-w-0">
                      <PartnerLogoTile
                        logoUrl={selectedPartner.logoUrl}
                        size={48}
                      />
                      <div className="min-w-0">
                        <h2 className="text-xl font-bold text-white truncate">
                          {selectedPartner.companyName}
                        </h2>
                        <span
                          className={`mt-1 inline-block px-2 py-0.5 text-xs rounded-full border ${statusColors[selectedPartner.status] || ""}`}
                        >
                          {statusLabels[selectedPartner.status] ||
                            selectedPartner.status}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedPartner(null)}
                      className="p-2 hover:bg-neutral-800 rounded-lg flex-shrink-0"
                    >
                      <X className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>

                  {selectedPartner.mouExpiryWarning?.isExpiring && (
                    <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-yellow-400">
                        MOU expiring in{" "}
                        {selectedPartner.mouExpiryWarning.daysLeft} days
                      </p>
                    </div>
                  )}

                  {/* Contact Info */}
                  <div className="bg-neutral-800 rounded-xl p-4 mb-4">
                    <h3 className="text-sm font-semibold text-white mb-3">
                      Contact Information
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Contact Person</span>
                        <span className="text-white">
                          {selectedPartner.contactPerson || "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Email</span>
                        <span className="text-white">
                          {selectedPartner.contactEmail || "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Phone</span>
                        <span className="text-white">
                          {selectedPartner.contactPhone || "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">CR Number</span>
                        <span className="text-white font-mono">
                          {selectedPartner.crNumber || "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">VAT Number</span>
                        <span className="text-white font-mono">
                          {selectedPartner.vatNumber || "—"}
                        </span>
                      </div>
                      {selectedPartner.address && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Address</span>
                          <span className="text-white text-right max-w-[60%]">
                            {selectedPartner.address}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Documents Section in Detail View */}
                  {selectedPartner.documents &&
                    selectedPartner.documents.length > 0 && (
                      <div className="bg-neutral-800 rounded-xl p-4 mb-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                            <Shield className="w-4 h-4 text-blue-400" />
                            Required Documents
                          </h3>
                          {selectedPartner.missingDocCount != null &&
                          selectedPartner.missingDocCount > 0 ? (
                            <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full font-medium">
                              {selectedPartner.missingDocCount} missing
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full font-medium">
                              All uploaded
                            </span>
                          )}
                        </div>
                        <div className="space-y-2">
                          {selectedPartner.documents.map((doc) => (
                            <DocumentCard key={doc.type} doc={doc} />
                          ))}
                        </div>
                      </div>
                    )}

                  {/* MOU */}
                  {selectedPartner.mou?.fileUrl && (
                    <div className="bg-neutral-800 rounded-xl p-4 mb-4">
                      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-400" />
                        MOU Document
                      </h3>
                      <button
                        onClick={() =>
                          setViewerDoc({
                            url: selectedPartner.mou!.fileUrl!,
                            title: "Memorandum of Understanding",
                            isPdf: isPdf(selectedPartner.mou!.fileUrl),
                          })
                        }
                        className="w-full flex items-center gap-3 p-3 bg-neutral-900 rounded-lg hover:bg-neutral-700 transition-colors"
                      >
                        <div className="w-8 h-8 bg-blue-500/20 rounded flex items-center justify-center">
                          <FileText className="w-4 h-4 text-blue-400" />
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <p className="text-sm text-white">MOU</p>
                          {selectedPartner.mou.expiryDate && (
                            <p className="text-xs text-gray-500">
                              Expires:{" "}
                              {new Date(
                                selectedPartner.mou.expiryDate,
                              ).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <Eye className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                  )}

                  {/* Booking Stats */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-neutral-800 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-blue-400">
                        {selectedPartner.bookingStats.active}
                      </p>
                      <p className="text-xs text-gray-500">Active</p>
                    </div>
                    <div className="bg-neutral-800 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-white">
                        {selectedPartner.bookingStats.thisMonth}
                      </p>
                      <p className="text-xs text-gray-500">This Month</p>
                    </div>
                    <div className="bg-neutral-800 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-white">
                        {selectedPartner.bookingStats.total}
                      </p>
                      <p className="text-xs text-gray-500">Total</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {selectedPartner.status !== "SUSPENDED" &&
                      selectedPartner.status !== "INVITED" && (
                        <button
                          onClick={() => {
                            setShowSuspendModal(selectedPartner.id);
                            setSuspendReason("");
                          }}
                          disabled={actionLoading === selectedPartner.id}
                          className="w-full py-3 bg-red-500/20 text-red-400 font-medium rounded-lg hover:bg-red-500/30 border border-red-500/30 transition-colors disabled:opacity-50"
                        >
                          Suspend Partner
                        </button>
                      )}
                    {selectedPartner.status === "SUSPENDED" && (
                      <button
                        onClick={() => handleReactivate(selectedPartner.id)}
                        disabled={actionLoading === selectedPartner.id}
                        className="w-full py-3 bg-green-500 text-white font-medium rounded-lg hover:bg-green-400 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === selectedPartner.id
                          ? "Reactivating..."
                          : "Reactivate Partner"}
                      </button>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </>
      )}

      {/* ============== INVITE MODAL ============== */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowInviteModal(false)}
          />
          <div className="relative w-full max-w-md mx-4 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-neutral-800">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Invite Partner
                </h3>
                <p className="text-sm text-gray-400">
                  Send an invitation to join LuxDrive
                </p>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="p-1 hover:bg-neutral-800 rounded"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Company Name *
                </label>
                <input
                  type="text"
                  value={inviteForm.companyName}
                  onChange={(e) =>
                    setInviteForm((f) => ({
                      ...f,
                      companyName: e.target.value,
                    }))
                  }
                  placeholder="Enter company name"
                  className="w-full px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) =>
                    setInviteForm((f) => ({ ...f, email: e.target.value }))
                  }
                  placeholder="partner@company.sa"
                  className="w-full px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold"
                />
              </div>
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-xs text-blue-400">
                  An invitation email will be sent. The partner can register and
                  complete their profile. You&apos;ll review and approve before
                  they can book.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-neutral-800">
              <button
                onClick={() => setShowInviteModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={
                  !inviteForm.companyName || !inviteForm.email || isInviting
                }
                className="flex items-center gap-2 px-4 py-2 bg-luxury-gold text-black font-semibold rounded-lg hover:bg-luxury-gold/90 disabled:opacity-50 transition-colors"
              >
                {isInviting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}{" "}
                Send Invitation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============== REVIEW MODAL ============== */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => {
              setShowReviewModal(false);
              setReviewProfile(null);
            }}
          />
          <div className="relative w-full max-w-2xl mx-4 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="p-5 border-b border-neutral-800 flex items-center justify-between sticky top-0 bg-neutral-900 z-10">
              <div className="flex items-center gap-3 min-w-0">
                {reviewProfile && (
                  <PartnerLogoTile logoUrl={reviewProfile.logoUrl} size={48} />
                )}
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-white truncate">
                    {reviewProfile
                      ? reviewProfile.companyName
                      : "Profile Reviews"}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {reviewProfile
                      ? "Review partner profile & documents"
                      : `${pendingReviews.length} pending`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowReviewModal(false);
                  setReviewProfile(null);
                }}
                className="p-1 hover:bg-neutral-800 rounded"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-5">
              {isLoadingReview ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
                </div>
              ) : reviewProfile ? (
                <div className="space-y-5">
                  {/* Back + Status Header */}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setReviewProfile(null)}
                      className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusColors[reviewProfile.status] || "bg-neutral-800 text-gray-400"}`}
                    >
                      {statusLabels[reviewProfile.status] ||
                        reviewProfile.status}
                    </span>
                  </div>

                  {/* Missing docs warning */}
                  {reviewProfile.missingDocuments &&
                    reviewProfile.missingDocuments.length > 0 && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm text-red-400 font-medium">
                            {reviewProfile.missingDocuments.length} required
                            document
                            {reviewProfile.missingDocuments.length > 1
                              ? "s"
                              : ""}{" "}
                            missing
                          </p>
                          <p className="text-xs text-red-400/60 mt-1">
                            {reviewProfile.missingDocuments.join(", ")}
                          </p>
                        </div>
                      </div>
                    )}

                  {/* Profile Information — Card Grid */}

                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5" /> Profile Information
                      {reviewProfile.previousProfile && (
                        <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] rounded-full border border-blue-500/20 font-medium">
                          Showing changes
                        </span>
                      )}
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(reviewProfile.profile).map(
                        ([key, value]) => {
                          // Backend ships comments for the current review
                          // round only (live unresolved + any resolved during
                          // this round). We want the full set here so CHANGED,
                          // Accept/Reject, and REJECTED indicators still work
                          // after the partner submits and the partner-side
                          // resolves them for their editing UI.
                          const roundComments =
                            reviewProfile.comments[key] || [];
                          // The "Resolve all" and per-comment Reject controls
                          // still care about live comments — resolved ones
                          // have nothing left to resolve.
                          const unresolvedComments = roundComments.filter(
                            (c) => !c.isResolved,
                          );
                          const hasComments = roundComments.length > 0;
                          const prev = reviewProfile.previousProfile?.[key];
                          // Treat null/undefined/empty/whitespace as equivalent
                          // so "Empty -> value" only fires for a real transition
                          // the admin cares about. Also gate on the field having
                          // at least one comment under review — a stale snapshot
                          // from an earlier change-request cycle may differ from
                          // fields the admin never asked to change.
                          const norm = (v: string | null | undefined) =>
                            (v ?? "").toString().trim();
                          const hasChanged =
                            reviewProfile.previousProfile !== undefined &&
                            hasComments &&
                            norm(prev) !== norm(value);
                          const isRejected =
                            roundComments.some(isRejectionComment);
                          // "Addressed" requires the partner to have
                          // re-submitted the profile AFTER the most recent
                          // rejection on this field — without this check,
                          // the flag would fire immediately when admin
                          // clicks Reject (because hasChanged stays true
                          // from a pre-rejection edit in the same cycle).
                          const mostRecentRejectionAt: number = roundComments
                            .filter(isRejectionComment)
                            .reduce((acc: number, c) => {
                              const t = new Date(c.createdAt).getTime();
                              return t > acc ? t : acc;
                            }, 0);
                          const submittedAfterRejection =
                            !!reviewProfile.submittedAt &&
                            new Date(reviewProfile.submittedAt).getTime() >
                              mostRecentRejectionAt;
                          const isAddressed =
                            isRejected && hasChanged && submittedAfterRejection;
                          const isAccepted = isAcceptedInRound(roundComments);
                          return (
                            <div
                              key={key}
                              className={`p-3 rounded-xl border transition-colors ${
                                isAddressed
                                  ? "bg-emerald-500/5 border-emerald-500/20"
                                  : isAccepted
                                    ? "bg-emerald-500/5 border-emerald-500/20"
                                    : hasChanged
                                      ? "bg-blue-500/5 border-blue-500/20"
                                      : hasComments
                                        ? isRejected
                                          ? "bg-red-500/5 border-red-500/20"
                                          : "bg-amber-500/5 border-amber-500/20"
                                        : "bg-neutral-800/50 border-neutral-800"
                              } ${key === "address" ? "col-span-2" : ""}`}
                            >
                              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
                                {key.replace(/([A-Z])/g, " $1").trim()}
                                {isAddressed && (
                                  <span className="ml-1.5 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[9px] font-medium">
                                    ADDRESSED
                                  </span>
                                )}
                                {isAccepted && !isAddressed && (
                                  <span className="ml-1.5 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[9px] font-medium">
                                    ACCEPTED
                                  </span>
                                )}
                                {hasChanged && !isAddressed && !isAccepted && (
                                  <span className="ml-1.5 px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[9px] font-medium">
                                    CHANGED
                                  </span>
                                )}
                                {isRejected && !isAddressed && (
                                  <span className="ml-1.5 px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[9px] font-medium">
                                    REJECTED
                                  </span>
                                )}
                              </p>
                              {hasChanged ? (
                                <div className="space-y-1">
                                  <p className="text-xs text-red-400/70 line-through">
                                    {prev || "Empty"}
                                  </p>
                                  <p
                                    className={`text-sm font-medium ${isAddressed ? "text-emerald-400" : "text-green-400"}`}
                                  >
                                    {value || "Empty"}
                                  </p>
                                </div>
                              ) : (
                                <p
                                  className={`text-sm font-medium ${value ? "text-white" : "text-gray-600 italic"}`}
                                >
                                  {value || "Not provided"}
                                </p>
                              )}
                              {/* Comments + Actions */}
                              {hasComments && (
                                <div className="mt-2">
                                  {(() => {
                                    return (
                                      <>
                                        {roundComments.map((c) => {
                                          const isRejected =
                                            isRejectionComment(c);
                                          const dim = c.isResolved;
                                          return (
                                            <p
                                              key={c.id}
                                              className={`text-[10px] flex items-start gap-1 mb-1 ${isRejected ? "text-red-400" : "text-amber-400"} ${dim ? "opacity-50" : ""}`}
                                            >
                                              {isRejected ? (
                                                <XCircle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                              ) : (
                                                <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                              )}
                                              {stripRejectionPrefix(c.comment)}
                                            </p>
                                          );
                                        })}
                                        {isAddressed ? (
                                          <div className="mt-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-400 font-medium flex items-center gap-1.5">
                                            <CheckCircle2 className="w-3 h-3" />
                                            Partner has addressed this — review
                                            the updated value above
                                          </div>
                                        ) : isRejected ? (
                                          <p className="mt-1 text-[10px] text-red-400/60 italic">
                                            Will be sent back when you click
                                            Request Changes
                                          </p>
                                        ) : null}
                                        {/* Accept/Reject controls hidden when
                                            the field is rejected but not yet
                                            addressed; shown when isAddressed
                                            so admin can confirm or re-reject
                                            the partner's new value. Also
                                            hidden once the admin has clicked
                                            per-field Accept in this session. */}
                                        {(!isRejected || isAddressed) &&
                                          !isAccepted &&
                                          (rejectingField === key ? (
                                            <div className="mt-2 flex gap-1.5">
                                              <input
                                                type="text"
                                                value={rejectFieldComment}
                                                onChange={(e) =>
                                                  setRejectFieldComment(
                                                    e.target.value,
                                                  )
                                                }
                                                placeholder="Reason for rejection..."
                                                className="flex-1 px-2 py-1 bg-neutral-900 border border-red-500/30 rounded text-white text-[10px] focus:outline-none focus:border-red-400"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                  if (
                                                    e.key === "Enter" &&
                                                    rejectFieldComment.trim()
                                                  )
                                                    handleRejectField(
                                                      key,
                                                      reviewProfile!.id,
                                                    );
                                                  if (e.key === "Escape") {
                                                    setRejectingField(null);
                                                    setRejectFieldComment("");
                                                  }
                                                }}
                                              />
                                              <button
                                                onClick={() =>
                                                  handleRejectField(
                                                    key,
                                                    reviewProfile!.id,
                                                  )
                                                }
                                                disabled={
                                                  !rejectFieldComment.trim() ||
                                                  actionLoading ===
                                                    "reject-" + key
                                                }
                                                className="px-2 py-1 bg-red-500 text-white text-[10px] font-medium rounded hover:bg-red-400 disabled:opacity-50 transition-colors"
                                              >
                                                {actionLoading ===
                                                "reject-" + key ? (
                                                  <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                  "Send"
                                                )}
                                              </button>
                                              <button
                                                onClick={() => {
                                                  setRejectingField(null);
                                                  setRejectFieldComment("");
                                                }}
                                                className="px-1.5 py-1 text-gray-500 hover:text-white text-[10px] transition-colors"
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          ) : (
                                            <div className="flex items-center gap-2 mt-2">
                                              <button
                                                onClick={() =>
                                                  handleAcceptField(
                                                    key,
                                                    reviewProfile!.id,
                                                    unresolvedComments,
                                                  )
                                                }
                                                disabled={
                                                  actionLoading !== null
                                                }
                                                className="px-2.5 py-1 bg-green-500/20 text-green-400 text-[10px] font-medium rounded-md hover:bg-green-500/30 border border-green-500/20 transition-colors disabled:opacity-50 flex items-center gap-1"
                                              >
                                                <CheckCircle2 className="w-3 h-3" />{" "}
                                                Accept
                                              </button>
                                              <button
                                                onClick={() => {
                                                  setRejectingField(key);
                                                  setRejectFieldComment("");
                                                }}
                                                className="px-2.5 py-1 bg-red-500/20 text-red-400 text-[10px] font-medium rounded-md hover:bg-red-500/30 border border-red-500/20 transition-colors flex items-center gap-1"
                                              >
                                                <XCircle className="w-3 h-3" />{" "}
                                                Reject
                                              </button>
                                            </div>
                                          ))}
                                      </>
                                    );
                                  })()}
                                </div>
                              )}
                              {/* No-comments-yet path: surface a small Reject
                                  button (plus its inline input when active)
                                  so the admin can flag this field directly
                                  without going through a generic dropdown. */}
                              {!hasComments &&
                                !isAccepted &&
                                (rejectingField === key ? (
                                  <div className="mt-2 flex gap-1.5">
                                    <input
                                      type="text"
                                      value={rejectFieldComment}
                                      onChange={(e) =>
                                        setRejectFieldComment(e.target.value)
                                      }
                                      placeholder="Reason for rejection..."
                                      className="flex-1 px-2 py-1 bg-neutral-900 border border-red-500/30 rounded text-white text-[10px] focus:outline-none focus:border-red-400"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (
                                          e.key === "Enter" &&
                                          rejectFieldComment.trim()
                                        )
                                          handleRejectField(
                                            key,
                                            reviewProfile!.id,
                                          );
                                        if (e.key === "Escape") {
                                          setRejectingField(null);
                                          setRejectFieldComment("");
                                        }
                                      }}
                                    />
                                    <button
                                      onClick={() =>
                                        handleRejectField(
                                          key,
                                          reviewProfile!.id,
                                        )
                                      }
                                      disabled={
                                        !rejectFieldComment.trim() ||
                                        actionLoading === "reject-" + key
                                      }
                                      className="px-2 py-1 bg-red-500 text-white text-[10px] font-medium rounded hover:bg-red-400 disabled:opacity-50 transition-colors"
                                    >
                                      {actionLoading === "reject-" + key ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        "Send"
                                      )}
                                    </button>
                                    <button
                                      onClick={() => {
                                        setRejectingField(null);
                                        setRejectFieldComment("");
                                      }}
                                      className="px-1.5 py-1 text-gray-500 hover:text-white text-[10px] transition-colors"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  <div className="mt-2 flex items-center gap-2">
                                    {/* Accept surfaces only when there IS
                                        something to accept: the field visibly
                                        CHANGED against the review snapshot.
                                        Unchanged, uncommented fields don't
                                        need an accept — admin can hit the
                                        whole-profile Approve at the bottom.
                                        Backend creates a resolved
                                        ADMIN_COMMENT so the Accepted state
                                        survives a page refresh. */}
                                    {hasChanged && (
                                      <button
                                        onClick={() =>
                                          handleAcceptField(
                                            key,
                                            reviewProfile!.id,
                                            [],
                                          )
                                        }
                                        disabled={actionLoading !== null}
                                        className="px-2.5 py-1 bg-green-500/20 text-green-400 text-[10px] font-medium rounded-md hover:bg-green-500/30 border border-green-500/20 transition-colors disabled:opacity-50 flex items-center gap-1"
                                      >
                                        <CheckCircle2 className="w-3 h-3" />{" "}
                                        Accept
                                      </button>
                                    )}
                                    <button
                                      onClick={() => {
                                        setRejectingField(key);
                                        setRejectFieldComment("");
                                      }}
                                      className="px-2 py-0.5 bg-red-500/10 text-red-400/80 text-[10px] font-medium rounded hover:bg-red-500/20 hover:text-red-400 border border-red-500/15 transition-colors flex items-center gap-1"
                                    >
                                      <XCircle className="w-2.5 h-2.5" /> Reject
                                    </button>
                                  </div>
                                ))}
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>

                  {/* Documents — Compact Grid */}
                  {reviewProfile.documents && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5" /> Documents (
                          {reviewProfile.documents.length})
                        </h4>
                        {(() => {
                          const allDocTypes = [
                            "CR",
                            "VAT",
                            "CHAMBER_OF_COMMERCE",
                            "BALADY",
                            "NATIONAL_ADDRESS",
                            "IBAN_LETTER",
                          ];
                          const reviewDocCommentCount = allDocTypes.reduce(
                            (count, t) =>
                              count +
                              (reviewProfile.comments[t]?.filter(
                                (c) => !c.isResolved,
                              ).length || 0),
                            0,
                          );
                          if (reviewDocCommentCount > 0) {
                            return (
                              <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[10px] rounded-full font-medium border border-amber-500/20">
                                <AlertTriangle className="w-2.5 h-2.5" />{" "}
                                {reviewDocCommentCount} need
                                {reviewDocCommentCount === 1 ? "s" : ""}{" "}
                                attention
                              </span>
                            );
                          }
                          if (reviewProfile.allDocumentsUploaded) {
                            return (
                              <span className="flex items-center gap-1 px-2 py-0.5 bg-green-500/10 text-green-400 text-[10px] rounded-full font-medium border border-green-500/20">
                                <CheckCircle2 className="w-2.5 h-2.5" />{" "}
                                Complete
                              </span>
                            );
                          }
                          return (
                            <span className="px-2 py-0.5 bg-red-500/10 text-red-400 text-[10px] rounded-full font-medium border border-red-500/20">
                              {reviewProfile.missingDocuments?.length} missing
                            </span>
                          );
                        })()}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {reviewProfile.documents.map((doc) => {
                          // Full current-round comments (both live and resolved
                          // during this round). Includes post-submit view where
                          // partner-side submit resolves everything.
                          const docComments =
                            reviewProfile.comments[doc.type] || [];
                          const docUnresolved = docComments.filter(
                            (c) => !c.isResolved,
                          );
                          const isRejected =
                            docComments.some(isRejectionComment);
                          // Mirrors vendor: when admin rejected the doc and
                          // the partner has since re-uploaded a new file
                          // (detected via the backend's
                          // replacedSinceLastReview flag), flip to an
                          // "addressed" state. The flag uses the most recent
                          // unresolved rejection comment as the cutoff so it
                          // doesn't fire immediately after admin clicks
                          // Reject.
                          const isAddressed =
                            isRejected && !!doc.replacedSinceLastReview;
                          const isAccepted = isAcceptedInRound(docComments);
                          return (
                            <div
                              key={doc.type}
                              className={`p-3 rounded-xl border transition-all ${
                                !doc.uploaded
                                  ? "bg-red-500/5 border-red-500/15"
                                  : isAddressed || isAccepted
                                    ? "bg-emerald-500/5 border-emerald-500/20"
                                    : docComments.length > 0
                                      ? "bg-amber-500/5 border-amber-500/20"
                                      : "bg-neutral-800/50 border-neutral-800 hover:border-neutral-700"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div
                                    className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
                                      docComments.length > 0
                                        ? "bg-amber-500/20"
                                        : doc.uploaded
                                          ? "bg-green-500/20"
                                          : "bg-red-500/20"
                                    }`}
                                  >
                                    {docComments.length > 0 ? (
                                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                                    ) : doc.uploaded ? (
                                      <CheckCircle2 className="w-3 h-3 text-green-400" />
                                    ) : (
                                      <XCircle className="w-3 h-3 text-red-400" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs text-white font-medium truncate flex items-center gap-1.5 flex-wrap">
                                      {doc.label}
                                      {/* REPLACED badge — surfaces when the
                                          partner re-uploaded this doc after
                                          admin's last review action. */}
                                      {doc.replacedSinceLastReview && (
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[9px] rounded font-medium uppercase tracking-wider">
                                          <RefreshCw className="w-2 h-2" />
                                          Replaced
                                        </span>
                                      )}
                                      {isAccepted && (
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] rounded font-medium uppercase tracking-wider">
                                          <CheckCircle2 className="w-2 h-2" />
                                          Accepted
                                        </span>
                                      )}
                                    </p>
                                    <p className="text-[10px] text-gray-500 truncate">
                                      {doc.uploaded
                                        ? doc.fileName || "Uploaded"
                                        : "Missing"}
                                    </p>
                                  </div>
                                </div>
                                {doc.uploaded && doc.fileUrl && (
                                  <button
                                    onClick={() => openDocViewer(doc)}
                                    className="p-1 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors flex-shrink-0"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              {docComments.length > 0 && (
                                <div className="mt-2">
                                  {(() => {
                                    return (
                                      <>
                                        {docComments.map((c) => {
                                          const isRej = isRejectionComment(c);
                                          const dim = c.isResolved;
                                          return (
                                            <p
                                              key={c.id}
                                              className={`text-[10px] flex items-start gap-1 mb-1 ${isRej ? "text-red-400" : "text-amber-400"} ${dim ? "opacity-50" : ""}`}
                                            >
                                              {isRej ? (
                                                <XCircle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                              ) : (
                                                <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                              )}
                                              {stripRejectionPrefix(c.comment)}
                                            </p>
                                          );
                                        })}
                                        {isAddressed ? (
                                          <div className="mt-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-400 font-medium flex items-center gap-1.5">
                                            <CheckCircle2 className="w-3 h-3" />
                                            Partner uploaded a new file — please
                                            review the replacement above
                                          </div>
                                        ) : isRejected ? (
                                          <p className="mt-1 text-[10px] text-red-400/60 italic">
                                            Will be sent back when you click
                                            Request Changes
                                          </p>
                                        ) : null}
                                        {/* Accept/Reject controls hidden
                                            during rejected-without-replacement
                                            state; shown when isAddressed so
                                            admin can resolve or re-reject.
                                            Also hidden once the admin has
                                            per-item Accepted this doc. */}
                                        {(!isRejected || isAddressed) &&
                                          !isAccepted &&
                                          (rejectingField === doc.type ? (
                                            <div className="mt-2 flex gap-1.5">
                                              <input
                                                type="text"
                                                value={rejectFieldComment}
                                                onChange={(e) =>
                                                  setRejectFieldComment(
                                                    e.target.value,
                                                  )
                                                }
                                                placeholder="Reason for rejection..."
                                                className="flex-1 px-2 py-1 bg-neutral-900 border border-red-500/30 rounded text-white text-[10px] focus:outline-none focus:border-red-400"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                  if (
                                                    e.key === "Enter" &&
                                                    rejectFieldComment.trim()
                                                  )
                                                    handleRejectField(
                                                      doc.type,
                                                      reviewProfile!.id,
                                                    );
                                                  if (e.key === "Escape") {
                                                    setRejectingField(null);
                                                    setRejectFieldComment("");
                                                  }
                                                }}
                                              />
                                              <button
                                                onClick={() =>
                                                  handleRejectField(
                                                    doc.type,
                                                    reviewProfile!.id,
                                                  )
                                                }
                                                disabled={
                                                  !rejectFieldComment.trim() ||
                                                  actionLoading ===
                                                    "reject-" + doc.type
                                                }
                                                className="px-2 py-1 bg-red-500 text-white text-[10px] font-medium rounded hover:bg-red-400 disabled:opacity-50 transition-colors"
                                              >
                                                {actionLoading ===
                                                "reject-" + doc.type ? (
                                                  <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                  "Send"
                                                )}
                                              </button>
                                              <button
                                                onClick={() => {
                                                  setRejectingField(null);
                                                  setRejectFieldComment("");
                                                }}
                                                className="px-1.5 py-1 text-gray-500 hover:text-white text-[10px] transition-colors"
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          ) : (
                                            <div className="flex items-center gap-2 mt-2">
                                              <button
                                                onClick={() =>
                                                  handleAcceptField(
                                                    doc.type,
                                                    reviewProfile!.id,
                                                    docUnresolved,
                                                  )
                                                }
                                                disabled={
                                                  actionLoading !== null
                                                }
                                                className="px-2.5 py-1 bg-green-500/20 text-green-400 text-[10px] font-medium rounded-md hover:bg-green-500/30 border border-green-500/20 transition-colors disabled:opacity-50 flex items-center gap-1"
                                              >
                                                <CheckCircle2 className="w-3 h-3" />{" "}
                                                Accept
                                              </button>
                                              <button
                                                onClick={() => {
                                                  setRejectingField(doc.type);
                                                  setRejectFieldComment("");
                                                }}
                                                className="px-2.5 py-1 bg-red-500/20 text-red-400 text-[10px] font-medium rounded-md hover:bg-red-500/30 border border-red-500/20 transition-colors flex items-center gap-1"
                                              >
                                                <XCircle className="w-3 h-3" />{" "}
                                                Reject
                                              </button>
                                            </div>
                                          ))}
                                      </>
                                    );
                                  })()}
                                </div>
                              )}
                              {/* No-comments-yet Reject pill for partner
                                  docs — mirrors the input field pattern so
                                  admin can flag a clean doc directly. */}
                              {docComments.length === 0 &&
                                (rejectingField === doc.type ? (
                                  <div className="mt-2 flex gap-1.5">
                                    <input
                                      type="text"
                                      value={rejectFieldComment}
                                      onChange={(e) =>
                                        setRejectFieldComment(e.target.value)
                                      }
                                      placeholder="Reason for rejection..."
                                      className="flex-1 px-2 py-1 bg-neutral-900 border border-red-500/30 rounded text-white text-[10px] focus:outline-none focus:border-red-400"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (
                                          e.key === "Enter" &&
                                          rejectFieldComment.trim()
                                        )
                                          handleRejectField(
                                            doc.type,
                                            reviewProfile!.id,
                                          );
                                        if (e.key === "Escape") {
                                          setRejectingField(null);
                                          setRejectFieldComment("");
                                        }
                                      }}
                                    />
                                    <button
                                      onClick={() =>
                                        handleRejectField(
                                          doc.type,
                                          reviewProfile!.id,
                                        )
                                      }
                                      disabled={
                                        !rejectFieldComment.trim() ||
                                        actionLoading === "reject-" + doc.type
                                      }
                                      className="px-2 py-1 bg-red-500 text-white text-[10px] font-medium rounded hover:bg-red-400 disabled:opacity-50 transition-colors"
                                    >
                                      {actionLoading ===
                                      "reject-" + doc.type ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        "Send"
                                      )}
                                    </button>
                                    <button
                                      onClick={() => {
                                        setRejectingField(null);
                                        setRejectFieldComment("");
                                      }}
                                      className="px-1.5 py-1 text-gray-500 hover:text-white text-[10px] transition-colors"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setRejectingField(doc.type);
                                      setRejectFieldComment("");
                                    }}
                                    className="mt-2 px-2 py-0.5 bg-red-500/10 text-red-400/80 text-[10px] font-medium rounded hover:bg-red-500/20 hover:text-red-400 border border-red-500/15 transition-colors flex items-center gap-1"
                                  >
                                    <XCircle className="w-2.5 h-2.5" /> Reject
                                  </button>
                                ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* MOU */}
                  {reviewProfile.mou?.fileUrl && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                        MOU Document
                      </h4>
                      {(() => {
                        const mouComments = reviewProfile.comments["mou"] || [];
                        const mouUnresolved = mouComments.filter(
                          (c) => !c.isResolved,
                        );
                        const isRejected = mouComments.some(isRejectionComment);
                        // Backend flag set when partner re-uploaded MOU
                        // after admin's most recent unresolved rejection
                        // on "mou".
                        const isAddressed =
                          isRejected &&
                          !!reviewProfile.mou?.replacedSinceLastReview;
                        const isAccepted = isAcceptedInRound(mouComments);
                        return (
                          <>
                            <div
                              className={`p-3 rounded-xl border flex items-center justify-between ${
                                isAddressed || isAccepted
                                  ? "bg-emerald-500/5 border-emerald-500/20"
                                  : mouComments.length > 0
                                    ? "bg-amber-500/5 border-amber-500/20"
                                    : "bg-neutral-800/50 border-neutral-800"
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                    mouComments.length > 0
                                      ? "bg-amber-500/20"
                                      : "bg-green-500/20"
                                  }`}
                                >
                                  {mouComments.length > 0 ? (
                                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                                  ) : (
                                    <FileText className="w-4 h-4 text-green-400" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm text-white font-medium flex items-center gap-1.5 flex-wrap">
                                    MOU
                                    {/* REPLACED badge on partner MOU title —
                                        mirrors documents pattern. */}
                                    {reviewProfile.mou
                                      ?.replacedSinceLastReview && (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[9px] rounded font-medium uppercase tracking-wider">
                                        <RefreshCw className="w-2 h-2" />
                                        Replaced
                                      </span>
                                    )}
                                    {isAccepted && (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] rounded font-medium uppercase tracking-wider">
                                        <CheckCircle2 className="w-2 h-2" />
                                        Accepted
                                      </span>
                                    )}
                                  </p>
                                  {reviewProfile.mou!.expiryDate && (
                                    <p className="text-xs text-gray-500">
                                      Expires:{" "}
                                      {new Date(
                                        reviewProfile.mou!.expiryDate,
                                      ).toLocaleDateString()}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() =>
                                  setViewerDoc({
                                    url: reviewProfile.mou!.fileUrl!,
                                    title: "MOU",
                                    isPdf: isPdf(reviewProfile.mou!.fileUrl),
                                  })
                                }
                                className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </div>
                            {mouComments.length > 0 && (
                              <div className="mt-2 pl-1">
                                {mouComments.map((c) => {
                                  const isRej = isRejectionComment(c);
                                  const dim = c.isResolved;
                                  return (
                                    <p
                                      key={c.id}
                                      className={`text-[10px] flex items-start gap-1 mb-1 ${isRej ? "text-red-400" : "text-amber-400"} ${dim ? "opacity-50" : ""}`}
                                    >
                                      {isRej ? (
                                        <XCircle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                      ) : (
                                        <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                      )}
                                      {stripRejectionPrefix(c.comment)}
                                    </p>
                                  );
                                })}
                                {isAddressed ? (
                                  <div className="mt-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-400 font-medium flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Partner uploaded a new MOU — please review
                                    the replacement above
                                  </div>
                                ) : isRejected ? (
                                  <p className="mt-1 text-[10px] text-red-400/60 italic">
                                    Will be sent back when you click Request
                                    Changes
                                  </p>
                                ) : null}
                                {/* Accept/Reject hidden while rejected-
                                    without-replacement; shown when
                                    addressed so admin can decide. */}
                                {(!isRejected || isAddressed) &&
                                  !isAccepted &&
                                  (rejectingField === "mou" ? (
                                    <div className="mt-2 flex gap-1.5">
                                      <input
                                        type="text"
                                        value={rejectFieldComment}
                                        onChange={(e) =>
                                          setRejectFieldComment(e.target.value)
                                        }
                                        placeholder="Reason for rejection..."
                                        className="flex-1 px-2 py-1 bg-neutral-900 border border-red-500/30 rounded text-white text-[10px] focus:outline-none focus:border-red-400"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (
                                            e.key === "Enter" &&
                                            rejectFieldComment.trim()
                                          )
                                            handleRejectField(
                                              "mou",
                                              reviewProfile!.id,
                                            );
                                          if (e.key === "Escape") {
                                            setRejectingField(null);
                                            setRejectFieldComment("");
                                          }
                                        }}
                                      />
                                      <button
                                        onClick={() =>
                                          handleRejectField(
                                            "mou",
                                            reviewProfile!.id,
                                          )
                                        }
                                        disabled={
                                          !rejectFieldComment.trim() ||
                                          actionLoading === "reject-mou"
                                        }
                                        className="px-2 py-1 bg-red-500 text-white text-[10px] font-medium rounded hover:bg-red-400 disabled:opacity-50 transition-colors"
                                      >
                                        {actionLoading === "reject-mou" ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                          "Send"
                                        )}
                                      </button>
                                      <button
                                        onClick={() => {
                                          setRejectingField(null);
                                          setRejectFieldComment("");
                                        }}
                                        className="px-1.5 py-1 text-gray-500 hover:text-white text-[10px] transition-colors"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 mt-2">
                                      <button
                                        onClick={() =>
                                          handleAcceptField(
                                            "mou",
                                            reviewProfile!.id,
                                            mouUnresolved,
                                          )
                                        }
                                        disabled={actionLoading !== null}
                                        className="px-2.5 py-1 bg-green-500/20 text-green-400 text-[10px] font-medium rounded-md hover:bg-green-500/30 border border-green-500/20 transition-colors disabled:opacity-50 flex items-center gap-1"
                                      >
                                        <CheckCircle2 className="w-3 h-3" />{" "}
                                        Accept
                                      </button>
                                      <button
                                        onClick={() => {
                                          setRejectingField("mou");
                                          setRejectFieldComment("");
                                        }}
                                        className="px-2.5 py-1 bg-red-500/20 text-red-400 text-[10px] font-medium rounded-md hover:bg-red-500/30 border border-red-500/20 transition-colors flex items-center gap-1"
                                      >
                                        <XCircle className="w-3 h-3" /> Reject
                                      </button>
                                    </div>
                                  ))}
                              </div>
                            )}
                            {/* No-comments-yet Reject pill for partner MOU. */}
                            {mouComments.length === 0 &&
                              (rejectingField === "mou" ? (
                                <div className="mt-2 pl-1 flex gap-1.5">
                                  <input
                                    type="text"
                                    value={rejectFieldComment}
                                    onChange={(e) =>
                                      setRejectFieldComment(e.target.value)
                                    }
                                    placeholder="Reason for rejection..."
                                    className="flex-1 px-2 py-1 bg-neutral-900 border border-red-500/30 rounded text-white text-[10px] focus:outline-none focus:border-red-400"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (
                                        e.key === "Enter" &&
                                        rejectFieldComment.trim()
                                      )
                                        handleRejectField(
                                          "mou",
                                          reviewProfile!.id,
                                        );
                                      if (e.key === "Escape") {
                                        setRejectingField(null);
                                        setRejectFieldComment("");
                                      }
                                    }}
                                  />
                                  <button
                                    onClick={() =>
                                      handleRejectField(
                                        "mou",
                                        reviewProfile!.id,
                                      )
                                    }
                                    disabled={
                                      !rejectFieldComment.trim() ||
                                      actionLoading === "reject-mou"
                                    }
                                    className="px-2 py-1 bg-red-500 text-white text-[10px] font-medium rounded hover:bg-red-400 disabled:opacity-50"
                                  >
                                    {actionLoading === "reject-mou" ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      "Send"
                                    )}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setRejectingField(null);
                                      setRejectFieldComment("");
                                    }}
                                    className="px-1.5 py-1 text-gray-500 hover:text-white text-[10px]"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <div className="mt-2 pl-1">
                                  <button
                                    onClick={() => {
                                      setRejectingField("mou");
                                      setRejectFieldComment("");
                                    }}
                                    className="px-2 py-0.5 bg-red-500/10 text-red-400/80 text-[10px] font-medium rounded hover:bg-red-500/20 hover:text-red-400 border border-red-500/15 transition-colors flex items-center gap-1"
                                  >
                                    <XCircle className="w-2.5 h-2.5" /> Reject
                                  </button>
                                </div>
                              ))}
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* Actions */}
                  {(() => {
                    const blockReasons = getApprovalBlockReasons(reviewProfile);
                    const canApprove = blockReasons.length === 0;
                    // Only surface the Accept-All panel when there's something
                    // safe to bulk-accept: unresolved comments that are NOT
                    // admin rejections. Rejections must go back to the partner
                    // via Request Changes; bulk-accepting them would silently
                    // "un-reject" the field without notifying the partner.
                    const bulkAcceptable = Object.values(reviewProfile.comments)
                      .flat()
                      .filter((c) => !c.isResolved && !isRejectionComment(c));
                    const bulkAcceptableCount = bulkAcceptable.length;
                    const hasBulkAcceptable = bulkAcceptableCount > 0;
                    return (
                      <div className="space-y-3 pt-2">
                        {hasBulkAcceptable && (
                          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex-1">
                                <p className="text-sm text-white font-medium">
                                  {bulkAcceptableCount} unresolved comment
                                  {bulkAcceptableCount > 1 ? "s" : ""}
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  Accept individual changes above, or resolve
                                  all at once
                                </p>
                              </div>
                              <button
                                onClick={() =>
                                  handleResolveAllComments(reviewProfile.id)
                                }
                                disabled={actionLoading === "resolve-all"}
                                className="px-4 py-2.5 bg-blue-500 text-white text-sm font-semibold rounded-lg hover:bg-blue-400 disabled:opacity-50 flex items-center gap-2 transition-colors whitespace-nowrap"
                              >
                                {actionLoading === "resolve-all" ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-4 h-4" />
                                )}
                                Accept All
                              </button>
                            </div>
                          </div>
                        )}
                        {!canApprove && !hasBulkAcceptable && (
                          <div className="p-3 bg-red-500/5 border border-red-500/15 rounded-xl">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                              Approval blocked
                            </p>
                            {blockReasons.map((reason, i) => (
                              <p
                                key={i}
                                className="text-xs text-red-400 flex items-center gap-1.5 mb-1"
                              >
                                <XCircle className="w-3 h-3 flex-shrink-0" />{" "}
                                {reason}
                              </p>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleApprove(reviewProfile.id)}
                            disabled={
                              !canApprove || actionLoading === reviewProfile.id
                            }
                            className="flex-1 py-2.5 bg-green-500 text-white text-sm font-semibold rounded-xl hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Approve
                          </button>
                          <button
                            onClick={() => {
                              if (reviewProfile.unresolvedCommentCount === 0) {
                                showNotification(
                                  "error",
                                  "Please add at least one comment before requesting changes — the partner needs to know what to fix",
                                );
                                return;
                              }
                              handleRequestChanges(reviewProfile.id);
                            }}
                            disabled={actionLoading === reviewProfile.id}
                            className="flex-1 py-2.5 bg-amber-500 text-black text-sm font-semibold rounded-xl hover:bg-amber-400 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                          >
                            <MessageSquare className="w-4 h-4" /> Request
                            Changes
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingReviews.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                      <p className="text-white">No pending reviews</p>
                    </div>
                  ) : (
                    pendingReviews.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleOpenReviewProfile(p.id)}
                        className="w-full text-left bg-neutral-800 border border-neutral-700 rounded-xl p-4 hover:border-purple-500/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center">
                              <Briefcase className="w-5 h-5 text-purple-400" />
                            </div>
                            <div>
                              <p className="text-white font-medium">
                                {p.companyName}
                              </p>
                              <p className="text-xs text-gray-500">
                                {p.contactPerson || "—"} · Submitted{" "}
                                {p.submittedAt
                                  ? new Date(p.submittedAt).toLocaleDateString()
                                  : "—"}
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-500" />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============== FULL-SCREEN DOCUMENT VIEWER ============== */}
      {/* ============== DOCUMENT VIEWER ============== */}
      {viewerDoc && (
        <DocumentViewer
          url={viewerDoc.url}
          title={viewerDoc.title}
          onClose={() => setViewerDoc(null)}
        />
      )}
      {/* ============== REJECT CHANGE REQUEST MODAL ============== */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => {
              setShowRejectModal(null);
              setRejectNote("");
            }}
          />
          <div className="relative w-full max-w-md mx-4 bg-neutral-900 border border-neutral-800 rounded-xl">
            <div className="p-5 border-b border-neutral-800">
              <h3 className="text-white font-semibold">
                Reject Change Request
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                Provide a reason for rejection — the partner will see this
              </p>
            </div>
            <div className="p-5">
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={3}
                placeholder="e.g. The requested changes are not applicable at this time..."
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-red-500/50 resize-none"
              />
            </div>
            <div className="flex gap-3 p-5 border-t border-neutral-800">
              <button
                onClick={() => {
                  setShowRejectModal(null);
                  setRejectNote("");
                }}
                className="flex-1 px-4 py-2.5 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRejectChangeRequest(showRejectModal)}
                disabled={
                  !rejectNote.trim() || actionLoading === showRejectModal
                }
                className="flex-1 px-4 py-2.5 bg-red-500 text-white font-medium rounded-lg hover:bg-red-400 disabled:opacity-50 transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============== UNSUSPEND MODAL ==============
          Optional admin reason for the audit trail. Backend's
          manualUnsuspendPartner endpoint captures the reason alongside
          unpaid invoice IDs at unsuspend time, so the trace stays
          complete even when admin unsuspends a partner who still has
          outstanding balances. The reason is optional — most unsuspends
          are routine and don't need context. */}
      {showUnsuspendModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => {
              if (actionLoading !== showUnsuspendModal) {
                setShowUnsuspendModal(null);
                setUnsuspendReason("");
              }
            }}
          />
          <div className="relative w-full max-w-md mx-4 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl">
            <div className="p-5 border-b border-neutral-800 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Unsuspend Partner
                </h3>
                <p className="text-sm text-gray-400 mt-0.5">
                  {selectedPartner?.companyName}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowUnsuspendModal(null);
                  setUnsuspendReason("");
                }}
                disabled={actionLoading === showUnsuspendModal}
                className="p-1 text-gray-400 hover:text-white disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-300">
                  Any unpaid invoices at this moment will be captured in the
                  audit log. If invoices remain unpaid, the partner may be
                  auto-suspended again on the 6th of next month.
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Reason (optional)
                </label>
                <textarea
                  value={unsuspendReason}
                  onChange={(e) => setUnsuspendReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Payment received offline; partner promised settlement by EOD..."
                  disabled={actionLoading === showUnsuspendModal}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500/50 resize-none disabled:opacity-50"
                />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-neutral-800">
              <button
                onClick={() => {
                  setShowUnsuspendModal(null);
                  setUnsuspendReason("");
                }}
                disabled={actionLoading === showUnsuspendModal}
                className="flex-1 px-4 py-2.5 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  handleUnsuspend(showUnsuspendModal, unsuspendReason)
                }
                disabled={actionLoading === showUnsuspendModal}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 text-white font-medium rounded-lg hover:bg-green-400 disabled:opacity-50 transition-colors"
              >
                {actionLoading === showUnsuspendModal ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Unsuspend
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============== SUSPEND MODAL ==============
          Reason is REQUIRED — backend enforces >= 5 chars. The partner
          reads this verbatim on their locked dashboard, so admin can't
          shrug in a stub value. Includes a warning about downstream
          effects (login remains active but every API call is gated;
          accepted bookings continue to completion). */}
      {showSuspendModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => {
              if (actionLoading !== showSuspendModal) {
                setShowSuspendModal(null);
                setSuspendReason("");
              }
            }}
          />
          <div className="relative w-full max-w-md mx-4 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl">
            <div className="p-5 border-b border-neutral-800 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Suspend Partner
                </h3>
                <p className="text-sm text-gray-400 mt-0.5">
                  {selectedPartner?.companyName ||
                    partners.find((p) => p.id === showSuspendModal)
                      ?.companyName}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowSuspendModal(null);
                  setSuspendReason("");
                }}
                disabled={actionLoading === showSuspendModal}
                className="p-1 text-gray-400 hover:text-white disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-red-300 space-y-1">
                  <p>
                    The partner will lose access to the portal (except the
                    account-suspended screen). They will see the reason below
                    verbatim.
                  </p>
                  <p>Bookings already accepted will continue to completion.</p>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Reason <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  rows={4}
                  placeholder="e.g. Repeated failure to fulfill accepted bookings. Please contact admin to discuss."
                  disabled={actionLoading === showSuspendModal}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-red-500/50 resize-none disabled:opacity-50"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  Minimum 5 characters. Shown to the partner on their locked
                  dashboard.
                </p>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-neutral-800">
              <button
                onClick={() => {
                  setShowSuspendModal(null);
                  setSuspendReason("");
                }}
                disabled={actionLoading === showSuspendModal}
                className="flex-1 px-4 py-2.5 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSuspend(showSuspendModal, suspendReason)}
                disabled={
                  actionLoading === showSuspendModal ||
                  suspendReason.trim().length < 5
                }
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 text-white font-medium rounded-lg hover:bg-red-400 disabled:opacity-50 transition-colors"
              >
                {actionLoading === showSuspendModal ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Ban className="w-4 h-4" />
                )}
                Suspend
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
