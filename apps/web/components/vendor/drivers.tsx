"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { vendorApi, uploadApi } from "@/lib/api";
import ImageCropper from "@/components/ui/image-cropper";
import DocumentViewer from "@/components/ui/document-viewer";
import {
  User,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
  Upload,
  Edit2,
  Trash2,
  Eye,
  Phone,
  Mail,
  Car,
  Camera,
  CheckCircle,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Loader2,
  Save,
  Send,
  Star,
  RotateCcw,
  ShieldCheck,
  Shirt,
  SwitchCamera,
  Clock,
  Pause,
  PenLine,
  ShieldAlert,
} from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { useNotification } from "@/lib/notification-context";
import {
  PhoneInput,
  EmailInput,
  SaudiIdInput,
} from "@/components/ui/form-fields";

import { proxiedImageUrl } from "@/lib/image-url";
// ============== TYPES ==============

interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  phone: string;
  status: string;
  statusLabel?: string;
  isActive: boolean;
  suspendedForDocs?: boolean;
  rating: number | null;
  photoUrl: string | null;
  assignedVehicle: { id: string; label: string; category: string } | null;
  hasExpiredDocs: boolean;
  expiredDocCount?: number;
  expiringSoonDocCount?: number;
  expiringDocs?: Array<{
    type: string;
    label: string;
    expiryDate: string | null;
  }>;
  expiredDocs?: Array<{
    type: string;
    label: string;
    expiryDate: string | null;
  }>;
  nextExpiryDate?: string | null;
  nextExpiringDocLabel?: string | null;
  hasUnresolvedReview: boolean;
  createdAt: string;
}

interface DriverDocument {
  type: string;
  label: string;
  isUploaded: boolean;
  fileUrl: string | null;
  // Stable raw GCS path — used for snapshot-diff comparisons. See
  // partner/profile-panel for the same field's rationale: fileUrl is a
  // signed URL that rotates per request, so it can't be used to decide
  // "has this doc been replaced?" on the client side.
  filePath: string | null;
  fileName: string | null;
  expiryDate: string | null;
  isExpired: boolean;
  requiresExpiry: boolean;
  uploadedAt: string | null;
}

interface DriverDetail {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  phone: string;
  nationalId: string | null;
  licenseNumber: string | null;
  photoUrl: string | null;
  rating: number | null;
  isActive: boolean;
  suspendedForDocs?: boolean;
  status: string;
  statusLabel?: string;
  canBeAssigned?: boolean;
  completedTrips?: number;
  documents: DriverDocument[];
  allDocumentsUploaded: boolean;
  missingDocuments: string[];
  expiredDocuments: string[];
  assignedVehicle: {
    id: string;
    label: string;
    make: string;
    model: string;
    year: number;
    plateNumber: string;
    color: string | null;
    category: string;
  } | null;
  unresolvedReviews?: Array<{
    id: string;
    fields: string[];
    fieldLabels?: string[];
    message: string;
    createdAt: string;
  }>;
  hasUnresolvedReviews?: boolean;
  reviewComments?: Array<{
    id: string;
    fieldName: string;
    comment: string;
    createdAt: string;
  }>;
  editableFields?: string[] | null;
  editSnapshot?: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

interface AvailableVehicle {
  id: string;
  name: string;
  plateNumber: string;
  category: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface VerificationResult {
  passed: boolean;
  message: string;
  detections?: {
    faceDetected: boolean;
    shirtDetected: boolean;
    tieDetected: boolean;
  };
}

interface VendorDriversProps {
  refreshBadges: () => void;
  // Vendor status used to gate write actions: only APPROVED vendors can add
  // new drivers, submit driver change requests, or resubmit drivers for review.
  // Viewing drivers, drafts, and CHANGES_REQUESTED details remains open.
  vendorStatus?: string | null;
  // Required profile docs that are past their expiry. When non-empty, driver
  // write actions are locked even with vendorStatus === APPROVED.
  expiredRequiredDocs?: Array<{
    type: string;
    label: string;
    expiryDate: string;
  }>;
}

// ============== HELPERS ==============

function getStatusColor(status: string) {
  switch (status) {
    case "DRAFT":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "APPROVED":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "PENDING_REVIEW":
      return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    case "CHANGES_REQUESTED":
      return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    default:
      return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  }
}

// Detail-banner styling: maps each driver status to its icon, text color, and
// banner background. Mirrors fleet's STATUS_CONFIG so the two sections look
// consistent. The banner replaces the older "status pill + Active pill" combo
// (which produced a duplicate 'Active' label when APPROVED + isActive=true).
const STATUS_CONFIG: Record<
  string,
  { color: string; bgColor: string; icon: typeof CheckCircle }
> = {
  DRAFT: {
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/30",
    icon: PenLine,
  },
  PENDING_REVIEW: {
    color: "text-purple-400",
    bgColor: "bg-purple-500/10 border-purple-500/30",
    icon: Clock,
  },
  APPROVED: {
    color: "text-green-400",
    bgColor: "bg-green-500/10 border-green-500/30",
    icon: ShieldCheck,
  },
  CHANGES_REQUESTED: {
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/30",
    icon: AlertTriangle,
  },
};

function formatStatus(status: string) {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ============== DOC EXPIRY INDICATOR ==============
// Hover-popover variant: a single pill on the entity card or detail panel.
// On hover (desktop) or tap (mobile), opens a generous popover listing each
// affected document with its expiry date, days remaining, and a colour-coded
// urgency chip. Uses position:fixed with a manually-computed bounding rect
// so the popover is never clipped by ancestor `overflow:hidden` (the
// card's outer wrapper has that for rounded corners) and respects viewport
// edges on narrow mobile screens.

type ExpiryDoc = { type: string; label: string; expiryDate: string | null };

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function shortDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ExpiryDocRow({ doc, expired }: { doc: ExpiryDoc; expired: boolean }) {
  const days = daysUntil(doc.expiryDate);
  let chipClass = "bg-amber-500/15 text-amber-300 border-amber-500/30";
  let chipText: string;
  if (expired || (days !== null && days <= 0)) {
    chipClass = "bg-red-500/20 text-red-300 border-red-500/40";
    chipText = days !== null && days < 0 ? `${Math.abs(days)}d ago` : "Expired";
  } else if (days !== null && days <= 7) {
    chipClass = "bg-red-500/15 text-red-300 border-red-500/30";
    chipText = `${days}d left`;
  } else if (days !== null && days <= 14) {
    chipClass = "bg-orange-500/15 text-orange-300 border-orange-500/30";
    chipText = `${days}d left`;
  } else if (days !== null) {
    chipClass = "bg-amber-500/15 text-amber-300 border-amber-500/30";
    chipText = `${days}d left`;
  } else {
    chipText = "—";
  }
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-sm text-white truncate">{doc.label}</p>
        <p className="text-[11px] text-gray-500">{shortDate(doc.expiryDate)}</p>
      </div>
      <span
        className={`px-2 py-0.5 text-[11px] rounded border whitespace-nowrap ${chipClass}`}
      >
        {chipText}
      </span>
    </div>
  );
}

function DocExpiryIndicator({
  expiringDocs,
  expiredDocs,
  onRequestChanges,
}: {
  expiringDocs?: ExpiryDoc[];
  expiredDocs?: ExpiryDoc[];
  // Callback receives the list of affected doc types so the parent can
  // pre-select them in the change-request modal.
  onRequestChanges?: (affectedDocTypes: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);

  const expired = expiredDocs ?? [];
  const expiring = expiringDocs ?? [];

  const computePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = Math.min(288, window.innerWidth - 16);
    const margin = 8;
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - popoverWidth - margin;
    }
    if (left < margin) left = margin;
    let top = rect.bottom + 8;
    const estimatedHeight = 240;
    if (top + estimatedHeight > window.innerHeight - margin) {
      const above = rect.top - estimatedHeight - 8;
      if (above >= margin) top = above;
    }
    setPos({ top, left, width: popoverWidth });
  };

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      const popover = document.getElementById("doc-expiry-popover");
      if (popover?.contains(target)) return;
      setOpen(false);
    };
    const handleReflow = () => computePosition();
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    window.addEventListener("scroll", handleReflow, true);
    window.addEventListener("resize", handleReflow);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      window.removeEventListener("scroll", handleReflow, true);
      window.removeEventListener("resize", handleReflow);
    };
  }, [open]);

  if (expired.length === 0 && expiring.length === 0) return null;

  const isExpired = expired.length > 0;
  const soonest = !isExpired
    ? [...expiring]
        .map((d) => ({ ...d, days: daysUntil(d.expiryDate) }))
        .filter((d): d is ExpiryDoc & { days: number } => d.days !== null)
        .sort((a, b) => a.days - b.days)[0]
    : null;

  const pillClass = isExpired
    ? "bg-red-500/15 text-red-400 border-red-500/40"
    : "bg-amber-500/10 text-amber-400 border-amber-500/30";
  const pillIcon = isExpired ? (
    <AlertCircle className="w-3 h-3" />
  ) : (
    <Clock className="w-3 h-3" />
  );
  const pillLabel = isExpired
    ? expired.length === 1
      ? `${expired[0].label} Expired`
      : `${expired.length} Documents Expired`
    : expiring.length === 1
      ? `${soonest!.label} — ${soonest!.days}d`
      : `${expiring.length} Expiring (${soonest!.days}d)`;

  const handleOpen = () => {
    computePosition();
    setOpen(true);
  };
  const handleClose = () => setOpen(false);

  return (
    <>
      <span
        ref={triggerRef}
        className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded border cursor-help ${pillClass}`}
        onMouseEnter={handleOpen}
        onMouseLeave={() => {
          setTimeout(() => {
            const popover = document.getElementById("doc-expiry-popover");
            if (popover && popover.matches(":hover")) return;
            setOpen(false);
          }, 120);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (open) handleClose();
          else handleOpen();
        }}
      >
        {pillIcon}
        {pillLabel}
      </span>

      {open && pos && (
        <div
          id="doc-expiry-popover"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: pos.width,
            maxHeight: "min(60vh, 420px)",
          }}
          className="z-[100] p-3 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-y-auto"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <div className="flex items-center justify-between mb-2 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {isExpired ? (
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              ) : (
                <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />
              )}
              <p className="text-xs font-medium text-white truncate">
                {isExpired ? "Expired Documents" : "Expiring Soon"}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
              className="p-0.5 text-gray-500 hover:text-white rounded"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-neutral-800">
            {expired.map((d) => (
              <ExpiryDocRow key={`exp-${d.type}`} doc={d} expired />
            ))}
            {expiring.map((d) => (
              <ExpiryDocRow key={`expg-${d.type}`} doc={d} expired={false} />
            ))}
          </div>

          <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
            Failure to update these documents will result in suspension.
          </p>

          {onRequestChanges && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const affected = [
                  ...expired.map((d) => d.type),
                  ...expiring.map((d) => d.type),
                ];
                onRequestChanges(affected);
                handleClose();
              }}
              className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-luxury-gold/20 text-luxury-gold border border-luxury-gold/30 rounded-lg text-xs font-medium hover:bg-luxury-gold/30 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              Request Changes
            </button>
          )}
        </div>
      )}
    </>
  );
}

function hasDocAttention(d: {
  expiringDocs?: ExpiryDoc[];
  expiredDocs?: ExpiryDoc[];
}): "expired" | "expiring" | null {
  if ((d.expiredDocs?.length ?? 0) > 0) return "expired";
  if ((d.expiringDocs?.length ?? 0) > 0) return "expiring";
  return null;
}

// ============== INLINE EXPIRY CHIP ==============
// Small chip rendered inline next to a specific document/field that's
// expired or expiring (e.g. on the document row, on the license number
// field). Renders nothing if the doc is fine (>30 days out).
function InlineExpiryChip({
  expiryDate,
  size = "sm",
}: {
  expiryDate: string | null;
  size?: "sm" | "xs";
}) {
  const days = daysUntil(expiryDate);
  if (days === null) return null;
  if (days > 30) return null;

  let chipClass: string;
  let chipText: string;
  let Icon = Clock;
  if (days < 0) {
    chipClass = "bg-red-500/20 text-red-300 border-red-500/40";
    chipText = `Expired ${Math.abs(days)}d ago`;
    Icon = AlertCircle;
  } else if (days === 0) {
    chipClass = "bg-red-500/20 text-red-300 border-red-500/40";
    chipText = "Expires today";
    Icon = AlertCircle;
  } else if (days <= 7) {
    chipClass = "bg-red-500/15 text-red-300 border-red-500/30";
    chipText = `${days}d left`;
  } else if (days <= 14) {
    chipClass = "bg-orange-500/15 text-orange-300 border-orange-500/30";
    chipText = `${days}d left`;
  } else {
    chipClass = "bg-amber-500/15 text-amber-300 border-amber-500/30";
    chipText = `${days}d left`;
  }
  const padding =
    size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]";
  return (
    <span
      className={`inline-flex items-center gap-1 ${padding} rounded border whitespace-nowrap ${chipClass}`}
    >
      <Icon className="w-3 h-3" />
      {chipText}
    </span>
  );
}

/** Convert a data-URL to a File object for upload. */
function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new File([arr], fileName, { type: mime });
}

// Labels for driver text-fields (mirrors backend DRIVER_EDITABLE_FIELDS)
const DRIVER_FIELD_LABELS: Record<string, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  phone: "Phone",
  nationalId: "National ID / Iqama",
  licenseNumber: "Driving Licence Number",
};

// ============== CHANGE REQUEST (port of fleet's flow) ==============
// Vendor → admin escalation for an APPROVED driver. Same data shape as the
// fleet's ChangeRequest. The vendor picks which fields they need to edit and
// provides a reason; admin then unlocks those fields on approval.

interface ChangeRequest {
  id: string;
  fields: string[];
  fieldLabels: string[];
  message: string;
  isResolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

// Field groups shown in the request modal. Keep keys aligned with backend
// editable-field codes + document-type codes.
const DRIVER_CHANGE_REQUEST_FIELD_GROUPS = [
  {
    section: "Personal Information",
    icon: User,
    fields: [
      { key: "firstName", label: "First Name" },
      { key: "lastName", label: "Last Name" },
      { key: "phone", label: "Phone Number" },
      { key: "nationalId", label: "National ID / Iqama" },
      { key: "licenseNumber", label: "Driving Licence Number" },
    ],
  },
  {
    section: "Photos",
    icon: Camera,
    fields: [{ key: "PROFILE_PHOTO", label: "Profile Photo" }],
  },
  {
    section: "Legal Documents",
    icon: FileText,
    fields: [
      { key: "IQAMA_NATIONAL_ID", label: "Iqama / National ID Document" },
      { key: "DRIVING_LICENSE", label: "Driving License Document" },
    ],
  },
];

// ============== MAIN COMPONENT ==============

export default function VendorDrivers({
  refreshBadges,
  vendorStatus,
  expiredRequiredDocs,
}: VendorDriversProps) {
  const { showNotification } = useNotification();

  // Doc-expiry is its own axis on top of vendorStatus. Same lock effect but
  // a more actionable banner pointing to the specific expired doc.
  const hasExpiredDocs = (expiredRequiredDocs?.length ?? 0) > 0;

  // Vendor must be APPROVED to perform write actions on the driver roster:
  // adding new drivers, submitting driver change requests, resubmitting after
  // admin rejection. Viewing remains open in all statuses.
  const canModifyDrivers = vendorStatus === "APPROVED" && !hasExpiredDocs;
  const driversLockReason = hasExpiredDocs
    ? `The following profile document${expiredRequiredDocs!.length > 1 ? "s have" : " has"} expired: ${expiredRequiredDocs!.map((d) => d.label).join(", ")}. Submit a profile change request to renew before modifying drivers.`
    : vendorStatus === "INVITED"
      ? "Complete and submit your profile to manage drivers"
      : vendorStatus === "CHANGES_REQUESTED"
        ? "Admin has requested profile changes — update your profile and resubmit before modifying drivers."
        : "Your profile must be approved before you can modify drivers.";

  // List state
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 9,
    total: 0,
    totalPages: 0,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);

  // Detail sidebar
  const [driverDetail, setDriverDetail] = useState<DriverDetail | null>(null);
  const [showDetailSidebar, setShowDetailSidebar] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Change-request modal — vendor escalates to admin to unlock fields for editing.
  // Mirrors fleet's flow. Lives here at component level so the modal can be opened
  // from multiple places (status banner popover, dedicated CTA in detail panel).
  const [showChangeRequestModal, setShowChangeRequestModal] = useState(false);
  const [changeRequestFields, setChangeRequestFields] = useState<string[]>([]);
  const [changeRequestReason, setChangeRequestReason] = useState("");
  const [submittingChangeRequest, setSubmittingChangeRequest] = useState(false);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);

  // Add sidebar — 2-step: Step 1 = Photo, Step 2 = Details + Documents
  const [showAddSidebar, setShowAddSidebar] = useState(false);
  const [addStep, setAddStep] = useState<1 | 2>(1);
  const [isSaving, setIsSaving] = useState(false);
  // When resuming a DRAFT driver, this is set. When creating fresh, it's null until
  // we transition from Step 1 → Step 2 (at which point the driver row is created).
  const [draftDriverId, setDraftDriverId] = useState<string | null>(null);
  // Tracks whether photo / iqama / license docs are already saved on the server for the draft.
  // Used by Step 1 to know "this draft already has a verified photo, skip re-capture" and
  // by Step 2 to mark uploaded fields without forcing re-upload.
  const [draftDocsState, setDraftDocsState] = useState<{
    profilePhoto: {
      uploaded: boolean;
      fileUrl: string | null;
      fileName: string | null;
    };
    iqama: {
      uploaded: boolean;
      fileUrl: string | null;
      fileName: string | null;
      expiryDate: string | null;
    };
    license: {
      uploaded: boolean;
      fileUrl: string | null;
      fileName: string | null;
      expiryDate: string | null;
    };
  }>({
    profilePhoto: { uploaded: false, fileUrl: null, fileName: null },
    iqama: { uploaded: false, fileUrl: null, fileName: null, expiryDate: null },
    license: {
      uploaded: false,
      fileUrl: null,
      fileName: null,
      expiryDate: null,
    },
  });
  const [driverForm, setDriverForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    nationalId: "",
    licenseNumber: "",
  });

  // Step 2 document file pickers — null if user hasn't picked a new file for the field
  // (existing draft uploads are tracked in draftDocsState above)
  const [iqamaFile, setIqamaFile] = useState<File | null>(null);
  const [iqamaExpiry, setIqamaExpiry] = useState("");
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [licenseExpiry, setLicenseExpiry] = useState("");

  // Inline field editing inside detail panel
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingFieldValue, setEditingFieldValue] = useState<string>("");
  const [savingField, setSavingField] = useState(false);

  // Pending driver-document upload state. When the user picks a file
  // for a doc that requires an expiry date (IQAMA_NATIONAL_ID,
  // DRIVING_LICENSE), the file is held in this map (keyed by doc.type)
  // until they fill in the date and confirm. The previous code used a
  // native `prompt("Enter expiry date...")` which was awful UX — no
  // calendar, no validation, no way to back out. Mirrors the
  // pendingFile / inline-date-picker pattern used in vendor/fleet.tsx
  // and vendor/profile.tsx.
  const [pendingDocFile, setPendingDocFile] = useState<Record<string, File>>(
    {},
  );
  const [pendingDocExpiry, setPendingDocExpiry] = useState<
    Record<string, string>
  >({});

  // Clears both the staged file and the staged date for a given doc
  // type. Called on Cancel and after a successful Continue.
  const clearPendingDoc = (docType: string) => {
    setPendingDocFile((p) => {
      const { [docType]: _f, ...rest } = p;
      return rest;
    });
    setPendingDocExpiry((p) => {
      const { [docType]: _e, ...rest } = p;
      return rest;
    });
  };

  // Camera & verification state
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [verificationState, setVerificationState] = useState<
    "idle" | "verifying" | "passed" | "failed"
  >("idle");
  const [verificationResult, setVerificationResult] =
    useState<VerificationResult | null>(null);
  const [verifiedPhotoFile, setVerifiedPhotoFile] = useState<File | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  // Where the camera was opened from: "add" sidebar or "detail" sidebar
  const [captureContext, setCaptureContext] = useState<"add" | "detail">("add");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Hidden file input for the "Upload Photo from Device" alternative
  // to the camera capture. Reuses the same verification pipeline
  // (POST /vendor/drivers/verify-photo → Google Cloud Vision).
  const photoUploadInputRef = useRef<HTMLInputElement>(null);

  // Document upload
  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);

  // Image cropper — for any image upload (skips PDFs, passes them
  // straight through). `aspect` is optional: when undefined the
  // cropper opens in preview-first mode, where the user sees the
  // image full and can choose Upload (as-is), Adjust (opt into
  // cropping), or Cancel. Matches the rest of the portal.
  const [cropperState, setCropperState] = useState<{
    imageSrc: string;
    onComplete: (blob: Blob) => void;
    aspect?: number;
    shape: "rect" | "round";
    title: string;
  } | null>(null);

  // Document viewer — preview images & PDFs inline (replaces opening new tab)
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerFileName, setViewerFileName] = useState<string | undefined>(
    undefined,
  );
  const [viewerTitle, setViewerTitle] = useState<string | undefined>(undefined);

  /** Auto-detect: if file is an image → open cropper; if PDF or other → pass through unchanged. */
  const handleFileWithCropper = (
    file: File,
    onReady: (f: File) => void,
    options?: { aspect?: number; shape?: "rect" | "round"; title?: string },
  ) => {
    if (!file.type.startsWith("image/")) {
      onReady(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCropperState({
        imageSrc: reader.result as string,
        onComplete: (blob: Blob) => {
          const f = new File([blob], file.name, { type: "image/jpeg" });
          setCropperState(null);
          onReady(f);
        },
        // No aspect default — undefined unlocks the preview-first
        // flow. The previous 16:9 default forced every driver
        // photo / iqama / license through Adjust mode, which is
        // friction for vendors who just want to upload the image
        // their camera produced. Callers can still pass an aspect
        // explicitly if a specific upload type needs it.
        aspect: options?.aspect,
        shape: options?.shape ?? "rect",
        title: options?.title ?? "Upload Image",
      });
    };
    reader.readAsDataURL(file);
  };

  const handleViewDocument = (
    fileUrl: string,
    fileName?: string,
    title?: string,
  ) => {
    setViewerUrl(fileUrl);
    setViewerFileName(fileName);
    setViewerTitle(title);
  };

  // Assign vehicle
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [availableVehicles, setAvailableVehicles] = useState<
    AvailableVehicle[]
  >([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    null,
  );
  const [isAssigning, setIsAssigning] = useState(false);

  // Action loading
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingDriverId, setDeletingDriverId] = useState<string | null>(null);
  const [deletingDriverName, setDeletingDriverName] = useState("");

  // ============== CAMERA HELPERS ==============

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      showNotification(
        "error",
        "Could not access the camera. Please allow camera permissions and try again.",
      );
      setShowCameraModal(false);
    }
  };

  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }
  }, [cameraStream]);

  const handleOpenCamera = (context: "add" | "detail") => {
    setCaptureContext(context);
    setCapturedPhoto(null);
    setVerificationState("idle");
    setVerificationResult(null);
    setVerifiedPhotoFile(null);
    setShowCameraModal(true);
  };

  /** Triggers the hidden file picker for the "Upload Photo from Device"
   * flow. Uses the same context tracking as the camera path so the
   * verified photo lands on the right sidebar (add / detail). */
  const handleTriggerUpload = (context: "add" | "detail") => {
    setCaptureContext(context);
    photoUploadInputRef.current?.click();
  };

  /** Handles file selection from the upload picker. Reads the file as
   * a data URL for preview (mirrors the camera-capture data-URL model
   * so the same preview UI works), then runs verification against the
   * SAME endpoint the camera flow uses — Google Cloud Vision checks
   * for face, formal shirt, and tie. */
  const handleUploadedPhoto = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    // Reset the input immediately so picking the same file twice in a
    // row still fires onChange the second time.
    e.target.value = "";
    if (!file) return;

    // Basic file-type guard. `accept="image/*"` handles most of this
    // at the OS picker level but a defensive check is cheap.
    if (!file.type.startsWith("image/")) {
      setVerificationState("failed");
      setVerificationResult({
        passed: false,
        message: "Please select an image file (JPG, PNG, etc).",
      });
      return;
    }
    // 10 MB ceiling — well above any reasonable phone photo, well
    // below anything that would time out on the verify endpoint.
    if (file.size > 10 * 1024 * 1024) {
      setVerificationState("failed");
      setVerificationResult({
        passed: false,
        message: "Photo is too large. Please use an image under 10 MB.",
      });
      return;
    }

    // Read to data URL for the preview <img>. Uses the SAME
    // capturedPhoto state as the camera flow so the verified/failed
    // preview cards render identically no matter the source.
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    setCapturedPhoto(dataUrl);
    setVerificationState("verifying");
    setVerificationResult(null);

    // Route through the exact same verify-photo endpoint the camera
    // path calls — no branching on server side, one source of truth
    // for what "verified" means (face + formal shirt + tie).
    try {
      const res = await vendorApi.verifyDriverPhoto(file);
      if (res.success && res.data) {
        setVerificationResult(res.data);
        if (res.data.passed) {
          setVerificationState("passed");
          setVerifiedPhotoFile(file);
        } else {
          setVerificationState("failed");
          setVerifiedPhotoFile(null);
        }
      } else {
        setVerificationState("failed");
        setVerificationResult({
          passed: false,
          message: "Verification failed. Please try again.",
        });
      }
    } catch (err: any) {
      setVerificationState("failed");
      setVerificationResult({
        passed: false,
        message:
          err?.message ||
          "Photo verification service is unavailable. Please try again.",
      });
    }
  };

  const handleCloseCamera = () => {
    stopCamera();
    setShowCameraModal(false);
    setCapturedPhoto(null);
    setVerificationState("idle");
    setVerificationResult(null);
  };

  const handleSwitchCamera = () => {
    stopCamera();
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  // Start camera when modal opens or facing mode changes
  useEffect(() => {
    if (showCameraModal && !capturedPhoto) {
      startCamera();
    }
    return () => {
      // Cleanup only when modal closes
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCameraModal, facingMode, capturedPhoto]);

  // Attach stream to video element
  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setCapturedPhoto(dataUrl);
    stopCamera();
  };

  const handleRetake = () => {
    setCapturedPhoto(null);
    setVerificationState("idle");
    setVerificationResult(null);
    setVerifiedPhotoFile(null);
    // Camera will restart via useEffect
  };

  // ============== VERIFICATION ==============

  const handleVerifyPhoto = async () => {
    if (!capturedPhoto) return;
    setVerificationState("verifying");
    setVerificationResult(null);

    try {
      const file = dataUrlToFile(capturedPhoto, "driver-photo.jpg");
      const res = await vendorApi.verifyDriverPhoto(file);

      if (res.success && res.data) {
        setVerificationResult(res.data);
        if (res.data.passed) {
          setVerificationState("passed");
          setVerifiedPhotoFile(file);
        } else {
          setVerificationState("failed");
          setVerifiedPhotoFile(null);
        }
      } else {
        setVerificationState("failed");
        setVerificationResult({
          passed: false,
          message: "Verification failed. Please try again.",
        });
      }
    } catch (err: any) {
      setVerificationState("failed");
      setVerificationResult({
        passed: false,
        message:
          err.message ||
          "Photo verification service is unavailable. Please try again.",
      });
    }
  };

  /** After verification passes: accept photo and close camera modal. */
  const handleAcceptVerifiedPhoto = () => {
    if (verificationState !== "passed" || !verifiedPhotoFile) return;
    setShowCameraModal(false);
    // The capturedPhoto (preview) and verifiedPhotoFile stay in state
    // for display + upload when saving
  };

  /** Upload verified photo to GCS and register it as PROFILE_PHOTO doc for a driver. */
  const uploadVerifiedPhoto = async (driverId: string) => {
    if (!verifiedPhotoFile) return;
    setIsUploadingPhoto(true);
    try {
      const signedRes = await uploadApi.getSignedUploadUrl({
        fileName: verifiedPhotoFile.name,
        fileType: verifiedPhotoFile.type,
        section: "vendors",
        folder: "drivers",
        entityId: driverId,
      });
      if (!signedRes.success || !signedRes.data)
        throw new Error("Failed to get upload URL");

      await fetch(signedRes.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": verifiedPhotoFile.type },
        body: verifiedPhotoFile,
      });

      await vendorApi.uploadDriverDocument(driverId, {
        type: "PROFILE_PHOTO",
        fileUrl: signedRes.data.filePath,
        fileName: verifiedPhotoFile.name,
      });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // ============== FETCH DRIVERS ==============

  const fetchDrivers = useCallback(
    async (page = 1) => {
      setIsLoading(true);
      try {
        const params: Record<string, any> = { page, limit: pagination.limit };
        if (searchQuery) params.search = searchQuery;
        if (statusFilter !== "all") params.status = statusFilter;

        const res = await vendorApi.getDrivers(params);
        if (res.success && res.data) {
          setDrivers(res.data.drivers || []);
          setPagination(
            res.data.pagination || {
              page: 1,
              limit: 9,
              total: 0,
              totalPages: 0,
            },
          );
        }
      } catch (err: any) {
        showNotification("error", err.message || "Failed to load drivers");
      } finally {
        setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchQuery, statusFilter, pagination.limit],
  );

  useEffect(() => {
    fetchDrivers(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => fetchDrivers(1), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Mark all driver-related notifications as read once the vendor actually engages with
  // this section (scrolls, clicks, key-presses) — NOT on bare mount. Mounting alone can
  // happen because the user just logged in and the app dropped them here, in which case
  // they haven't actually "opened" Drivers yet. Waiting for an interaction signal is the
  // simplest reliable proxy for "the vendor is now looking at this page."
  useEffect(() => {
    let cancelled = false;
    let didMark = false;
    const markRead = async () => {
      if (didMark || cancelled) return;
      didMark = true;
      teardown();
      try {
        await vendorApi.markAllNotificationsAsRead("drivers");
        if (!cancelled) refreshBadges();
      } catch {
        /* silent */
      }
    };
    const events = ["pointerdown", "keydown", "scroll", "wheel", "touchstart"];
    const teardown = () => {
      for (const e of events) window.removeEventListener(e, markRead);
    };
    for (const e of events)
      window.addEventListener(e, markRead, { once: true, passive: true });
    return () => {
      cancelled = true;
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============== VIEW DETAIL ==============

  const handleViewDetail = async (driverId: string) => {
    setIsLoadingDetail(true);
    setShowDetailSidebar(true);
    setEditingField(null);
    try {
      const res = await vendorApi.getDriver(driverId);
      if (res.success && res.data) {
        setDriverDetail(res.data);
        // Only APPROVED drivers can issue change requests; for others the
        // editing flow is governed by review status.
        if (res.data.status === "APPROVED") fetchDriverChangeRequests(driverId);
        else {
          setChangeRequests([]);
          setHasPendingRequest(false);
        }
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load driver");
      setShowDetailSidebar(false);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // ============== CHANGE REQUESTS ==============
  //
  // Vendor → admin escalation for editing fields on an APPROVED driver.
  // Mirrors fleet's pattern verbatim.

  const fetchDriverChangeRequests = async (driverId: string) => {
    try {
      const res = await vendorApi.getDriverChangeRequests(driverId);
      if (res.success && res.data) {
        setChangeRequests(res.data.requests || []);
        setHasPendingRequest(res.data.hasPending || false);
      }
    } catch {
      setChangeRequests([]);
      setHasPendingRequest(false);
    }
  };

  const handleSubmitChangeRequest = async () => {
    if (!driverDetail) return;
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
      const res = await vendorApi.requestDriverChanges(driverDetail.id, {
        fields: changeRequestFields,
        reason: changeRequestReason,
      });
      if (res.success) {
        showNotification(
          "success",
          "Change request submitted. Admin will review it shortly.",
        );
        setShowChangeRequestModal(false);
        setChangeRequestFields([]);
        setChangeRequestReason("");
        fetchDriverChangeRequests(driverDetail.id);
      }
    } catch (err: any) {
      showNotification(
        "error",
        err.message || "Failed to submit change request",
      );
    } finally {
      setSubmittingChangeRequest(false);
    }
  };

  // ============== ADD ==============

  const resetAddState = () => {
    setDriverForm({
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      nationalId: "",
      licenseNumber: "",
    });
    setCapturedPhoto(null);
    setVerifiedPhotoFile(null);
    setVerificationState("idle");
    setVerificationResult(null);
    setIqamaFile(null);
    setIqamaExpiry("");
    setLicenseFile(null);
    setLicenseExpiry("");
    setDraftDriverId(null);
    setDraftDocsState({
      profilePhoto: { uploaded: false, fileUrl: null, fileName: null },
      iqama: {
        uploaded: false,
        fileUrl: null,
        fileName: null,
        expiryDate: null,
      },
      license: {
        uploaded: false,
        fileUrl: null,
        fileName: null,
        expiryDate: null,
      },
    });
  };

  const handleOpenAdd = () => {
    resetAddState();
    setAddStep(1);
    setShowAddSidebar(true);
  };

  /** Reopen the Add wizard on an existing DRAFT driver, pre-populating saved state. */
  const handleResumeDraft = async (driverId: string) => {
    resetAddState();
    setShowAddSidebar(true);
    setIsSaving(true);
    try {
      const res = await vendorApi.getDriver(driverId);
      if (!res.success || !res.data) {
        showNotification("error", "Failed to load draft");
        setShowAddSidebar(false);
        return;
      }
      const d = res.data as DriverDetail;
      setDraftDriverId(d.id);
      setDriverForm({
        firstName: d.firstName || "",
        lastName: d.lastName || "",
        phone: d.phone || "",
        email: "",
        // Legacy drafts created before this feature landed will have
        // placeholder "0000000000" values from the photo-first
        // draft-creation path. Treat those as empty so the vendor sees
        // a blank required field, not a bogus fake number.
        nationalId:
          d.nationalId && d.nationalId !== "0000000000" ? d.nationalId : "",
        licenseNumber:
          d.licenseNumber && d.licenseNumber !== "0000000000"
            ? d.licenseNumber
            : "",
      });
      const photoDoc = d.documents.find((doc) => doc.type === "PROFILE_PHOTO");
      const iqamaDoc = d.documents.find(
        (doc) => doc.type === "IQAMA_NATIONAL_ID",
      );
      const licenseDoc = d.documents.find(
        (doc) => doc.type === "DRIVING_LICENSE",
      );
      setDraftDocsState({
        profilePhoto: {
          uploaded: !!photoDoc?.isUploaded,
          fileUrl: photoDoc?.fileUrl || null,
          fileName: photoDoc?.fileName || null,
        },
        iqama: {
          uploaded: !!iqamaDoc?.isUploaded,
          fileUrl: iqamaDoc?.fileUrl || null,
          fileName: iqamaDoc?.fileName || null,
          expiryDate: iqamaDoc?.expiryDate || null,
        },
        license: {
          uploaded: !!licenseDoc?.isUploaded,
          fileUrl: licenseDoc?.fileUrl || null,
          fileName: licenseDoc?.fileName || null,
          expiryDate: licenseDoc?.expiryDate || null,
        },
      });
      // Show captured photo preview if already uploaded
      if (photoDoc?.isUploaded && photoDoc.fileUrl) {
        setCapturedPhoto(photoDoc.fileUrl);
        setVerificationState("passed");
      }
      // Pre-fill expiry pickers from existing draft uploads
      if (iqamaDoc?.expiryDate)
        setIqamaExpiry(iqamaDoc.expiryDate.split("T")[0] || "");
      if (licenseDoc?.expiryDate)
        setLicenseExpiry(licenseDoc.expiryDate.split("T")[0] || "");
      // Decide where to resume:
      //   if PROFILE_PHOTO not yet uploaded → step 1
      //   else → step 2
      setAddStep(photoDoc?.isUploaded ? 2 : 1);
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load draft");
      setShowAddSidebar(false);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Persist the Step 1 boundary: ensure a DRAFT driver row exists and the verified
   * profile photo has been uploaded to it. Called when vendor clicks Continue on Step 1.
   * Once this returns, we have a draftDriverId and can transition to Step 2.
   */
  const ensureDraftWithPhoto = async (): Promise<string | null> => {
    setIsSaving(true);
    try {
      let id = draftDriverId;

      // If no draft yet, create one. We need at least firstName/lastName/phone, but
      // those aren't collected until Step 2 — so we use placeholders. The vendor will
      // overwrite them in Step 2 via inline edits or by completing the form.
      // Better approach: only create the draft AFTER Step 2 collects text fields.
      // But then we'd need to upload the photo immediately on submit, which is what
      // we want to avoid. Compromise: ask for firstName + phone in Step 1 too?
      // For now: postpone draft creation until Step 2 submit. Photo lives in client state
      // until then. This means closing the sidebar after Step 1 photo verification but
      // BEFORE filling Step 2 does lose the photo — but that's a much narrower failure
      // window than the original bug.

      // Actually the cleanest path: require firstName+lastName+phone in Step 1.
      // For minimal disruption to the existing UX though, we'll persist the photo by
      // creating the draft with empty placeholders if needed.

      if (!id) {
        // No draft yet. Need to create one. Use existing form values if present, else placeholders.
        // nationalId + licenseNumber are required by the backend so
        // we send obvious placeholder values here that will be
        // overwritten when the vendor fills in Step 2. The "0000000000"
        // and "PENDING-" prefixes make it visually obvious in the
        // admin panel if a vendor somehow ships a driver without
        // completing Step 2.
        const seed = {
          firstName: driverForm.firstName.trim() || "Draft",
          lastName: driverForm.lastName.trim() || "Driver",
          phone: driverForm.phone.trim() || `draft-${Date.now()}`,
          // Backend requires 10-digit format for both fields. Send
          // obvious all-zero placeholders when the vendor hasn't yet
          // filled Step 2 — the draft-load path treats "0000000000"
          // as empty so the vendor sees a clean required field
          // and can't ship a driver with placeholder identity data.
          nationalId: driverForm.nationalId.trim() || "0000000000",
          licenseNumber: driverForm.licenseNumber.trim() || "0000000000",
        };
        const created = await vendorApi.addDriver(seed);
        if (!created.success || !created.data?.id) {
          showNotification(
            "error",
            created.message || "Failed to create draft",
          );
          return null;
        }
        id = created.data.id;
        setDraftDriverId(id);
      }
      // Narrowing for the type system — id is definitely a string by here.
      const ensuredId: string = id!;

      // Upload the verified photo if vendor captured a new one this session
      if (verifiedPhotoFile) {
        await uploadVerifiedPhoto(ensuredId);
        setDraftDocsState((p) => ({
          ...p,
          profilePhoto: {
            uploaded: true,
            fileUrl: null,
            fileName: verifiedPhotoFile.name,
          },
        }));
      }

      return ensuredId;
    } catch (err: any) {
      showNotification("error", err.message || "Failed to save draft");
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  /** Step 2 submit — finalize the draft and submit for admin review. */
  const handleSaveNewDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    const iqamaReady =
      draftDocsState.iqama.uploaded || (!!iqamaFile && !!iqamaExpiry);
    const licenseReady =
      draftDocsState.license.uploaded || (!!licenseFile && !!licenseExpiry);
    if (!iqamaReady || !licenseReady) {
      showNotification(
        "error",
        "Please upload both National ID/Iqama and Driving License with their expiry dates",
      );
      return;
    }
    setIsSaving(true);
    try {
      // 1) Ensure we have a draft id (creates one if not yet created in Step 1)
      let id: string | null = draftDriverId;
      if (!id) {
        const created = await vendorApi.addDriver(driverForm);
        if (!created.success || !created.data?.id) {
          showNotification("error", created.message || "Failed to save driver");
          return;
        }
        id = created.data.id;
        setDraftDriverId(id);
      } else {
        // Update text fields on the existing draft to whatever's in the form now
        await vendorApi.updateDriver(id, driverForm);
      }
      // Hard guarantee for the type system: by here id must be a string.
      if (!id) {
        showNotification("error", "Could not establish draft driver id");
        return;
      }
      const driverId: string = id;

      // 2) Upload photo (if a fresh one was captured), IQAMA, License — only if new files exist
      const uploadOne = async (
        type: string,
        file: File,
        expiryDate?: string,
      ) => {
        const signedRes = await uploadApi.getSignedUploadUrl({
          fileName: file.name,
          fileType: file.type,
          section: "vendors",
          folder: "drivers",
          entityId: driverId,
        });
        if (!signedRes.success || !signedRes.data)
          throw new Error(`Failed to get upload URL for ${type}`);
        await fetch(signedRes.data.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        await vendorApi.uploadDriverDocument(driverId, {
          type,
          fileUrl: signedRes.data.filePath,
          fileName: file.name,
          expiryDate,
        });
      };

      const uploads: Array<{ label: string; promise: Promise<void> }> = [];
      if (verifiedPhotoFile && !draftDocsState.profilePhoto.uploaded) {
        uploads.push({
          label: "profile photo",
          promise: uploadVerifiedPhoto(driverId),
        });
      }
      if (iqamaFile) {
        uploads.push({
          label: "National ID / Iqama",
          promise: uploadOne("IQAMA_NATIONAL_ID", iqamaFile, iqamaExpiry),
        });
      }
      if (licenseFile) {
        uploads.push({
          label: "Driving License",
          promise: uploadOne("DRIVING_LICENSE", licenseFile, licenseExpiry),
        });
      }

      if (uploads.length > 0) {
        const results = await Promise.allSettled(uploads.map((u) => u.promise));
        const failed = results
          .map((r, i) => ({ r, label: uploads[i].label }))
          .filter((x) => x.r.status === "rejected");
        if (failed.length > 0) {
          const labels = failed.map((f) => f.label).join(", ");
          showNotification(
            "error",
            `Some uploads failed: ${labels}. The draft has been saved — you can retry from the card's Continue Setup button.`,
          );
          fetchDrivers(pagination.page);
          setShowAddSidebar(false);
          return;
        }
      }

      // 3) Submit for admin review (DRAFT → PENDING_REVIEW)
      const submitRes = await vendorApi.submitDriverForReview(driverId);
      if (!submitRes.success) {
        showNotification(
          "error",
          submitRes.message ||
            "Documents saved but submission failed. Use Continue Setup to retry.",
        );
        fetchDrivers(pagination.page);
        setShowAddSidebar(false);
        return;
      }

      showNotification("success", "Driver submitted for admin review");
      setShowAddSidebar(false);
      fetchDrivers(pagination.page);
      refreshBadges();
    } catch (err: any) {
      showNotification("error", err.message || "Failed to save driver");
    } finally {
      setIsSaving(false);
    }
  };

  // ============== INLINE FIELD EDIT (detail panel) ==============

  const handleSaveInlineField = async (
    driverId: string,
    fieldName: string,
    value: string,
  ) => {
    setSavingField(true);
    try {
      const data: any = {};
      if (fieldName === "firstName") data.firstName = value.trim();
      else if (fieldName === "lastName") data.lastName = value.trim();
      else if (fieldName === "phone") data.phone = value.trim();
      else if (fieldName === "nationalId") data.nationalId = value.trim();
      else if (fieldName === "licenseNumber") data.licenseNumber = value.trim();
      else {
        showNotification(
          "error",
          `Field "${fieldName}" cannot be edited inline`,
        );
        return;
      }
      const res = await vendorApi.updateDriver(driverId, data);
      if (res.success) {
        showNotification(
          "success",
          `${DRIVER_FIELD_LABELS[fieldName] || fieldName} updated`,
        );
        setEditingField(null);
        setEditingFieldValue("");
        await handleViewDetail(driverId);
        fetchDrivers(pagination.page);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to update");
    } finally {
      setSavingField(false);
    }
  };

  // ============== DELETE ==============

  const handleOpenDeleteConfirm = (driverId: string, driverName: string) => {
    setDeletingDriverId(driverId);
    setDeletingDriverName(driverName);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingDriverId) return;
    setActionLoading(deletingDriverId);
    try {
      const res = await vendorApi.deleteDriver(deletingDriverId);
      if (res.success) {
        showNotification("success", res.message || "Driver removed");
        setShowDetailSidebar(false);
        setShowDeleteConfirm(false);
        setDeletingDriverId(null);
        fetchDrivers(pagination.page);
        refreshBadges();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to delete driver");
    } finally {
      setActionLoading(null);
    }
  };

  // ============== TOGGLE ACTIVE ==============

  const handleToggleActive = async (driverId: string) => {
    setActionLoading(driverId);
    try {
      const res = await vendorApi.toggleDriverActive(driverId);
      if (res.success) {
        showNotification("success", res.message || "Status updated");
        fetchDrivers(pagination.page);
        if (driverDetail?.id === driverId) handleViewDetail(driverId);
        refreshBadges();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to update status");
    } finally {
      setActionLoading(null);
    }
  };

  // ============== ASSIGN VEHICLE ==============

  const handleOpenAssign = async () => {
    setShowAssignModal(true);
    setSelectedVehicleId(null);
    try {
      const res = await vendorApi.getAvailableVehicles();
      if (res.success && res.data)
        setAvailableVehicles(res.data.vehicles || []);
    } catch {
      setAvailableVehicles([]);
    }
  };

  const handleAssignVehicle = async () => {
    if (!driverDetail) return;
    setIsAssigning(true);
    try {
      const res = await vendorApi.assignVehicleToDriver(driverDetail.id, {
        vehicleId: selectedVehicleId,
      });
      if (res.success) {
        showNotification("success", res.message || "Vehicle assigned");
        setShowAssignModal(false);
        handleViewDetail(driverDetail.id);
        fetchDrivers(pagination.page);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to assign vehicle");
    } finally {
      setIsAssigning(false);
    }
  };

  // ============== SUBMIT FOR REVIEW ==============

  const handleSubmitForReview = async (driverId: string) => {
    setActionLoading(driverId);
    try {
      const res = await vendorApi.submitDriverForReview(driverId);
      if (res.success) {
        showNotification("success", res.message || "Submitted for review");
        if (driverDetail?.id === driverId) handleViewDetail(driverId);
        fetchDrivers(pagination.page);
        refreshBadges();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to submit");
    } finally {
      setActionLoading(null);
    }
  };

  // ============== DOCUMENT UPLOAD ==============

  const handleDocumentUpload = async (
    driverId: string,
    type: string,
    file: File,
    expiryDate?: string,
  ) => {
    setUploadingDocType(type);
    try {
      const signedRes = await uploadApi.getSignedUploadUrl({
        fileName: file.name,
        fileType: file.type,
        section: "vendors",
        folder: "drivers",
        entityId: driverId,
      });
      if (!signedRes.success || !signedRes.data)
        throw new Error("Failed to get upload URL");

      await fetch(signedRes.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      const res = await vendorApi.uploadDriverDocument(driverId, {
        type,
        fileUrl: signedRes.data.filePath,
        fileName: file.name,
        expiryDate,
      });

      if (res.success) {
        showNotification("success", res.message || "Document uploaded");
        handleViewDetail(driverId);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Upload failed");
    } finally {
      setUploadingDocType(null);
    }
  };

  /** Handle PROFILE_PHOTO upload from detail sidebar — opens camera instead of file picker. */
  const handleDetailPhotoCapture = () => {
    handleOpenCamera("detail");
  };

  /** After camera modal closes with a verified photo (detail context), upload it. */
  const handleDetailPhotoUpload = async () => {
    if (!verifiedPhotoFile || !driverDetail) return;
    setUploadingDocType("PROFILE_PHOTO");
    try {
      await uploadVerifiedPhoto(driverDetail.id);
      showNotification("success", "Profile photo uploaded");
      handleViewDetail(driverDetail.id);
      setCapturedPhoto(null);
      setVerifiedPhotoFile(null);
      setVerificationState("idle");
    } catch (err: any) {
      showNotification("error", err.message || "Photo upload failed");
    } finally {
      setUploadingDocType(null);
    }
  };

  // After camera modal closes with verified photo in detail context, trigger upload
  useEffect(() => {
    if (
      !showCameraModal &&
      captureContext === "detail" &&
      verificationState === "passed" &&
      verifiedPhotoFile &&
      driverDetail
    ) {
      handleDetailPhotoUpload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCameraModal]);

  // ============== RENDER ==============

  return (
    <div className="space-y-6">
      {/* Hidden file input for the "Upload Photo from Device" flow.
          Kept at the top of the tree so it's mounted regardless of
          which sidebar (add/detail) is currently open. Handler routes
          the file through the same verify-photo endpoint the camera
          path uses — one source of truth for "verified" driver photos. */}
      <input
        ref={photoUploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUploadedPhoto}
      />

      {/* Vendor-status lock banner — explains why write actions are disabled.
          Doc-expired variant takes precedence (more actionable). */}
      {!canModifyDrivers && (hasExpiredDocs || vendorStatus) && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 ${
            hasExpiredDocs
              ? "bg-red-500/5 border-red-500/20"
              : "bg-amber-500/5 border-amber-500/20"
          }`}
        >
          <ShieldAlert
            className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
              hasExpiredDocs ? "text-red-400" : "text-amber-400"
            }`}
          />
          <div className="flex-1">
            <p
              className={`text-sm font-medium ${
                hasExpiredDocs ? "text-red-400" : "text-amber-400"
              }`}
            >
              {hasExpiredDocs
                ? expiredRequiredDocs!.length === 1
                  ? `${expiredRequiredDocs![0].label} has expired`
                  : `${expiredRequiredDocs!.length} required documents have expired`
                : vendorStatus === "INVITED"
                  ? "Profile not yet submitted"
                  : vendorStatus === "PENDING_REVIEW"
                    ? "Profile under review"
                    : vendorStatus === "CHANGES_REQUESTED"
                      ? "Admin requested profile changes"
                      : "Driver modifications disabled"}
            </p>
            <p
              className={`text-xs mt-0.5 ${
                hasExpiredDocs ? "text-red-400/70" : "text-amber-400/70"
              }`}
            >
              {hasExpiredDocs
                ? `Renew the expired document${expiredRequiredDocs!.length > 1 ? "s" : ""} via the profile change-request flow. Driver viewing remains available but adding drivers and submitting change requests are disabled.`
                : "You can view your drivers, but adding new drivers, submitting change requests, and resubmitting for review are disabled until your profile is approved."}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search drivers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-sm focus:outline-none focus:border-luxury-gold/50"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-sm focus:outline-none focus:border-luxury-gold/50"
          >
            <option value="all">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="APPROVED">Approved</option>
            <option value="PENDING_REVIEW">Pending Review</option>
            <option value="CHANGES_REQUESTED">Changes Requested</option>
          </select>
        </div>
        <button
          onClick={() =>
            canModifyDrivers
              ? handleOpenAdd()
              : showNotification("warning", driversLockReason)
          }
          disabled={!canModifyDrivers}
          title={canModifyDrivers ? undefined : driversLockReason}
          className={`px-4 py-2.5 font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            canModifyDrivers
              ? "bg-luxury-gold text-black hover:bg-luxury-gold/90"
              : "bg-neutral-800 text-gray-500 cursor-not-allowed"
          }`}
        >
          {canModifyDrivers ? (
            <Plus className="w-4 h-4" />
          ) : (
            <ShieldAlert className="w-4 h-4" />
          )}
          Add Driver
        </button>
      </div>

      {/* ============== ATTENTION BANNERS ============== */}
      {!isLoading &&
        drivers.length > 0 &&
        (() => {
          const changesRequested = drivers.filter(
            (d) => d.status === "CHANGES_REQUESTED",
          );
          const suspendedForDocs = drivers.filter((d) => d.suspendedForDocs);
          const expiredDocs = drivers.filter(
            (d) => !d.suspendedForDocs && d.hasExpiredDocs,
          );
          const expiringSoon = drivers.filter(
            (d) =>
              !d.hasExpiredDocs &&
              !d.suspendedForDocs &&
              (d.expiringSoonDocCount || 0) > 0,
          );
          if (
            changesRequested.length === 0 &&
            suspendedForDocs.length === 0 &&
            expiredDocs.length === 0 &&
            expiringSoon.length === 0
          )
            return null;
          return (
            <div className="space-y-2">
              {changesRequested.length > 0 && (
                <div className="p-4 rounded-xl border bg-amber-500/5 border-amber-500/20 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-400">
                      Admin Requested Changes
                    </p>
                    <p className="text-xs text-amber-400/70 mt-0.5">
                      {changesRequested.map((d) => d.name).join(", ")} — review
                      and fix flagged fields, then resubmit.
                    </p>
                  </div>
                  {changesRequested.length === 1 && (
                    <button
                      onClick={() => handleViewDetail(changesRequested[0].id)}
                      className="px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-xs font-medium hover:bg-amber-500/30 transition-colors flex-shrink-0"
                    >
                      Review
                    </button>
                  )}
                </div>
              )}
              {suspendedForDocs.length > 0 && (
                <div className="p-4 rounded-xl border bg-red-500/10 border-red-500/40 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-400">
                      Driver Suspended
                    </p>
                    <p className="text-xs text-red-400/80 mt-0.5">
                      {suspendedForDocs.map((d) => d.name).join(", ")} —
                      suspended because one or more documents expired. Open the
                      driver and replace the expired document(s) to reactivate.
                    </p>
                  </div>
                  {suspendedForDocs.length === 1 && (
                    <button
                      onClick={() => handleViewDetail(suspendedForDocs[0].id)}
                      className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/30 transition-colors flex-shrink-0"
                    >
                      Open &amp; Update
                    </button>
                  )}
                </div>
              )}
              {expiredDocs.length > 0 && (
                <div className="p-4 rounded-xl border bg-red-500/5 border-red-500/20 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-400">
                      Expired Documents
                    </p>
                    <p className="text-xs text-red-400/70 mt-0.5">
                      {expiredDocs.map((d) => d.name).join(", ")} — update
                      expired documents to maintain eligibility.
                    </p>
                  </div>
                  {expiredDocs.length === 1 && (
                    <button
                      onClick={() => handleViewDetail(expiredDocs[0].id)}
                      className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/30 transition-colors flex-shrink-0"
                    >
                      Open &amp; Update
                    </button>
                  )}
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
                        .map((d) => {
                          const daysLeft = d.nextExpiryDate
                            ? Math.max(
                                0,
                                Math.ceil(
                                  (new Date(d.nextExpiryDate).getTime() -
                                    Date.now()) /
                                    (1000 * 60 * 60 * 24),
                                ),
                              )
                            : null;
                          const docPart = d.nextExpiringDocLabel
                            ? `${d.name} — ${d.nextExpiringDocLabel}`
                            : d.name;
                          return `${docPart}${daysLeft != null ? ` (${daysLeft}d)` : ""}`;
                        })
                        .join(", ")}{" "}
                      — renew before expiry to avoid suspension.
                    </p>
                  </div>
                  {expiringSoon.length === 1 && (
                    <button
                      onClick={() => handleViewDetail(expiringSoon[0].id)}
                      className="px-3 py-1.5 bg-yellow-500/20 text-yellow-400 rounded-lg text-xs font-medium hover:bg-yellow-500/30 transition-colors flex-shrink-0"
                    >
                      Open &amp; Update
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })()}

      {/* Loading */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
        </div>
      ) : drivers.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-12">
          <Empty>
            <EmptyMedia>
              <div className="w-24 h-24 bg-neutral-800 rounded-full flex items-center justify-center mb-4">
                <User className="w-12 h-12 text-gray-500" />
              </div>
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle className="text-white">
                {searchQuery || statusFilter !== "all"
                  ? "No drivers found"
                  : "No drivers added yet"}
              </EmptyTitle>
              <EmptyDescription className="text-gray-400">
                {searchQuery || statusFilter !== "all"
                  ? "Try adjusting your search or filter criteria"
                  : "Add your first driver to start managing your team"}
              </EmptyDescription>
            </EmptyHeader>
            {!searchQuery && statusFilter === "all" && (
              <button
                onClick={() =>
                  canModifyDrivers
                    ? handleOpenAdd()
                    : showNotification("warning", driversLockReason)
                }
                disabled={!canModifyDrivers}
                title={canModifyDrivers ? undefined : driversLockReason}
                className={`mt-4 px-6 py-3 font-medium rounded-lg transition-colors flex items-center gap-2 mx-auto ${
                  canModifyDrivers
                    ? "bg-luxury-gold text-black hover:bg-luxury-gold/90"
                    : "bg-neutral-800 text-gray-500 cursor-not-allowed"
                }`}
              >
                {canModifyDrivers ? (
                  <Plus className="w-5 h-5" />
                ) : (
                  <ShieldAlert className="w-5 h-5" />
                )}
                Add Your First Driver
              </button>
            )}
          </Empty>
        </div>
      ) : (
        <>
          {/* ============== DRIVER CARDS GRID ============== */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {drivers.map((driver) => {
              const docAttention = hasDocAttention(driver);
              return (
                <div
                  key={driver.id}
                  className={`bg-neutral-900 border rounded-xl overflow-hidden transition-colors ${
                    docAttention === "expired"
                      ? "border-red-500/40 hover:border-red-500/60"
                      : docAttention === "expiring"
                        ? "border-amber-500/40 hover:border-amber-500/60"
                        : "border-neutral-800 hover:border-neutral-700"
                  }`}
                >
                  <div className="p-4 border-b border-neutral-800">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 bg-luxury-gold/10 rounded-full flex items-center justify-center overflow-hidden">
                        {driver.photoUrl ? (
                          <img
                            src={driver.photoUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User className="w-6 h-6 text-luxury-gold" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-white font-semibold truncate">
                          {driver.firstName} {driver.lastName}
                        </h4>
                        <p className="text-sm text-gray-400 truncate">
                          {driver.phone}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-1 text-xs rounded-full border flex-shrink-0 ${getStatusColor(driver.status)}`}
                      >
                        {driver.statusLabel || formatStatus(driver.status)}
                      </span>
                    </div>
                    {/* Operational pill (separate from review status) */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {driver.status === "DRAFT" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border bg-blue-500/10 text-blue-400 border-blue-500/30">
                          <PenLine className="w-3 h-3" /> Draft — Continue Setup
                        </span>
                      ) : driver.suspendedForDocs ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border bg-red-500/15 text-red-400 border-red-500/40">
                          <AlertCircle className="w-3 h-3" /> Suspended
                        </span>
                      ) : driver.status === "APPROVED" && !driver.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border bg-neutral-700 text-gray-400 border-neutral-600">
                          <Pause className="w-3 h-3" /> Inactive
                        </span>
                      ) : driver.status === "APPROVED" && driver.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border bg-green-500/10 text-green-400 border-green-500/30">
                          <CheckCircle className="w-3 h-3" /> Active
                        </span>
                      ) : null}
                      {driver.rating != null && (
                        <span className="inline-flex items-center gap-0.5 px-2 py-1 text-xs rounded bg-luxury-gold/10 text-luxury-gold">
                          <Star className="w-3 h-3 fill-luxury-gold" />
                          {Number(driver.rating).toFixed(1)}
                        </span>
                      )}
                      {/* Document expiry indicator — only renders if there are expired or expiring docs. */}
                      <DocExpiryIndicator
                        expiringDocs={driver.expiringDocs}
                        expiredDocs={driver.expiredDocs}
                      />
                    </div>
                  </div>

                  <div className="p-3 flex items-center justify-between text-xs border-b border-neutral-800">
                    <span className="text-gray-500 flex items-center gap-1 truncate">
                      <Car className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">
                        {driver.assignedVehicle?.label || "Unassigned"}
                      </span>
                    </span>
                  </div>

                  {/* Card buttons. For DRAFT: Continue Setup re-opens the Add wizard; otherwise View Details. */}
                  <div className="p-4 flex gap-2">
                    {driver.status === "DRAFT" ? (
                      <button
                        onClick={() => handleResumeDraft(driver.id)}
                        className="flex-1 px-3 py-2 bg-luxury-gold text-black text-sm font-medium rounded-lg hover:bg-luxury-gold/90 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <PenLine className="w-4 h-4" /> Continue Setup
                      </button>
                    ) : (
                      <button
                        onClick={() => handleViewDetail(driver.id)}
                        className="flex-1 px-3 py-2 bg-neutral-800 text-white text-sm rounded-lg hover:bg-neutral-700 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Eye className="w-4 h-4" /> View Details
                      </button>
                    )}
                    <button
                      onClick={() =>
                        handleOpenDeleteConfirm(
                          driver.id,
                          `${driver.firstName} ${driver.lastName}`,
                        )
                      }
                      disabled={actionLoading === driver.id}
                      className="px-3 py-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      {actionLoading === driver.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <p className="text-sm text-gray-400">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                {Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
                of {pagination.total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchDrivers(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="p-2 bg-neutral-800 rounded-lg text-white disabled:opacity-50 hover:bg-neutral-700"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from(
                  { length: Math.min(pagination.totalPages, 5) },
                  (_, i) => i + 1,
                ).map((page) => (
                  <button
                    key={page}
                    onClick={() => fetchDrivers(page)}
                    className={`w-8 h-8 rounded-lg text-sm ${pagination.page === page ? "bg-luxury-gold text-black font-medium" : "bg-neutral-800 text-gray-400 hover:bg-neutral-700"}`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => fetchDrivers(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="p-2 bg-neutral-800 rounded-lg text-white disabled:opacity-50 hover:bg-neutral-700"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ============== ADD SIDEBAR (2-step — UNCHANGED) ============== */}
      <div
        className={`fixed inset-0 z-50 ${showAddSidebar ? "pointer-events-auto" : "pointer-events-none"}`}
      >
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${showAddSidebar ? "opacity-100" : "opacity-0"}`}
          onClick={() => !isSaving && setShowAddSidebar(false)}
        />
        <div
          className={`absolute right-0 top-0 h-full w-full max-w-xl bg-neutral-900 border-l border-neutral-700 shadow-2xl transition-transform duration-300 ease-out ${showAddSidebar ? "translate-x-0" : "translate-x-full"}`}
        >
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-neutral-800">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Add New Driver
                </h3>
                <p className="text-sm text-gray-400 mt-0.5">
                  {`Step ${addStep} of 2 — ${addStep === 1 ? "Profile Photo" : "Driver Details"}`}
                </p>
              </div>
              <button
                onClick={() => !isSaving && setShowAddSidebar(false)}
                disabled={isSaving}
                className="p-2 hover:bg-neutral-800 rounded-lg"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Step indicator */}
            <div className="px-5 pt-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      addStep >= 1
                        ? "bg-luxury-gold text-black"
                        : "bg-neutral-800 text-gray-500"
                    }`}
                  >
                    {addStep > 1 ? <CheckCircle className="w-4 h-4" /> : "1"}
                  </div>
                  <span
                    className={`text-sm ${addStep >= 1 ? "text-white" : "text-gray-500"}`}
                  >
                    Photo
                  </span>
                </div>
                <div
                  className={`flex-1 h-px ${addStep >= 2 ? "bg-luxury-gold" : "bg-neutral-700"}`}
                />
                <div className="flex items-center gap-2 flex-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      addStep >= 2
                        ? "bg-luxury-gold text-black"
                        : "bg-neutral-800 text-gray-500"
                    }`}
                  >
                    2
                  </div>
                  <span
                    className={`text-sm ${addStep >= 2 ? "text-white" : "text-gray-500"}`}
                  >
                    Details
                  </span>
                </div>
              </div>
            </div>

            {/* ---- STEP 1: Profile Photo Capture ---- */}
            {addStep === 1 && (
              <>
                <div className="flex-1 overflow-y-auto p-5">
                  <div className="space-y-5">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-luxury-gold/10 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Camera className="w-8 h-8 text-luxury-gold" />
                      </div>
                      <h4 className="text-white font-medium mb-1">
                        Driver Profile Photo
                      </h4>
                      <p className="text-sm text-gray-400">
                        Capture a live photo of the driver in formal uniform.
                        The photo will be verified for dress code compliance.
                      </p>
                    </div>

                    {/* Dress code requirements */}
                    <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-4 space-y-3">
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                        Dress Code Requirements
                      </p>
                      <div className="space-y-2">
                        {[
                          {
                            icon: User,
                            label: "Face clearly visible",
                            desc: "Driver must face the camera directly",
                          },
                          {
                            icon: Shirt,
                            label: "Formal shirt",
                            desc: "Collared dress shirt or suit jacket",
                          },
                          {
                            icon: ShieldCheck,
                            label: "Tie required",
                            desc: "A tie must be visible as part of uniform",
                          },
                        ].map((req) => (
                          <div
                            key={req.label}
                            className="flex items-start gap-3"
                          >
                            <div className="w-7 h-7 bg-luxury-gold/10 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5">
                              <req.icon className="w-3.5 h-3.5 text-luxury-gold" />
                            </div>
                            <div>
                              <p className="text-sm text-white">{req.label}</p>
                              <p className="text-xs text-gray-500">
                                {req.desc}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Photo preview (if captured & verified) */}
                    {capturedPhoto && verificationState === "passed" && (
                      <div className="space-y-3">
                        <div className="relative rounded-lg overflow-hidden border-2 border-green-500/40">
                          <img
                            src={capturedPhoto}
                            alt="Verified driver photo"
                            className="w-full aspect-[3/4] object-cover"
                          />
                          <div className="absolute top-3 right-3 bg-green-500 text-white text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Verified
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenCamera("add")}
                            className="px-3 py-2.5 bg-neutral-800 text-white text-sm rounded-lg hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2"
                          >
                            <Camera className="w-4 h-4" /> Retake
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTriggerUpload("add")}
                            className="px-3 py-2.5 bg-neutral-800 text-white text-sm rounded-lg hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2"
                          >
                            <Upload className="w-4 h-4" /> Upload new
                          </button>
                        </div>
                      </div>
                    )}

                    {/* No photo yet — vendor picks between camera capture
                        and device upload. Both routes run the SAME
                        verify-photo endpoint (face + shirt + tie check). */}
                    {!capturedPhoto && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => handleOpenCamera("add")}
                          className="px-4 py-4 border-2 border-dashed border-neutral-700 rounded-lg text-gray-400 hover:border-luxury-gold/40 hover:text-luxury-gold transition-colors flex flex-col items-center gap-2"
                        >
                          <Camera className="w-6 h-6" />
                          <span className="text-sm font-medium">
                            Open Camera
                          </span>
                          <span className="text-[10px] text-gray-500">
                            Capture a live photo
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTriggerUpload("add")}
                          className="px-4 py-4 border-2 border-dashed border-neutral-700 rounded-lg text-gray-400 hover:border-luxury-gold/40 hover:text-luxury-gold transition-colors flex flex-col items-center gap-2"
                        >
                          <Upload className="w-6 h-6" />
                          <span className="text-sm font-medium">
                            Upload from Device
                          </span>
                          <span className="text-[10px] text-gray-500">
                            Same verification checks apply
                          </span>
                        </button>
                      </div>
                    )}

                    {/* Verifying — shown while the Cloud Vision check
                        is in flight for either capture path. */}
                    {capturedPhoto && verificationState === "verifying" && (
                      <div className="space-y-3">
                        <div className="relative rounded-lg overflow-hidden border-2 border-luxury-gold/40">
                          <img
                            src={capturedPhoto}
                            alt="Verifying driver photo"
                            className="w-full aspect-[3/4] object-cover opacity-70"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <div className="flex flex-col items-center gap-2 text-white">
                              <Loader2 className="w-8 h-8 animate-spin text-luxury-gold" />
                              <span className="text-sm font-medium">
                                Verifying photo…
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Failed */}
                    {capturedPhoto && verificationState === "failed" && (
                      <div className="space-y-3">
                        <div className="relative rounded-lg overflow-hidden border-2 border-red-500/40 opacity-60">
                          <img
                            src={capturedPhoto}
                            alt="Failed verification"
                            className="w-full aspect-[3/4] object-cover"
                          />
                          <div className="absolute top-3 right-3 bg-red-500 text-white text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> Failed
                          </div>
                        </div>
                        {verificationResult?.message && (
                          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                            {verificationResult.message}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenCamera("add")}
                            className="px-3 py-2.5 bg-neutral-800 text-white text-sm rounded-lg hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2"
                          >
                            <Camera className="w-4 h-4" /> Try Camera
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTriggerUpload("add")}
                            className="px-3 py-2.5 bg-neutral-800 text-white text-sm rounded-lg hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2"
                          >
                            <Upload className="w-4 h-4" /> Upload New
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer for Step 1 */}
                <div className="p-5 border-t border-neutral-800 bg-neutral-900/80 backdrop-blur-sm">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowAddSidebar(false)}
                      className="flex-1 px-4 py-3 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        // If vendor already has the photo saved on the draft, no upload needed
                        if (
                          draftDocsState.profilePhoto.uploaded &&
                          !verifiedPhotoFile
                        ) {
                          setAddStep(2);
                          return;
                        }
                        // Otherwise: create the draft (if not already) and upload the verified photo
                        const id = await ensureDraftWithPhoto();
                        if (id) setAddStep(2);
                      }}
                      className="flex-1 px-4 py-3 bg-luxury-gold text-black font-medium rounded-lg hover:bg-luxury-gold/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                      disabled={
                        isSaving ||
                        (!draftDocsState.profilePhoto.uploaded &&
                          verificationState !== "passed")
                      }
                    >
                      {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : null}
                      Continue <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  {verificationState !== "passed" &&
                    !draftDocsState.profilePhoto.uploaded && (
                      <p className="text-xs text-gray-500 text-center mt-2">
                        A verified photo is required to proceed
                      </p>
                    )}
                </div>
              </>
            )}

            {/* ---- STEP 2: Driver Details Form ---- */}
            {addStep === 2 && (
              <>
                <form
                  id="driver-form"
                  onSubmit={handleSaveNewDriver}
                  className="flex-1 overflow-y-auto p-5 space-y-5"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        First Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={driverForm.firstName}
                        onChange={(e) =>
                          setDriverForm((p) => ({
                            ...p,
                            firstName: e.target.value,
                          }))
                        }
                        placeholder="e.g. Mohammed"
                        className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        Last Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={driverForm.lastName}
                        onChange={(e) =>
                          setDriverForm((p) => ({
                            ...p,
                            lastName: e.target.value,
                          }))
                        }
                        placeholder="e.g. Al-Salem"
                        className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold/50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Phone *
                    </label>
                    <PhoneInput
                      value={driverForm.phone}
                      onChange={(phone) =>
                        setDriverForm((p) => ({ ...p, phone }))
                      }
                      label=""
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Email
                    </label>
                    <EmailInput
                      value={driverForm.email}
                      onChange={(email) =>
                        setDriverForm((p) => ({ ...p, email }))
                      }
                      label=""
                    />
                  </div>

                  {/* ===== Identity numbers =====
                      National ID / Iqama and licence number are scalar
                      fields on the driver, separate from the ID and
                      licence document uploads below. Admin needs to see
                      and comment on these numbers during review, and
                      the numbers stay searchable / comparable after any
                      document re-upload. Both use the same 10-digit
                      SaudiIdInput as the vendor/partner CR field so
                      partners see consistent validation across the
                      platform. */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <SaudiIdInput
                      value={driverForm.nationalId}
                      onChange={(v) =>
                        setDriverForm((p) => ({ ...p, nationalId: v }))
                      }
                      label="National ID / Iqama"
                      placeholder="e.g. 1234567890"
                      icon="id"
                      required
                    />
                    <SaudiIdInput
                      value={driverForm.licenseNumber}
                      onChange={(v) =>
                        setDriverForm((p) => ({ ...p, licenseNumber: v }))
                      }
                      label="Driving Licence Number"
                      placeholder="e.g. 1234567890"
                      icon="hash"
                      required
                    />
                  </div>

                  {/* ===== Required Documents — collected at creation ===== */}
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-luxury-gold" />
                      <h4 className="text-sm font-medium text-white">
                        Required Documents
                      </h4>
                    </div>

                    {/* National ID / Iqama */}
                    <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-white font-medium">
                          National ID / Iqama{" "}
                          <span className="text-red-400">*</span>
                        </label>
                        {iqamaFile ? (
                          <span className="flex items-center gap-1 text-xs text-green-400">
                            <CheckCircle className="w-3 h-3" /> New file
                            selected
                          </span>
                        ) : draftDocsState.iqama.uploaded ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-400">
                            <CheckCircle className="w-3 h-3" /> Already uploaded
                          </span>
                        ) : null}
                      </div>
                      <label className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-neutral-900 border-2 border-dashed border-neutral-700 hover:border-luxury-gold/40 rounded-lg cursor-pointer transition-colors text-sm text-gray-400 hover:text-luxury-gold">
                        <Upload className="w-4 h-4" />
                        {iqamaFile
                          ? iqamaFile.name
                          : draftDocsState.iqama.uploaded
                            ? `${draftDocsState.iqama.fileName || "Uploaded"} — choose new file to replace`
                            : "Choose file (PDF or image)"}
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f)
                              handleFileWithCropper(
                                f,
                                (ready) => setIqamaFile(ready),
                                { title: "Crop National ID / Iqama" },
                              );
                          }}
                        />
                      </label>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1.5">
                          Expiry Date <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="date"
                          value={iqamaExpiry}
                          min={new Date().toISOString().split("T")[0]}
                          onChange={(e) => setIqamaExpiry(e.target.value)}
                          className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-luxury-gold/50"
                        />
                      </div>
                    </div>

                    {/* Driving License */}
                    <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-white font-medium">
                          Driving License{" "}
                          <span className="text-red-400">*</span>
                        </label>
                        {licenseFile ? (
                          <span className="flex items-center gap-1 text-xs text-green-400">
                            <CheckCircle className="w-3 h-3" /> New file
                            selected
                          </span>
                        ) : draftDocsState.license.uploaded ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-400">
                            <CheckCircle className="w-3 h-3" /> Already uploaded
                          </span>
                        ) : null}
                      </div>
                      <label className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-neutral-900 border-2 border-dashed border-neutral-700 hover:border-luxury-gold/40 rounded-lg cursor-pointer transition-colors text-sm text-gray-400 hover:text-luxury-gold">
                        <Upload className="w-4 h-4" />
                        {licenseFile
                          ? licenseFile.name
                          : draftDocsState.license.uploaded
                            ? `${draftDocsState.license.fileName || "Uploaded"} — choose new file to replace`
                            : "Choose file (PDF or image)"}
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f)
                              handleFileWithCropper(
                                f,
                                (ready) => setLicenseFile(ready),
                                { title: "Crop Driving License" },
                              );
                          }}
                        />
                      </label>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1.5">
                          Expiry Date <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="date"
                          value={licenseExpiry}
                          min={new Date().toISOString().split("T")[0]}
                          onChange={(e) => setLicenseExpiry(e.target.value)}
                          className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-luxury-gold/50"
                        />
                      </div>
                    </div>

                    <p className="text-xs text-gray-500">
                      The driver will be submitted to admin review automatically
                      once you click Add Driver.
                    </p>
                  </div>
                </form>

                {/* Footer for Step 2 */}
                <div className="p-5 border-t border-neutral-800 bg-neutral-900/80 backdrop-blur-sm">
                  {(() => {
                    const iqamaReady =
                      draftDocsState.iqama.uploaded ||
                      (!!iqamaFile && !!iqamaExpiry);
                    const licenseReady =
                      draftDocsState.license.uploaded ||
                      (!!licenseFile && !!licenseExpiry);
                    const canSubmit = iqamaReady && licenseReady;
                    return (
                      <>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => setAddStep(1)}
                            disabled={isSaving}
                            className="flex-1 px-4 py-3 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors"
                          >
                            Back
                          </button>
                          <button
                            type="submit"
                            form="driver-form"
                            disabled={
                              isSaving || !canSubmit || !canModifyDrivers
                            }
                            title={
                              canModifyDrivers ? undefined : driversLockReason
                            }
                            className={`flex-1 px-4 py-3 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                              canModifyDrivers
                                ? "bg-luxury-gold text-black hover:bg-luxury-gold/90"
                                : "bg-neutral-800 text-gray-500"
                            }`}
                          >
                            {isSaving ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : !canModifyDrivers ? (
                              <ShieldAlert className="w-4 h-4" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                            {draftDriverId
                              ? "Submit Driver for Review"
                              : "Add Driver"}
                          </button>
                        </div>
                        {!canSubmit && !isSaving && (
                          <p className="text-xs text-gray-500 text-center mt-2">
                            Upload both documents with expiry dates to continue
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ============== DETAIL SIDEBAR ============== */}
      <div
        className={`fixed inset-0 z-50 ${showDetailSidebar ? "pointer-events-auto" : "pointer-events-none"}`}
      >
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${showDetailSidebar ? "opacity-100" : "opacity-0"}`}
          onClick={() => setShowDetailSidebar(false)}
        />
        <div
          className={`absolute right-0 top-0 h-full w-full max-w-xl bg-neutral-900 border-l border-neutral-700 shadow-2xl transition-transform duration-300 ease-out ${showDetailSidebar ? "translate-x-0" : "translate-x-full"}`}
        >
          {isLoadingDetail ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
            </div>
          ) : driverDetail ? (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between p-5 border-b border-neutral-800">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-luxury-gold/10 rounded-full flex items-center justify-center overflow-hidden">
                    {driverDetail.photoUrl ? (
                      <img
                        src={
                          proxiedImageUrl(driverDetail.photoUrl, 96) ??
                          driverDetail.photoUrl
                        }
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="w-6 h-6 text-luxury-gold" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {driverDetail.name}
                    </h3>
                    <p className="text-sm text-gray-400">
                      {driverDetail.phone}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDetailSidebar(false)}
                  className="p-2 hover:bg-neutral-800 rounded-lg"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Status Banner — mirrors fleet's pattern: a single banner row with
                    icon + status text + DocExpiryIndicator inline. The separate
                    "Active/Inactive" pill is gone (it duplicated "Active" when the
                    APPROVED status label is also "Active"); active/inactive is now
                    managed through the bottom action buttons. The rating (driver-
                    specific, not present on fleet) lives on the right of the banner. */}
                {(() => {
                  const cfg = STATUS_CONFIG[driverDetail.status];
                  const StatusIcon = cfg?.icon || AlertCircle;
                  // Derive expired/expiring doc lists from the documents array so the
                  // popover can surface them with full context (date + days left).
                  const expiringList = driverDetail.documents
                    .filter((d) => {
                      if (!d.expiryDate || d.isExpired) return false;
                      const days = Math.ceil(
                        (new Date(d.expiryDate).getTime() - Date.now()) /
                          (1000 * 60 * 60 * 24),
                      );
                      return days >= 0 && days <= 30;
                    })
                    .map((d) => ({
                      type: d.type,
                      label: d.label,
                      expiryDate: d.expiryDate,
                    }));
                  const expiredList = driverDetail.documents
                    .filter((d) => d.isExpired)
                    .map((d) => ({
                      type: d.type,
                      label: d.label,
                      expiryDate: d.expiryDate,
                    }));
                  return (
                    <div
                      className={`p-4 rounded-xl border flex items-center gap-3 ${cfg?.bgColor || "bg-neutral-800 border-neutral-700"}`}
                    >
                      <StatusIcon
                        className={`w-5 h-5 flex-shrink-0 ${cfg?.color || "text-gray-400"}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p
                            className={`text-sm font-medium ${cfg?.color || "text-gray-400"}`}
                          >
                            {driverDetail.statusLabel ||
                              formatStatus(driverDetail.status)}
                          </p>
                          {driverDetail.suspendedForDocs && (
                            <span className="px-2 py-0.5 text-xs rounded-full border bg-red-500/15 text-red-400 border-red-500/40 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Suspended
                            </span>
                          )}
                          <DocExpiryIndicator
                            expiringDocs={expiringList}
                            expiredDocs={expiredList}
                            onRequestChanges={
                              driverDetail.status === "APPROVED" &&
                              !hasPendingRequest &&
                              canModifyDrivers
                                ? (affectedDocTypes) => {
                                    // Pre-tick the affected doc types so the vendor
                                    // doesn't have to re-pick them in the modal.
                                    setChangeRequestFields(affectedDocTypes);
                                    setShowChangeRequestModal(true);
                                  }
                                : undefined
                            }
                          />
                        </div>
                        {driverDetail.status === "CHANGES_REQUESTED" &&
                          driverDetail.hasUnresolvedReviews && (
                            <p className="text-xs text-amber-400/70 mt-0.5">
                              Admin has flagged fields that need attention — see
                              highlighted items below
                            </p>
                          )}
                        {driverDetail.status === "PENDING_REVIEW" && (
                          <p className="text-xs text-purple-400/70 mt-0.5">
                            Your driver is being reviewed by the admin team
                          </p>
                        )}
                      </div>
                      {/* Right side: rating (driver-specific) + "Verified" chip when APPROVED */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {driverDetail.rating != null && (
                          <span className="px-2 py-1 text-xs bg-luxury-gold/10 text-luxury-gold rounded-full flex items-center gap-1">
                            <Star className="w-3 h-3 fill-luxury-gold" />
                            {Number(driverDetail.rating).toFixed(1)}
                          </span>
                        )}
                        {driverDetail.status === "APPROVED" && (
                          <span className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-medium rounded-full border border-green-500/30">
                            Verified
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Admin Review Comments (request-level) */}
                {driverDetail.unresolvedReviews &&
                  driverDetail.unresolvedReviews.length > 0 && (
                    <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                      <p className="text-xs text-amber-400 font-semibold mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> Admin Review
                        Comments
                      </p>
                      {driverDetail.unresolvedReviews.map((rr) => (
                        <div
                          key={rr.id}
                          className="mt-2 text-xs text-amber-400/80"
                        >
                          <p>{rr.message}</p>
                          {rr.fieldLabels && rr.fieldLabels.length > 0 && (
                            <p className="mt-1 text-amber-400/60">
                              Flagged: {rr.fieldLabels.join(", ")}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                {/* Suspended-driver banner */}
                {driverDetail.suspendedForDocs && (
                  <div className="p-4 bg-red-500/10 border border-red-500/40 rounded-xl">
                    <p className="text-sm text-red-400 font-semibold mb-1 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4" /> Driver Suspended
                    </p>
                    <p className="text-xs text-red-400/80 mb-2">
                      This driver is offline because the following document
                      {driverDetail.expiredDocuments.length > 1
                        ? "s have"
                        : " has"}{" "}
                      expired:
                    </p>
                    <ul className="text-xs text-red-400/90 ml-2 mb-2 space-y-0.5">
                      {driverDetail.documents
                        .filter((d) => d.isExpired)
                        .map((d) => {
                          const daysAgo = d.expiryDate
                            ? Math.max(
                                1,
                                Math.ceil(
                                  (Date.now() -
                                    new Date(d.expiryDate).getTime()) /
                                    (1000 * 60 * 60 * 24),
                                ),
                              )
                            : null;
                          return (
                            <li key={d.type}>
                              • <span className="font-medium">{d.label}</span>
                              {daysAgo != null ? (
                                <span className="text-red-400/60">
                                  {" "}
                                  — expired {daysAgo} day
                                  {daysAgo !== 1 ? "s" : ""} ago
                                </span>
                              ) : null}
                            </li>
                          );
                        })}
                    </ul>
                    <p className="text-xs text-red-400/70">
                      Scroll down to{" "}
                      <span className="font-semibold">Documents</span>, find the
                      highlighted item
                      {driverDetail.expiredDocuments.length > 1 ? "s" : ""}, and
                      click <span className="font-semibold">Replace</span> to
                      upload a renewed copy. Once all required documents are
                      valid, click{" "}
                      <span className="font-semibold">
                        Submit Renewed Documents for Review
                      </span>{" "}
                      at the bottom. The driver will be reactivated only after
                      admin approval.
                    </p>
                  </div>
                )}

                {/* Change Request panel — APPROVED drivers only. Vendor can ask admin
                    to unlock specific fields for editing (e.g. when a renewed iqama is
                    issued under a new number, or to upload a fresh license document). */}
                {driverDetail.status === "APPROVED" && (
                  <div className="p-4 bg-neutral-800/50 border border-neutral-700 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                          <Edit2 className="w-4 h-4 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">
                            Need to update this driver?
                          </p>
                          <p className="text-xs text-gray-500">
                            Submit a change request to admin
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (!canModifyDrivers) {
                            showNotification("warning", driversLockReason);
                            return;
                          }
                          // Pre-tick any currently expired or about-to-expire docs so the
                          // common case (vendor needs to update a renewed iqama/license)
                          // doesn't require re-selecting in the modal. Vendor can deselect
                          // them or add more fields if the request is for something else.
                          const affected: string[] = [];
                          driverDetail.documents.forEach((d) => {
                            if (d.isExpired) {
                              affected.push(d.type);
                              return;
                            }
                            if (!d.expiryDate) return;
                            const days = Math.ceil(
                              (new Date(d.expiryDate).getTime() - Date.now()) /
                                (1000 * 60 * 60 * 24),
                            );
                            if (days >= 0 && days <= 30) affected.push(d.type);
                          });
                          setChangeRequestFields(affected);
                          setShowChangeRequestModal(true);
                        }}
                        disabled={hasPendingRequest || !canModifyDrivers}
                        title={
                          !canModifyDrivers
                            ? driversLockReason
                            : hasPendingRequest
                              ? "You already have a pending change request"
                              : undefined
                        }
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {!canModifyDrivers ? (
                          <>
                            <ShieldAlert className="w-3.5 h-3.5" /> Locked
                          </>
                        ) : hasPendingRequest ? (
                          <>
                            <Clock className="w-3.5 h-3.5" /> Pending
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" /> Request Changes
                          </>
                        )}
                      </button>
                    </div>
                    {changeRequests.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-neutral-700 space-y-2">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                          Recent Requests
                        </p>
                        {changeRequests.slice(0, 2).map((req) => (
                          <div
                            key={req.id}
                            className={`p-2.5 rounded-lg border text-xs ${
                              !req.isResolved
                                ? "bg-amber-500/5 border-amber-500/20"
                                : "bg-neutral-800/50 border-neutral-700"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                  !req.isResolved
                                    ? "bg-amber-500/20 text-amber-400"
                                    : "bg-green-500/20 text-green-400"
                                }`}
                              >
                                {!req.isResolved ? "⏳ Pending" : "✓ Resolved"}
                              </span>
                              <span className="text-[10px] text-gray-500">
                                {shortDate(req.createdAt)}
                              </span>
                            </div>
                            <p className="text-gray-400 mt-1">
                              Fields:{" "}
                              {req.fieldLabels?.join(", ") ||
                                req.fields?.join(", ")}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ============== REVIEW PROGRESS BANNER ==============
                    Only renders when admin has an active review cycle on
                    this driver (at least one field has a rejection
                    comment OR an unresolved review request). Shows
                    running counts so the vendor knows how many flagged
                    items they've addressed in this round vs how many
                    still need attention — useful before clicking
                    "Submit Changes for Review" so they don't bounce
                    back from admin for an item they overlooked. */}
                {(() => {
                  const snapshot = driverDetail.editSnapshot || null;
                  const flaggedFromRequests =
                    driverDetail.unresolvedReviews?.flatMap(
                      (r) => r.fields || [],
                    ) || [];
                  const flaggedFromComments =
                    driverDetail.reviewComments?.map((c) => c.fieldName) || [];
                  const allFlagged = Array.from(
                    new Set<string>([
                      ...flaggedFromRequests,
                      ...flaggedFromComments,
                    ]),
                  );
                  // Banner is only meaningful when admin actively flagged
                  // something. Expired docs don't count here — those are
                  // a separate signal handled by the doc-expiry chip.
                  if (allFlagged.length === 0) return null;
                  if (!snapshot) return null;

                  const norm = (v: any) =>
                    v === undefined || v === null ? "" : String(v);
                  const addressed: string[] = [];
                  const pending: string[] = [];
                  for (const key of allFlagged) {
                    // Doc keys live in driverDetail.documents[].filePath;
                    // info keys live as direct properties (firstName etc.).
                    // Use filePath (raw, stable) — fileUrl is a signed URL
                    // that changes per request and would falsely diff.
                    const docMatch = driverDetail.documents.find(
                      (d) => d.type === key,
                    );
                    const curr =
                      docMatch !== undefined
                        ? docMatch.filePath
                        : (driverDetail as any)[key];
                    // Missing-snapshot-key fallback: treat as empty string
                    // so any non-empty current value counts as addressed.
                    // This handles legacy drivers whose snapshot was
                    // written before nationalId / licenseNumber were
                    // added to the snapshot builder — without this,
                    // those fields would show pending forever even
                    // after the vendor updates them.
                    const prevRaw = snapshot[key];
                    const prev = prevRaw === undefined ? "" : prevRaw;
                    if (norm(prev) !== norm(curr)) addressed.push(key);
                    else pending.push(key);
                  }
                  const allDone = pending.length === 0;
                  return (
                    <div
                      className={`p-4 rounded-xl border ${
                        allDone
                          ? "bg-emerald-500/10 border-emerald-500/30"
                          : "bg-amber-500/10 border-amber-500/30"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {allDone ? (
                          <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <p
                            className={`text-sm font-medium ${
                              allDone ? "text-emerald-400" : "text-amber-400"
                            }`}
                          >
                            {allDone
                              ? `All ${allFlagged.length} flagged item${allFlagged.length === 1 ? "" : "s"} addressed — ready to submit`
                              : `${addressed.length} of ${allFlagged.length} flagged item${allFlagged.length === 1 ? "" : "s"} addressed — ${pending.length} still pending`}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {allDone
                              ? "Click Submit Changes for Review below; admin will be notified."
                              : "Scroll down — pending items are marked in amber, addressed items in green."}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Driver Info — inline editable when admin has flagged a field */}
                {(() => {
                  const flaggedFromRequests =
                    driverDetail.unresolvedReviews?.flatMap(
                      (r) => r.fields || [],
                    ) || [];
                  const flaggedFromComments =
                    driverDetail.reviewComments?.map((c) => c.fieldName) || [];
                  const expiredDocTypes = driverDetail.documents
                    .filter((d) => d.isExpired)
                    .map((d) => d.type);
                  const allFlagged = new Set<string>([
                    ...flaggedFromRequests,
                    ...flaggedFromComments,
                    ...expiredDocTypes,
                  ]);
                  const editableFields: string[] | null =
                    driverDetail.editableFields ?? null;
                  const snapshot = driverDetail.editSnapshot || null;

                  const isAwaitingReview =
                    driverDetail.status === "PENDING_REVIEW";

                  const isEditable = (key: string) => {
                    // PENDING_REVIEW = vendor already submitted, admin's turn → never editable
                    if (isAwaitingReview) return false;
                    // CHANGES_REQUESTED = admin flagged specific fields → only those editable
                    if (driverDetail.status === "CHANGES_REQUESTED") {
                      return editableFields
                        ? editableFields.includes(key)
                        : allFlagged.has(key);
                    }
                    // APPROVED / SUSPENDED / etc. → not editable; vendor goes through Request Changes path
                    return false;
                  };

                  const wasAddressed = (key: string) => {
                    if (!snapshot) return false;
                    // Missing-snapshot-key fallback — same rationale as
                    // the counter above. Treat undefined as "" so the
                    // vendor's non-empty edit still lights up green
                    // for legacy drivers whose snapshot pre-dates the
                    // scalar identity fields.
                    const prevRaw = snapshot[key];
                    const prev = prevRaw === undefined ? "" : prevRaw;
                    const curr = (driverDetail as any)[key];
                    return prev !== curr && curr != null && curr !== "";
                  };

                  const infoFields: Array<{
                    key: string;
                    label: string;
                    value: any;
                    type: string;
                  }> = [
                    {
                      key: "firstName",
                      label: "First Name",
                      value: driverDetail.firstName,
                      type: "text",
                    },
                    {
                      key: "lastName",
                      label: "Last Name",
                      value: driverDetail.lastName,
                      type: "text",
                    },
                    {
                      key: "phone",
                      label: "Phone",
                      value: driverDetail.phone,
                      type: "tel",
                    },
                    // National ID / Iqama and licence number are scalar
                    // identity fields on the driver, distinct from the
                    // ID/licence document uploads below. Editable inline
                    // when admin has flagged the specific field.
                    {
                      key: "nationalId",
                      label: "National ID / Iqama",
                      value: driverDetail.nationalId,
                      type: "text",
                    },
                    {
                      key: "licenseNumber",
                      label: "Licence Number",
                      value: driverDetail.licenseNumber,
                      type: "text",
                    },
                  ];

                  return (
                    <div>
                      <h4 className="text-sm font-medium text-luxury-gold flex items-center gap-2 mb-3">
                        <User className="w-4 h-4" /> Driver Information
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        {infoFields.map((f) => {
                          const isFlagged = allFlagged.has(f.key);
                          const editable = isEditable(f.key);
                          const isEditing = editingField === f.key;
                          const addressed = wasAddressed(f.key);
                          const fieldComment =
                            driverDetail.reviewComments?.find(
                              (c) => c.fieldName === f.key,
                            )?.comment;
                          const prevValue = snapshot ? snapshot[f.key] : null;
                          return (
                            <div
                              key={f.key}
                              className={`rounded-lg p-3 ${
                                addressed
                                  ? "bg-emerald-500/5 border border-emerald-500/30"
                                  : isFlagged
                                    ? "bg-amber-500/5 border border-amber-500/30"
                                    : "bg-neutral-800/50"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
                                  {f.label}
                                  {addressed && (
                                    <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] rounded font-medium flex items-center gap-1">
                                      <CheckCircle className="w-2.5 h-2.5" />{" "}
                                      Addressed
                                    </span>
                                  )}
                                  {isFlagged && !addressed && (
                                    <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded font-medium">
                                      Action Required
                                    </span>
                                  )}
                                </p>
                                {editable && !isEditing && (
                                  <button
                                    onClick={() => {
                                      setEditingField(f.key);
                                      setEditingFieldValue(
                                        f.value != null ? String(f.value) : "",
                                      );
                                    }}
                                    className="p-1 text-luxury-gold hover:bg-luxury-gold/10 rounded transition-colors"
                                    title={`Edit ${f.label}`}
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                              {isEditing ? (
                                <div className="space-y-2">
                                  {/* Dispatch by field key so specialised
                                      form-fields handle their own
                                      formatting / validation. Phone uses
                                      PhoneInput (KSA-friendly with
                                      country code + libphonenumber
                                      validation) instead of a raw
                                      <input type="tel"> — the latter
                                      bypasses formatting and would let
                                      vendors save numbers the rest of
                                      the platform can't parse. Plain
                                      text fields (firstName, lastName)
                                      stay on the raw input since they
                                      have no specialised component. */}
                                  {f.key === "phone" ? (
                                    <PhoneInput
                                      value={editingFieldValue}
                                      onChange={setEditingFieldValue}
                                      label=""
                                    />
                                  ) : f.key === "nationalId" ? (
                                    // Digits-only, 10-char cap — matches
                                    // the Add Driver flow and the backend
                                    // validation. Strip non-digits as
                                    // they type so the vendor can't
                                    // accidentally save "123-456-7890".
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={editingFieldValue}
                                      onChange={(e) =>
                                        setEditingFieldValue(
                                          e.target.value
                                            .replace(/\D/g, "")
                                            .slice(0, 10),
                                        )
                                      }
                                      className="w-full px-2 py-1.5 bg-neutral-900 border border-luxury-gold/40 rounded text-white text-sm font-mono focus:outline-none focus:border-luxury-gold"
                                      autoFocus
                                      placeholder="10-digit number"
                                      maxLength={10}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter")
                                          handleSaveInlineField(
                                            driverDetail.id,
                                            f.key,
                                            editingFieldValue,
                                          );
                                        if (e.key === "Escape")
                                          setEditingField(null);
                                      }}
                                    />
                                  ) : f.key === "licenseNumber" ? (
                                    // Same 10-digit Saudi format as the
                                    // National ID field — driving licence
                                    // numbers in KSA follow the same rule.
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={editingFieldValue}
                                      onChange={(e) =>
                                        setEditingFieldValue(
                                          e.target.value
                                            .replace(/\D/g, "")
                                            .slice(0, 10),
                                        )
                                      }
                                      className="w-full px-2 py-1.5 bg-neutral-900 border border-luxury-gold/40 rounded text-white text-sm font-mono focus:outline-none focus:border-luxury-gold"
                                      autoFocus
                                      placeholder="10-digit number"
                                      maxLength={10}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter")
                                          handleSaveInlineField(
                                            driverDetail.id,
                                            f.key,
                                            editingFieldValue,
                                          );
                                        if (e.key === "Escape")
                                          setEditingField(null);
                                      }}
                                    />
                                  ) : (
                                    <input
                                      type={f.type}
                                      value={editingFieldValue}
                                      onChange={(e) =>
                                        setEditingFieldValue(e.target.value)
                                      }
                                      className="w-full px-2 py-1.5 bg-neutral-900 border border-luxury-gold/40 rounded text-white text-sm focus:outline-none focus:border-luxury-gold"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter")
                                          handleSaveInlineField(
                                            driverDetail.id,
                                            f.key,
                                            editingFieldValue,
                                          );
                                        if (e.key === "Escape") {
                                          setEditingField(null);
                                          setEditingFieldValue("");
                                        }
                                      }}
                                    />
                                  )}{" "}
                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={() =>
                                        handleSaveInlineField(
                                          driverDetail.id,
                                          f.key,
                                          editingFieldValue,
                                        )
                                      }
                                      disabled={
                                        savingField || !editingFieldValue
                                      }
                                      className="flex-1 px-2 py-1 bg-luxury-gold text-black text-xs font-semibold rounded hover:bg-luxury-gold/90 disabled:opacity-50 flex items-center justify-center gap-1"
                                    >
                                      {savingField ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Save className="w-3 h-3" />
                                      )}{" "}
                                      Save
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingField(null);
                                        setEditingFieldValue("");
                                      }}
                                      className="px-2 py-1 bg-neutral-700 text-gray-300 text-xs rounded hover:bg-neutral-600"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : addressed ? (
                                <div className="space-y-1">
                                  <p className="text-xs text-red-400/70 line-through">
                                    {prevValue != null && prevValue !== ""
                                      ? String(prevValue)
                                      : "Empty"}
                                  </p>
                                  <p className="text-emerald-400 font-medium">
                                    {f.value != null && f.value !== ""
                                      ? String(f.value)
                                      : "—"}
                                  </p>
                                </div>
                              ) : (
                                <p className="text-white font-medium">
                                  {f.value != null && f.value !== ""
                                    ? String(f.value)
                                    : "—"}
                                </p>
                              )}
                              {isFlagged &&
                                !addressed &&
                                fieldComment &&
                                !isEditing && (
                                  <p className="mt-1.5 text-[10px] text-amber-400/80 flex items-start gap-1">
                                    <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                    {fieldComment}
                                  </p>
                                )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Assigned Vehicle (read-only display) */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-luxury-gold flex items-center gap-2">
                    <Car className="w-4 h-4" /> Assigned Vehicle
                  </h4>
                  {driverDetail.assignedVehicle ? (
                    <div className="bg-neutral-800 rounded-lg p-3 border border-neutral-700 flex items-center gap-3">
                      <Car className="w-5 h-5 text-luxury-gold" />
                      <div>
                        <p className="text-white font-medium">
                          {driverDetail.assignedVehicle.make}{" "}
                          {driverDetail.assignedVehicle.model}
                        </p>
                        <p className="text-xs text-gray-400">
                          {driverDetail.assignedVehicle.plateNumber}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-neutral-800 rounded-lg p-3 border border-neutral-700 text-center">
                      <p className="text-gray-400 text-sm">
                        No vehicle assigned
                      </p>
                    </div>
                  )}
                </div>

                {/* Documents — with flagged/expired styling + Replace button */}
                {(() => {
                  const flaggedFromRequests =
                    driverDetail.unresolvedReviews?.flatMap(
                      (r) => r.fields || [],
                    ) || [];
                  const flaggedFromComments =
                    driverDetail.reviewComments?.map((c) => c.fieldName) || [];
                  const expiredDocTypes = driverDetail.documents
                    .filter((d) => d.isExpired)
                    .map((d) => d.type);
                  const flaggedTypes = new Set<string>([
                    ...flaggedFromRequests,
                    ...flaggedFromComments,
                    ...expiredDocTypes,
                  ]);
                  const isAwaitingReview =
                    driverDetail.status === "PENDING_REVIEW";
                  // Snapshot lookup — same source used by the Driver
                  // Information block above. Lets us flip a doc to
                  // emerald "Addressed" the moment its fileUrl differs
                  // from the snapshot baseline. Snapshot writer uses
                  // doc TYPE as the key (e.g. PROFILE_PHOTO, IQAMA,
                  // DRIVING_LICENSE), matching what the admin-side
                  // requestDriverChanges populated.
                  const snapshot = driverDetail.editSnapshot || null;
                  const wasDocAddressed = (
                    docType: string,
                    currentFileUrl: string | null | undefined,
                  ): boolean => {
                    if (!snapshot) return false;
                    // Both sides normalised — empty vs null shouldn't
                    // read as a change. PROFILE_PHOTO also surfaces
                    // through a different snapshot key on some legacy
                    // requests, but the doc.type lookup above is the
                    // canonical path.
                    const norm = (v: any) =>
                      v === undefined || v === null ? "" : String(v);
                    // Missing-snapshot-key fallback — legacy drivers'
                    // snapshots may pre-date a required doc type. If the
                    // key is missing but the vendor has uploaded a file,
                    // treat that as addressed rather than silently
                    // leaving the tile stuck on "Action Required" forever.
                    const prevRaw = snapshot[docType];
                    const prev = prevRaw === undefined ? "" : prevRaw;
                    return norm(prev) !== norm(currentFileUrl);
                  };
                  return (
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-luxury-gold flex items-center gap-2">
                        <FileText className="w-4 h-4" /> Documents
                      </h4>
                      {driverDetail.documents.map((doc) => {
                        const isFlagged = flaggedTypes.has(doc.type);
                        const canReplace = isFlagged && !isAwaitingReview;
                        const isAddressed =
                          isFlagged && wasDocAddressed(doc.type, doc.filePath);
                        return (
                          <div
                            key={doc.type}
                            className={`bg-neutral-800 rounded-lg p-3 border ${
                              isAddressed
                                ? "border-emerald-500/60 bg-emerald-500/5"
                                : isFlagged
                                  ? "border-amber-500/40 bg-amber-500/5"
                                  : doc.isUploaded
                                    ? "border-neutral-700"
                                    : "border-red-500/30"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                    isAddressed
                                      ? "bg-emerald-500/20"
                                      : isFlagged
                                        ? "bg-amber-500/20"
                                        : doc.isUploaded
                                          ? "bg-green-500/20"
                                          : "bg-red-500/20"
                                  }`}
                                >
                                  {isAddressed ? (
                                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                                  ) : isFlagged ? (
                                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                                  ) : doc.isUploaded ? (
                                    <CheckCircle className="w-4 h-4 text-green-400" />
                                  ) : (
                                    <XCircle className="w-4 h-4 text-red-400" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm text-white flex items-center gap-1.5 flex-wrap">
                                    {doc.label}
                                    {/* Addressed wins over Action Required —
                                        once vendor has uploaded a replacement,
                                        the green emerald badge takes over.
                                        Mirrors the Driver Information field
                                        treatment above. */}
                                    {isAddressed ? (
                                      <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] rounded font-medium flex items-center gap-1">
                                        <CheckCircle className="w-2.5 h-2.5" />{" "}
                                        Addressed
                                      </span>
                                    ) : isFlagged ? (
                                      <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded font-medium">
                                        Action Required
                                      </span>
                                    ) : null}
                                    {/* Inline expiry chip on the doc row — surfaces the
                                        days-remaining / expired state right next to the
                                        document's label. */}
                                    {doc.isUploaded && doc.expiryDate && (
                                      <InlineExpiryChip
                                        expiryDate={doc.expiryDate}
                                        size="xs"
                                      />
                                    )}
                                  </p>
                                  {doc.isUploaded ? (
                                    <p className="text-xs text-gray-500 truncate">
                                      {doc.fileName || "Uploaded"}
                                      {doc.expiryDate &&
                                        ` · Exp: ${new Date(doc.expiryDate).toLocaleDateString()}`}
                                      {doc.isExpired && (
                                        <span className="text-red-400 font-medium">
                                          {" "}
                                          · Expired
                                        </span>
                                      )}
                                    </p>
                                  ) : (
                                    <p className="text-xs text-red-400">
                                      Not uploaded
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {doc.isUploaded && doc.fileUrl && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleViewDocument(
                                        doc.fileUrl!,
                                        doc.fileName || undefined,
                                        doc.label,
                                      )
                                    }
                                    className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded"
                                    title="View document"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                )}
                                {/* Upload / Replace affordance */}
                                {(!doc.isUploaded || canReplace) &&
                                  (doc.type === "PROFILE_PHOTO" ? (
                                    <button
                                      type="button"
                                      onClick={handleDetailPhotoCapture}
                                      className="p-1.5 text-luxury-gold hover:bg-luxury-gold/10 rounded"
                                      title={
                                        doc.isUploaded
                                          ? "Replace photo"
                                          : "Capture photo"
                                      }
                                    >
                                      <Camera className="w-4 h-4" />
                                    </button>
                                  ) : (
                                    <label
                                      className="p-1.5 text-luxury-gold hover:bg-luxury-gold/10 rounded cursor-pointer"
                                      title={
                                        doc.isUploaded
                                          ? "Replace document"
                                          : "Upload document"
                                      }
                                    >
                                      {doc.isUploaded ? (
                                        <Upload className="w-4 h-4" />
                                      ) : (
                                        <Upload className="w-4 h-4" />
                                      )}
                                      <input
                                        type="file"
                                        className="hidden"
                                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (!file) return;
                                          // Reset the input so picking the
                                          // same filename twice still fires
                                          // onChange.
                                          e.target.value = "";
                                          if (doc.requiresExpiry) {
                                            // Stage the file — an inline
                                            // date picker renders below
                                            // and the user confirms before
                                            // the cropper + upload run.
                                            // This replaces the previous
                                            // native prompt() which had no
                                            // calendar / no validation.
                                            setPendingDocFile((p) => ({
                                              ...p,
                                              [doc.type]: file,
                                            }));
                                          } else {
                                            // No expiry needed — upload
                                            // directly via cropper.
                                            handleFileWithCropper(
                                              file,
                                              (ready) =>
                                                handleDocumentUpload(
                                                  driverDetail.id,
                                                  doc.type,
                                                  ready,
                                                  undefined,
                                                ),
                                              { title: `Crop ${doc.label}` },
                                            );
                                          }
                                        }}
                                      />
                                    </label>
                                  ))}
                              </div>
                            </div>
                            {/* Inline expiry-date picker for a staged
                                file. Same pattern as vendor/fleet.tsx —
                                shows after the user picks a file for an
                                expiry-required doc, blocks upload until
                                they pick a future date and confirm. */}
                            {pendingDocFile[doc.type] && (
                              <div className="mt-2 p-3 bg-neutral-900 border border-luxury-gold/30 rounded-lg space-y-2">
                                <p className="text-xs text-gray-400 truncate">
                                  Selected:{" "}
                                  <span className="text-gray-200">
                                    {pendingDocFile[doc.type].name}
                                  </span>
                                </p>
                                <div>
                                  <label className="block text-[11px] text-gray-500 mb-1">
                                    Expiry date *
                                  </label>
                                  <input
                                    type="date"
                                    value={pendingDocExpiry[doc.type] || ""}
                                    onChange={(e) =>
                                      setPendingDocExpiry((p) => ({
                                        ...p,
                                        [doc.type]: e.target.value,
                                      }))
                                    }
                                    // Disallow past dates — doc is being
                                    // uploaded as currently-valid proof,
                                    // so expiry must be in the future.
                                    min={new Date().toISOString().split("T")[0]}
                                    className="w-full px-2 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-white text-xs focus:outline-none focus:border-luxury-gold/50"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => clearPendingDoc(doc.type)}
                                    className="flex-1 px-3 py-1.5 bg-neutral-700 text-gray-300 rounded text-xs hover:bg-neutral-600 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!pendingDocExpiry[doc.type]}
                                    onClick={() => {
                                      const file = pendingDocFile[doc.type];
                                      const expiry = pendingDocExpiry[doc.type];
                                      if (!file || !expiry) return;
                                      // Snapshot values before clearing —
                                      // state updates batch, and the
                                      // cropper callback shouldn't close
                                      // over stale values.
                                      const docType = doc.type;
                                      const docLabel = doc.label;
                                      const driverId = driverDetail.id;
                                      clearPendingDoc(docType);
                                      handleFileWithCropper(
                                        file,
                                        (ready) =>
                                          handleDocumentUpload(
                                            driverId,
                                            docType,
                                            ready,
                                            expiry,
                                          ),
                                        { title: `Crop ${docLabel}` },
                                      );
                                    }}
                                    className="flex-1 px-3 py-1.5 bg-luxury-gold text-black rounded text-xs font-semibold hover:bg-luxury-gold/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                  >
                                    Continue
                                  </button>
                                </div>
                              </div>
                            )}
                            {uploadingDocType === doc.type && (
                              <div className="mt-2 flex items-center gap-2 text-xs text-luxury-gold">
                                <Loader2 className="w-3 h-3 animate-spin" />{" "}
                                Uploading...
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* ============== FOOTER ============== */}
              <div className="p-5 border-t border-neutral-800 space-y-3">
                {(() => {
                  const isSuspended = driverDetail.suspendedForDocs === true;
                  const awaitingReview =
                    driverDetail.status === "PENDING_REVIEW";

                  // 1. Awaiting admin review — vendor's job is done, just show a banner
                  if (awaitingReview) {
                    return (
                      <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg flex items-center gap-3">
                        <Clock className="w-5 h-5 text-purple-400 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm text-white font-medium">
                            Submitted for admin review
                          </p>
                          <p className="text-xs text-purple-400/70 mt-0.5">
                            {isSuspended
                              ? "Your renewed documents are with the admin. The driver will be reactivated once approved."
                              : "Your submission is with the admin. You'll be notified when they respond."}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  // 2. Suspended (status APPROVED) — needs to resubmit after renewal
                  if (isSuspended && driverDetail.status === "APPROVED") {
                    const requiredWithExpiry = [
                      "DRIVING_LICENSE",
                      "IQAMA_NATIONAL_ID",
                    ];
                    const now = new Date();
                    const stillMissingOrExpired = requiredWithExpiry.filter(
                      (t) => {
                        const d = driverDetail.documents.find(
                          (x) => x.type === t,
                        );
                        if (!d || !d.isUploaded || !d.expiryDate) return true;
                        return new Date(d.expiryDate) <= now;
                      },
                    );
                    const canSubmit = stillMissingOrExpired.length === 0;
                    return canSubmit ? (
                      <button
                        onClick={() =>
                          canModifyDrivers
                            ? handleSubmitForReview(driverDetail.id)
                            : showNotification("warning", driversLockReason)
                        }
                        disabled={
                          actionLoading === driverDetail.id || !canModifyDrivers
                        }
                        title={canModifyDrivers ? undefined : driversLockReason}
                        className={`w-full px-4 py-3 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${
                          canModifyDrivers
                            ? "bg-luxury-gold text-black hover:bg-luxury-gold/90"
                            : "bg-neutral-800 text-gray-500"
                        }`}
                      >
                        {actionLoading === driverDetail.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : !canModifyDrivers ? (
                          <ShieldAlert className="w-4 h-4" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        Submit Renewed Documents for Review
                      </button>
                    ) : (
                      <div className="p-3 bg-neutral-800/50 rounded-lg">
                        <p className="text-xs text-gray-400 text-center">
                          Replace the expired document
                          {stillMissingOrExpired.length !== 1 ? "s" : ""} above
                          ({stillMissingOrExpired.join(", ")}) to enable
                          submission.
                        </p>
                      </div>
                    );
                  }

                  // 3. CHANGES_REQUESTED — vendor can resubmit at any time. We don't gate on
                  // whether the vendor has actually addressed the flagged items — if they
                  // haven't, the admin can re-reject. This matches the user's expectation
                  // that they can always send their current state back to the admin.
                  if (driverDetail.status === "CHANGES_REQUESTED") {
                    const hasFlags =
                      (driverDetail.reviewComments?.length ?? 0) > 0;
                    const hasMissingDocs = !driverDetail.allDocumentsUploaded;
                    return (
                      <div className="space-y-2">
                        <button
                          onClick={() =>
                            canModifyDrivers
                              ? handleSubmitForReview(driverDetail.id)
                              : showNotification("warning", driversLockReason)
                          }
                          disabled={
                            actionLoading === driverDetail.id ||
                            !canModifyDrivers
                          }
                          title={
                            canModifyDrivers ? undefined : driversLockReason
                          }
                          className={`w-full px-4 py-3 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${
                            canModifyDrivers
                              ? "bg-luxury-gold text-black hover:bg-luxury-gold/90"
                              : "bg-neutral-800 text-gray-500"
                          }`}
                        >
                          {actionLoading === driverDetail.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : !canModifyDrivers ? (
                            <ShieldAlert className="w-4 h-4" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                          Submit Changes for Review
                        </button>
                        {(hasFlags || hasMissingDocs) && (
                          <p className="text-xs text-amber-400/80 text-center">
                            {hasMissingDocs
                              ? `Note: ${driverDetail.missingDocuments.length} document${driverDetail.missingDocuments.length !== 1 ? "s" : ""} still missing. `
                              : ""}
                            {hasFlags
                              ? "Admin may re-reject if flagged items aren't addressed."
                              : ""}
                          </p>
                        )}
                      </div>
                    );
                  }

                  return null;
                })()}

                {/* APPROVED + not suspended → show assign + activate/deactivate */}
                {driverDetail.status === "APPROVED" &&
                  !driverDetail.suspendedForDocs && (
                    <>
                      {driverDetail.isActive && (
                        <button
                          onClick={handleOpenAssign}
                          className="w-full px-4 py-3 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2"
                        >
                          <Car className="w-4 h-4" />
                          {driverDetail.assignedVehicle
                            ? "Change Vehicle"
                            : "Assign Vehicle"}
                        </button>
                      )}

                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
                          Driver State
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleToggleActive(driverDetail.id)}
                            disabled={
                              actionLoading === driverDetail.id ||
                              driverDetail.isActive
                            }
                            className={`px-3 py-2.5 rounded-lg text-xs font-medium transition-colors flex flex-col items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed ${
                              driverDetail.isActive
                                ? "bg-green-500/20 text-green-400 border border-green-500/40"
                                : "bg-neutral-800 text-gray-300 hover:bg-green-500/10 hover:text-green-400 border border-neutral-700"
                            }`}
                          >
                            <CheckCircle className="w-4 h-4" /> Active
                          </button>
                          <button
                            onClick={() => handleToggleActive(driverDetail.id)}
                            disabled={
                              actionLoading === driverDetail.id ||
                              !driverDetail.isActive
                            }
                            className={`px-3 py-2.5 rounded-lg text-xs font-medium transition-colors flex flex-col items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed ${
                              !driverDetail.isActive
                                ? "bg-neutral-700 text-gray-300 border border-neutral-600"
                                : "bg-neutral-800 text-gray-300 hover:bg-neutral-700 border border-neutral-700"
                            }`}
                          >
                            <Pause className="w-4 h-4" /> Inactive
                          </button>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-2">
                          {!driverDetail.isActive
                            ? "Driver is inactive — not available for bookings."
                            : "Driver is active and available for bookings."}
                        </p>
                      </div>
                    </>
                  )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ============== CAMERA CAPTURE & VERIFICATION MODAL — UNCHANGED ============== */}
      {showCameraModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={handleCloseCamera}
          />
          <div className="relative w-full max-w-lg mx-4 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-luxury-gold" />
                <h3 className="text-white font-semibold">
                  Capture Driver Photo
                </h3>
              </div>
              <button
                onClick={handleCloseCamera}
                className="p-1.5 hover:bg-neutral-800 rounded-lg"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="relative bg-black aspect-[3/4] max-h-[60vh]">
              {!capturedPhoto ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-60 border-2 border-white/20 rounded-2xl" />
                  </div>
                  {!cameraStream && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
                    </div>
                  )}
                </>
              ) : (
                <img
                  src={capturedPhoto}
                  alt="Captured photo"
                  className="w-full h-full object-cover"
                />
              )}

              {verificationState === "verifying" && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-10 h-10 text-luxury-gold animate-spin" />
                  <p className="text-white text-sm font-medium">
                    Verifying dress code...
                  </p>
                  <p className="text-gray-400 text-xs">
                    Checking for face, formal shirt, and tie
                  </p>
                </div>
              )}
            </div>

            <canvas ref={canvasRef} className="hidden" />

            {verificationResult && verificationState !== "verifying" && (
              <div
                className={`mx-4 mt-4 p-4 rounded-lg border ${
                  verificationResult.passed
                    ? "bg-green-500/5 border-green-500/30"
                    : "bg-red-500/5 border-red-500/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-3">
                  {verificationResult.passed ? (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400" />
                  )}
                  <span
                    className={`text-sm font-medium ${verificationResult.passed ? "text-green-400" : "text-red-400"}`}
                  >
                    {verificationResult.passed
                      ? "Dress Code Verified"
                      : "Verification Failed"}
                  </span>
                </div>

                {verificationResult.detections && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[
                      {
                        key: "faceDetected" as const,
                        label: "Face",
                        icon: User,
                      },
                      {
                        key: "shirtDetected" as const,
                        label: "Formal Shirt",
                        icon: Shirt,
                      },
                      {
                        key: "tieDetected" as const,
                        label: "Tie",
                        icon: ShieldCheck,
                      },
                    ].map((item) => {
                      const detected = verificationResult.detections![item.key];
                      return (
                        <div
                          key={item.key}
                          className={`flex flex-col items-center gap-1.5 p-2.5 rounded-lg ${
                            detected
                              ? "bg-green-500/10 border border-green-500/20"
                              : "bg-red-500/10 border border-red-500/20"
                          }`}
                        >
                          <item.icon
                            className={`w-4 h-4 ${detected ? "text-green-400" : "text-red-400"}`}
                          />
                          <span
                            className={`text-xs font-medium ${detected ? "text-green-400" : "text-red-400"}`}
                          >
                            {item.label}
                          </span>
                          <span
                            className={`text-[10px] ${detected ? "text-green-500/70" : "text-red-500/70"}`}
                          >
                            {detected ? "Detected" : "Not Found"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <p
                  className={`text-xs ${verificationResult.passed ? "text-green-400/80" : "text-red-400/80"}`}
                >
                  {verificationResult.message}
                </p>
              </div>
            )}

            <div className="p-4 flex gap-3">
              {!capturedPhoto ? (
                <>
                  <button
                    type="button"
                    onClick={handleSwitchCamera}
                    className="px-4 py-3 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors"
                  >
                    <SwitchCamera className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleCapture}
                    disabled={!cameraStream}
                    className="flex-1 px-4 py-3 bg-luxury-gold text-black font-medium rounded-lg hover:bg-luxury-gold/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Camera className="w-5 h-5" /> Capture Photo
                  </button>
                </>
              ) : verificationState === "idle" ? (
                <>
                  <button
                    type="button"
                    onClick={handleRetake}
                    className="flex-1 px-4 py-3 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" /> Retake
                  </button>
                  <button
                    type="button"
                    onClick={handleVerifyPhoto}
                    className="flex-1 px-4 py-3 bg-luxury-gold text-black font-medium rounded-lg hover:bg-luxury-gold/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4" /> Verify Dress Code
                  </button>
                </>
              ) : verificationState === "verifying" ? (
                <button
                  type="button"
                  disabled
                  className="flex-1 px-4 py-3 bg-neutral-800 text-gray-500 rounded-lg flex items-center justify-center gap-2"
                >
                  <Loader2 className="w-4 h-4 animate-spin" /> Verifying...
                </button>
              ) : verificationState === "passed" ? (
                <>
                  <button
                    type="button"
                    onClick={handleRetake}
                    className="px-4 py-3 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" /> Retake
                  </button>
                  <button
                    type="button"
                    onClick={handleAcceptVerifiedPhoto}
                    className="flex-1 px-4 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-500 transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" /> Use This Photo
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleRetake}
                  className="flex-1 px-4 py-3 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" /> Retake Photo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============== ASSIGN VEHICLE MODAL ============== */}
      {showAssignModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !isAssigning && setShowAssignModal(false)}
          />
          <div className="relative w-full max-w-sm mx-4 bg-neutral-900 border border-neutral-800 rounded-xl">
            <div className="p-5 border-b border-neutral-800">
              <h3 className="text-white font-semibold">
                {driverDetail?.assignedVehicle
                  ? "Change Vehicle"
                  : "Assign Vehicle"}
              </h3>
            </div>
            <div className="p-5">
              <select
                value={selectedVehicleId || ""}
                onChange={(e) => setSelectedVehicleId(e.target.value || null)}
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold/50"
              >
                <option value="">No vehicle (unassign)</option>
                {availableVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.plateNumber}) — {v.category}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 p-5 border-t border-neutral-800">
              <button
                onClick={() => setShowAssignModal(false)}
                disabled={isAssigning}
                className="flex-1 px-4 py-2.5 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignVehicle}
                disabled={isAssigning}
                className="flex-1 px-4 py-2.5 bg-luxury-gold text-black font-medium rounded-lg hover:bg-luxury-gold/90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isAssigning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============== DELETE CONFIRMATION MODAL ============== */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !actionLoading && setShowDeleteConfirm(false)}
          />
          <div className="relative w-full max-w-sm mx-4 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-7 h-7 text-red-400" />
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">
                Remove Driver
              </h3>
              <p className="text-gray-400 text-sm">
                Are you sure you want to remove{" "}
                <span className="text-white font-medium">
                  {deletingDriverName}
                </span>
                ? This will remove all associated documents and cannot be
                undone.
              </p>
            </div>
            <div className="flex gap-3 p-5 border-t border-neutral-800">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeletingDriverId(null);
                }}
                disabled={!!actionLoading}
                className="flex-1 px-4 py-2.5 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={!!actionLoading}
                className="flex-1 px-4 py-2.5 bg-red-500 text-white font-medium rounded-lg hover:bg-red-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============== CHANGE REQUEST MODAL ============== */}
      {showChangeRequestModal && driverDetail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowChangeRequestModal(false)}
          />
          <div className="relative w-full max-w-lg mx-4 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold text-lg">
                  Request Driver Changes
                </h3>
                <p className="text-sm text-gray-400">
                  {driverDetail.firstName} {driverDetail.lastName}
                </p>
              </div>
              <button
                onClick={() => setShowChangeRequestModal(false)}
                className="p-1 hover:bg-neutral-800 rounded"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
              <div>
                <label className="block text-sm text-gray-400 mb-3">
                  Which fields do you need to update? *
                </label>
                <div className="space-y-2">
                  {DRIVER_CHANGE_REQUEST_FIELD_GROUPS.map((group) => {
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
                        <button
                          type="button"
                          onClick={() => {
                            const keys = group.fields.map((f) => f.key);
                            if (allSelected)
                              setChangeRequestFields((p) =>
                                p.filter((k) => !keys.includes(k)),
                              );
                            else
                              setChangeRequestFields((p) => [
                                ...p.filter((k) => !keys.includes(k)),
                                ...keys,
                              ]);
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
                                <CheckCircle className="w-3 h-3 text-black" />
                              )}
                              {selectedInGroup > 0 && !allSelected && (
                                <div className="w-1.5 h-1.5 bg-luxury-gold rounded-sm" />
                              )}
                            </div>
                          </div>
                        </button>
                        <div className="flex flex-wrap gap-1.5 p-2.5 bg-neutral-900/50">
                          {group.fields.map((field) => {
                            const sel = changeRequestFields.includes(field.key);
                            return (
                              <button
                                key={field.key}
                                type="button"
                                onClick={() => {
                                  if (sel)
                                    setChangeRequestFields((p) =>
                                      p.filter((f) => f !== field.key),
                                    );
                                  else
                                    setChangeRequestFields((p) => [
                                      ...p,
                                      field.key,
                                    ]);
                                }}
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] border transition-all ${
                                  sel
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
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Reason for changes *
                </label>
                <textarea
                  value={changeRequestReason}
                  onChange={(e) => setChangeRequestReason(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:border-luxury-gold focus:outline-none resize-none transition-colors"
                  placeholder="e.g. Iqama was renewed and the number has changed; need to update both the number and the document..."
                />
              </div>
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-xs text-blue-400">
                  Your request will be reviewed by admin. Once approved, the
                  selected fields will become editable.
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
                  !changeRequestReason.trim() ||
                  !canModifyDrivers
                }
                title={canModifyDrivers ? undefined : driversLockReason}
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

      {/* ============== IMAGE CROPPER ============== */}
      {cropperState && (
        <ImageCropper
          imageSrc={cropperState.imageSrc}
          onCropComplete={cropperState.onComplete}
          onCancel={() => setCropperState(null)}
          aspect={cropperState.aspect}
          shape={cropperState.shape}
          title={cropperState.title}
        />
      )}

      {/* ============== DOCUMENT VIEWER ============== */}
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
