"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { vendorApi, uploadApi } from "@/lib/api";
import {
  Building2,
  Camera,
  Edit2,
  Save,
  FileText,
  CreditCard,
  Eye,
  Upload,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Users,
  User,
  Loader2,
  X,
  Send,
  XCircle,
  Clock,
  ShieldCheck,
  PenLine,
} from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { useNotification } from "@/lib/notification-context";
import ImageCropper from "@/components/ui/image-cropper";
import DocumentViewer from "@/components/ui/document-viewer";
import {
  PhoneInput,
  EmailInput,
  CRNumberInput,
  VATNumberInput,
  IBANInput,
  BankSelector,
} from "@/components/ui/form-fields";

import { proxiedImageUrl } from "@/lib/image-url";
// ============== TYPES ==============

interface ProfileDocument {
  type: string;
  label: string;
  isUploaded: boolean;
  fileUrl: string | null;
  fileName: string | null;
  expiryDate: string | null;
  requiresExpiry: boolean;
  uploadedAt: string | null;
  filePath: string | null;
}

interface ChangeRequest {
  id: string;
  fields: string[];
  fieldLabels: string[];
  message: string;
  status: string; // PENDING | APPROVED | REJECTED
  adminNote: string | null;
  isResolved: boolean;
  createdAt: string;
  reviewedAt: string | null;
}

interface ExpiryDoc {
  type: string;
  label: string;
  expiryDate: string | null;
}

interface ProfileData {
  id: string;
  status: string;
  isEditable: boolean;
  isApproved: boolean;
  isProfileComplete: boolean;
  // null = everything editable. Empty array = nothing editable. Non-empty =
  // these specific keys are editable.
  editableFields: string[] | null;
  expiringDocs: ExpiryDoc[];
  expiredDocs: ExpiryDoc[];
  changeRequests: ChangeRequest[];
  hasPendingRequest: boolean;
  activeApprovedRequest: {
    id: string;
    fields: string[];
    message: string;
  } | null;
  companyInfo: {
    companyName: string | null;
    logoUrl: string | null;
    crNumber: string | null;
    vatNumber: string | null;
    contactPerson: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    address: string | null;
  };
  bankDetails: {
    bankName: string | null;
    bankAccountName: string | null;
    bankIban: string | null;
  };
  documents: {
    items: ProfileDocument[];
    allUploaded: boolean;
    missingDocuments: string[];
    uploadedCount: number;
    requiredCount: number;
  };
  mou: {
    fileUrl: string | null;
    filePath: string | null;
    expiryDate: string | null;
    uploadedAt: string | null;
  };
  adminComments: Record<
    string,
    Array<{
      id: string;
      comment: string;
      isResolved: boolean;
      createdAt: string;
    }>
  >;
  unresolvedCommentCount: number;
  // Snapshot of field values + doc fileUrls at the moment admin clicked
  // "Request Changes." Used by the frontend to diff current values
  // against the pre-rejection baseline so we can flag fields the
  // vendor has already addressed in this round (emerald state) vs
  // ones still needing attention (red state). Null when no review
  // cycle is active.
  profileSnapshot: Record<string, any> | null;
  user: { id: string; email: string; name: string; phone: string | null };
  createdAt: string;
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
  createdAt: string;
}

interface VendorProfileProps {
  refreshBadges: () => void;
  isApproved: boolean;
}

// ============== HELPERS ==============

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function formatDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ============== STATUS BANNER CONFIG ==============
// Mirrors fleet/drivers' STATUS_CONFIG: each profile status maps to a banner
// background, accent color, and icon. Replaces the old "color-only" banner so
// the visual language is consistent across the portal.

const STATUS_CONFIG: Record<
  string,
  {
    color: string;
    bgColor: string;
    icon: typeof CheckCircle;
    label: string;
    message: string;
  }
> = {
  INVITED: {
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/30",
    icon: PenLine,
    label: "Profile Setup",
    message: "Complete your company profile and submit for admin review.",
  },
  PENDING_REVIEW: {
    color: "text-purple-400",
    bgColor: "bg-purple-500/10 border-purple-500/30",
    icon: Clock,
    label: "Pending Review",
    message:
      "Your profile is under admin review. You'll be notified once approved.",
  },
  CHANGES_REQUESTED: {
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/30",
    icon: AlertTriangle,
    label: "Changes Requested",
    message:
      "Admin has requested changes. Update the highlighted fields and resubmit.",
  },
  APPROVED: {
    color: "text-green-400",
    bgColor: "bg-green-500/10 border-green-500/30",
    icon: ShieldCheck,
    label: "Approved",
    message: "Your profile is approved and active.",
  },
  SUSPENDED: {
    color: "text-red-400",
    bgColor: "bg-red-500/10 border-red-500/30",
    icon: AlertCircle,
    label: "Suspended",
    message: "Your account has been suspended. Contact admin for details.",
  },
};

// ============== DOC EXPIRY INDICATOR ==============
// Hover/tap popover that lists expired/expiring documents with color-coded
// urgency. Identical implementation to the fleet/driver one — uses
// position:fixed with a manually-computed bounding rect so it's not clipped
// by ancestor `overflow:hidden` and stays inside the viewport on mobile.

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
        <p className="text-[11px] text-gray-500">
          {formatDate(doc.expiryDate)}
        </p>
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
      const popover = document.getElementById("profile-expiry-popover");
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
            const popover = document.getElementById("profile-expiry-popover");
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
          id="profile-expiry-popover"
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

// ============== INLINE EXPIRY CHIP ==============
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

// ============== LOGO IMAGE (with loading state) ==============
// Mirrors the load-state pattern used by TopDriverAvatar/DriverAvatar:
// loading → loaded → error. Without this the user sees an empty placeholder
// while the signed GCS URL fetches.
//
// CACHE-RACE FIX:
// When another component (e.g. the top navbar's logo) mounts first and
// primes the browser cache for this URL, the <img> here can finish
// decoding *synchronously* during the React render — before React has
// even attached the `onLoad` listener. The handler then never fires,
// `state` stays at "loading" forever, and the user sees the spinner
// spinning over a fully-ready (but opacity-0) image. The post-mount
// effect below checks `img.complete` / `naturalWidth` and flips state
// manually to cover exactly that case. `naturalWidth > 0` is the guard
// that distinguishes a cached success from a cached failure (complete
// is true for both, but naturalWidth is 0 only for failures).

function LogoImage({ logoUrl }: { logoUrl: string | null }) {
  const [state, setState] = useState<"loading" | "loaded" | "error" | "empty">(
    logoUrl ? "loading" : "empty",
  );
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Compute the resolved src once so both the JSX and the cache-check
  // effect operate on the same value (and we don't run the proxy
  // helper twice per render).
  const resolvedSrc = logoUrl
    ? (proxiedImageUrl(logoUrl, 200) ?? logoUrl)
    : null;

  useEffect(() => {
    setState(logoUrl ? "loading" : "empty");
  }, [logoUrl]);

  // Catch the cache-race: if the <img> already completed before React
  // wired up onLoad (which happens when the navbar primed the cache),
  // peek at the DOM node and advance the state ourselves.
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !resolvedSrc) return;
    if (img.complete) {
      if (img.naturalWidth > 0) {
        setState("loaded");
      } else {
        setState("error");
      }
    }
  }, [resolvedSrc]);

  return (
    <div className="w-28 h-28 rounded-xl bg-neutral-800 border-2 border-dashed border-neutral-600 flex items-center justify-center overflow-hidden relative">
      {resolvedSrc && state !== "error" && (
        <img
          ref={imgRef}
          src={resolvedSrc}
          alt="Logo"
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            state === "loaded" ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setState("loaded")}
          onError={() => setState("error")}
        />
      )}
      {state === "loading" && (
        <Loader2 className="w-6 h-6 text-luxury-gold animate-spin absolute" />
      )}
      {(state === "empty" || state === "error") && (
        <Building2 className="w-12 h-12 text-neutral-600 absolute" />
      )}
    </div>
  );
}

// ============== CHANGE REQUEST FIELD GROUPS ==============
// Used by the request-changes modal. Keys must align with VENDOR_EDITABLE_FIELDS
// on the backend.

const VENDOR_CHANGE_REQUEST_FIELD_GROUPS = [
  {
    section: "Company Information",
    icon: Building2,
    fields: [
      { key: "companyName", label: "Company Name" },
      { key: "crNumber", label: "CR Number" },
      { key: "vatNumber", label: "VAT Number" },
      { key: "contactPerson", label: "Contact Person" },
      { key: "contactPhone", label: "Contact Phone" },
      { key: "address", label: "Address" },
      { key: "logo", label: "Company Logo" },
    ],
  },
  {
    section: "Business Documents",
    icon: FileText,
    fields: [
      { key: "CR", label: "Commercial Registration" },
      { key: "VAT", label: "VAT Certificate" },
      { key: "CHAMBER_OF_COMMERCE", label: "Chamber of Commerce" },
      { key: "BALADY", label: "Balady License" },
      { key: "NATIONAL_ADDRESS", label: "National Address" },
      { key: "IBAN_LETTER", label: "IBAN Letter" },
      { key: "mou", label: "MOU Document" },
    ],
  },
  {
    section: "Bank Details",
    icon: CreditCard,
    fields: [
      { key: "bankName", label: "Bank Name" },
      { key: "bankAccountName", label: "Account Name" },
      { key: "bankIban", label: "IBAN" },
    ],
  },
];

// ============== MAIN COMPONENT ==============

export default function VendorProfilePanel({
  refreshBadges,
}: VendorProfileProps) {
  const { showNotification } = useNotification();

  // Profile data
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Editing
  const [isEditingCompany, setIsEditingCompany] = useState(false);
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [companyForm, setCompanyForm] = useState<Record<string, string>>({});
  const [bankForm, setBankForm] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Document upload — track per-doc upload state. We collect expiry inline (no
  // more `prompt()` — matches the driver/fleet upload UX).
  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);
  const [docExpiryInput, setDocExpiryInput] = useState<Record<string, string>>(
    {},
  );
  const [pendingFile, setPendingFile] = useState<Record<string, File>>({});

  // MOU upload state
  const [mouFile, setMouFile] = useState<File | null>(null);
  const [mouExpiryInput, setMouExpiryInput] = useState("");
  const [isUploadingMou, setIsUploadingMou] = useState(false);

  // Team members
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);

  // Submit for review
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Logo upload
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  // Two-stage logo flow: user picks a file, we stage it here as a
  // data URL + original file, the ImageCropper modal opens (preview
  // first, opt into adjust). When the user confirms in the modal,
  // the resulting Blob runs through the actual upload pipeline.
  // Staging the original File alongside the data URL lets us preserve
  // the filename (and therefore the extension) for the upload — the
  // cropper's data URL alone would lose that.
  const [logoCropper, setLogoCropper] = useState<{
    imageSrc: string;
    originalName: string;
  } | null>(null);

  // Generic image cropper for documents + MOU. Same two-stage flow as
  // the logo cropper, but routed through a shared state so any non-PDF
  // upload anywhere in the profile section can go preview-first.
  // `onComplete` carries the destination handler — the cropper itself
  // doesn't know if it's a doc, MOU, or something else, it just hands
  // back the resulting File.
  const [imageUploadCropper, setImageUploadCropper] = useState<{
    imageSrc: string;
    originalName: string;
    onComplete: (file: File) => void;
    title: string;
  } | null>(null);

  // Document viewer — handles both images and PDFs inline in a modal
  // instead of opening a new browser tab. Mirrors the partner profile
  // pattern (and vendor fleet/drivers pages), giving consistent UX
  // across the portal. Three pieces of state because the viewer
  // supports a custom title and filename label in its header.
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerFileName, setViewerFileName] = useState<string | undefined>(
    undefined,
  );
  const [viewerTitle, setViewerTitle] = useState<string | undefined>(undefined);

  // Small helper so the View buttons stay declarative — pass the URL,
  // a filename for the header chip, and a friendly title.
  const openViewer = (
    url: string,
    fileName: string | undefined,
    title: string,
  ) => {
    setViewerUrl(url);
    setViewerFileName(fileName);
    setViewerTitle(title);
  };

  // Auto-detect helper. Image files → open the cropper (preview-first,
  // user confirms or opts into adjust). PDFs → skip the cropper and
  // pass straight through to `onReady`. Same pattern used in
  // components/vendor/fleet.tsx + drivers.tsx so behaviour stays
  // consistent across the portal. Caller passes the file picked from
  // the input, a callback that takes the final File (cropped image OR
  // untouched PDF), and a title for the cropper header.
  const stageFileForUpload = (
    file: File,
    onReady: (f: File) => void,
    title: string,
  ) => {
    if (!file.type.startsWith("image/")) {
      // Not an image (PDF, etc.) — bypass the cropper entirely.
      onReady(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageUploadCropper({
        imageSrc: reader.result as string,
        originalName: file.name,
        title,
        onComplete: (croppedFile: File) => {
          setImageUploadCropper(null);
          onReady(croppedFile);
        },
      });
    };
    reader.onerror = () => {
      showNotification("error", "Could not read the file. Please try again.");
    };
    reader.readAsDataURL(file);
  };

  // Change request modal state
  const [showChangeRequestModal, setShowChangeRequestModal] = useState(false);
  const [changeRequestFields, setChangeRequestFields] = useState<string[]>([]);
  const [changeRequestReason, setChangeRequestReason] = useState("");
  const [submittingChangeRequest, setSubmittingChangeRequest] = useState(false);

  // ============== FETCH PROFILE ==============

  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await vendorApi.getProfile();
      if (res.success && res.data) {
        setProfile(res.data);
        const ci = res.data.companyInfo;
        setCompanyForm({
          companyName: ci.companyName || "",
          crNumber: ci.crNumber || "",
          vatNumber: ci.vatNumber || "",
          contactPerson: ci.contactPerson || "",
          contactPhone: ci.contactPhone || "",
          contactEmail: ci.contactEmail || "",
          address: ci.address || "",
        });
        const bd = res.data.bankDetails;
        setBankForm({
          bankName: bd.bankName || "",
          bankAccountName: bd.bankAccountName || "",
          bankIban: bd.bankIban || "",
        });
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load profile");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchTeamMembers = useCallback(async () => {
    setIsLoadingTeam(true);
    try {
      const res = await vendorApi.getTeamMembers();
      if (res.success && res.data) setTeamMembers(res.data.members || []);
    } catch {
      /* silent */
    } finally {
      setIsLoadingTeam(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
    fetchTeamMembers();
  }, [fetchProfile, fetchTeamMembers]);

  // ============== EDIT PERMISSION HELPER ==============
  // Single source of truth for "can I edit this field?". null = INVITED (all
  // editable). Otherwise check against the list returned by the backend.
  // Per-field editability. The semantics:
  //   - isEditable=false       → nothing editable, anywhere
  //   - isEditable=true, editableFields null OR []  → everything in this
  //     status is editable (backend hasn't restricted to specific fields)
  //   - isEditable=true, editableFields=["x","y"]   → only those fields
  //
  // The empty-array case matters for ONBOARDING: backend returns
  // editableFields=[] because the partner is in a global-edit state,
  // not a field-restricted one (which only happens after admin
  // rejects specific fields in CHANGES_REQUESTED). Treating [] as
  // "nothing editable" silently hides every input — was the
  // root cause of vendor profile sections appearing locked during
  // onboarding even though isEditable was true.
  const isFieldEditable = (key: string): boolean => {
    if (!profile) return false;
    if (!profile.isEditable) return false;
    if (
      profile.editableFields === null ||
      profile.editableFields.length === 0
    ) {
      return true;
    }
    return profile.editableFields.includes(key);
  };

  // Bank fields are a group — if any one is editable, the whole bank block
  // is editable (avoid stale partial saves).
  const isBankEditable = (): boolean => {
    return (
      isFieldEditable("bankName") ||
      isFieldEditable("bankAccountName") ||
      isFieldEditable("bankIban")
    );
  };

  // ============== SAVE COMPANY INFO ==============

  const handleSaveCompany = async () => {
    setIsSaving(true);
    try {
      const res = await vendorApi.updateCompanyInfo(companyForm);
      if (res.success) {
        showNotification("success", res.message || "Company info updated");
        setIsEditingCompany(false);
        fetchProfile();
        refreshBadges();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  // ============== SAVE BANK DETAILS ==============

  const handleSaveBank = async () => {
    setIsSaving(true);
    try {
      const res = await vendorApi.updateBankDetails({
        bankName: bankForm.bankName,
        bankAccountName: bankForm.bankAccountName,
        bankIban: bankForm.bankIban,
      });
      if (res.success) {
        showNotification("success", res.message || "Bank details updated");
        setIsEditingBank(false);
        fetchProfile();
        refreshBadges();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  // ============== UPLOAD DOCUMENT ==============
  // Two-step: vendor picks a file → if doc requires expiry, we surface an
  // inline date input below the row → vendor sets expiry → click "Upload".
  // No more browser `prompt()` (which the driver/fleet sections also avoid).

  const handleDocFilePick = (
    type: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset the input so re-picking the same file still triggers
    // onChange (browsers suppress identical selections otherwise).
    e.target.value = "";
    // Look up the doc label for a friendlier cropper title. Falls
    // back to the raw type key if the doc isn't found (shouldn't
    // happen, but safe).
    const doc = profile?.documents.items.find((d) => d.type === type);
    const label = doc?.label || type;
    // Auto-detect: images go through the preview-first cropper, PDFs
    // bypass it entirely. Either way the resulting File lands in
    // `pendingFile` and the existing expiry-date confirmation flow
    // takes over from there.
    stageFileForUpload(
      file,
      (finalFile) => {
        setPendingFile((p) => ({ ...p, [type]: finalFile }));
      },
      `Upload ${label}`,
    );
  };

  const handleDocUploadConfirm = async (type: string) => {
    if (!profile) return;
    const file = pendingFile[type];
    if (!file) return;

    const doc = profile.documents.items.find((d) => d.type === type);
    const expiryRequired = doc?.requiresExpiry;
    const expiryDate = docExpiryInput[type];

    if (expiryRequired && !expiryDate) {
      showNotification(
        "error",
        `${doc?.label || type} requires an expiry date`,
      );
      return;
    }

    setUploadingDocType(type);
    try {
      const signedRes = await uploadApi.getSignedUploadUrl({
        fileName: file.name,
        fileType: file.type,
        section: "vendors",
        folder: "profile",
        entityId: profile.id,
      });
      if (!signedRes.success || !signedRes.data)
        throw new Error("Upload URL failed");

      await fetch(signedRes.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      const res = await vendorApi.uploadDocument({
        type,
        fileUrl: signedRes.data.filePath,
        fileName: file.name,
        expiryDate: expiryDate || undefined,
      });

      if (res.success) {
        showNotification("success", res.message || "Document uploaded");
        setPendingFile((p) => {
          const { [type]: _, ...rest } = p;
          return rest;
        });
        setDocExpiryInput((p) => {
          const { [type]: _, ...rest } = p;
          return rest;
        });
        fetchProfile();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Upload failed");
    } finally {
      setUploadingDocType(null);
    }
  };

  // ============== UPLOAD LOGO ==============
  //
  // Two-stage flow for graceful UX:
  //   1. User clicks the camera overlay → file picker opens
  //   2. handleLogoFileChosen reads the file and stages it in the
  //      cropper. The cropper opens in PREVIEW mode by default — user
  //      sees what they're about to upload before anything hits the
  //      network. They can confirm with one click ("Upload"), opt into
  //      cropping ("Adjust"), or cancel out entirely.
  //   3. On confirm, handleLogoCropComplete receives a Blob and runs
  //      the actual GCS upload + API call.
  //
  // Previously this was a single handler that uploaded the picked file
  // immediately — no preview, no undo, no cropping option. Matches
  // partner-side behaviour now.

  const handleLogoFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset the input so picking the same file twice still fires
    // onChange (browsers ignore identical selections).
    e.target.value = "";
    // Basic type sanity. The accept="image/*" attribute already
    // narrows the picker, but defence-in-depth is cheap.
    if (!file.type.startsWith("image/")) {
      showNotification("error", "Please pick an image file");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoCropper({
        imageSrc: reader.result as string,
        originalName: file.name,
      });
    };
    reader.onerror = () => {
      showNotification("error", "Could not read the file. Please try again.");
    };
    reader.readAsDataURL(file);
  };

  const handleLogoCropComplete = async (blob: Blob) => {
    if (!profile) return;
    // Build a File from the blob so the rest of the upload pipeline
    // (which reads .name and .type) keeps working without changes.
    // Cropper always emits JPEG; the original extension is replaced.
    const baseName =
      logoCropper?.originalName.replace(/\.[^.]+$/, "") || "logo";
    const file = new File([blob], `${baseName}.jpg`, {
      type: blob.type || "image/jpeg",
    });

    setLogoCropper(null);
    setIsUploadingLogo(true);
    try {
      const signedRes = await uploadApi.getSignedUploadUrl({
        fileName: file.name,
        fileType: file.type,
        section: "vendors",
        folder: "logos",
        entityId: profile.id,
      });
      if (!signedRes.success || !signedRes.data)
        throw new Error("Upload URL failed");

      await fetch(signedRes.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      const res = await vendorApi.uploadLogo({
        logoUrl: signedRes.data.filePath,
      });
      if (res.success) {
        showNotification("success", "Logo updated");
        fetchProfile();
        refreshBadges();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Logo upload failed");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  // ============== UPLOAD MOU ==============

  // MOU file picker — auto-detects image vs PDF. Images route through
  // the preview-first cropper before landing in `mouFile`; PDFs go
  // straight through. Same auto-detect pattern as docs above and as
  // fleet/drivers sections. Used by both the initial upload dropzone
  // and the "Replace" button so behaviour is consistent.
  const handleMouFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    stageFileForUpload(
      file,
      (finalFile) => setMouFile(finalFile),
      "Upload MOU",
    );
  };

  const handleMouUpload = async () => {
    if (!profile || !mouFile) return;
    if (!mouExpiryInput) {
      showNotification("error", "MOU expiry date is required");
      return;
    }
    setIsUploadingMou(true);
    try {
      const signedRes = await uploadApi.getSignedUploadUrl({
        fileName: mouFile.name,
        fileType: mouFile.type,
        section: "vendors",
        folder: "mou",
        entityId: profile.id,
      });
      if (!signedRes.success || !signedRes.data)
        throw new Error("Upload URL failed");
      await fetch(signedRes.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": mouFile.type },
        body: mouFile,
      });
      const res = await vendorApi.uploadMou({
        fileUrl: signedRes.data.filePath,
        expiryDate: mouExpiryInput,
      });
      if (res.success) {
        showNotification("success", "MOU uploaded");
        setMouFile(null);
        setMouExpiryInput("");
        fetchProfile();
      }
    } catch (err: any) {
      showNotification("error", err.message || "MOU upload failed");
    } finally {
      setIsUploadingMou(false);
    }
  };

  // ============== SUBMIT FOR REVIEW ==============

  const handleSubmitForReview = async () => {
    setIsSubmitting(true);
    try {
      const res = await vendorApi.submitProfileForReview();
      if (res.success) {
        showNotification(
          "success",
          res.message || "Profile submitted for review",
        );
        fetchProfile();
        refreshBadges();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to submit");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============== REQUEST CHANGES ==============

  const handleSubmitChangeRequest = async () => {
    if (!profile) return;
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
      const res = await vendorApi.requestProfileChanges({
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
        fetchProfile();
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

  // Open the modal with affected docs pre-selected.
  const openChangeRequestModal = (preSelected: string[] = []) => {
    setChangeRequestFields(preSelected);
    setShowChangeRequestModal(true);
  };

  // ============== HELPER: GET FIELD COMMENTS ==============

  const getFieldComments = (fieldName: string) => {
    if (!profile?.adminComments) return [];
    return (profile.adminComments[fieldName] || []).filter(
      (c) => !c.isResolved,
    );
  };

  // True when admin has rejected this specific field/doc (vs. just left a
  // plain comment). Drives the bold red border + "NEEDS UPDATE" badge so
  // the vendor can spot the affected items at a glance without reading
  // every comment.
  const isFieldRejected = (fieldName: string) =>
    getFieldComments(fieldName).some((c) =>
      c.comment?.startsWith?.("❌ Rejected:"),
    );

  // True when (a) admin rejected this field AND (b) the vendor has
  // already changed it from the snapshot baseline. Drives the emerald
  // border + "ADDRESSED" badge so the vendor knows what they've
  // already handled in this round before submitting.
  //
  // currentValue is whatever the form has now (typically `companyForm[key]`
  // for input fields, or the upload doc's fileUrl/key for document fields).
  // Both sides are normalized to "" / null before comparison so an empty
  // string vs null doesn't read as "changed."
  const isFieldAddressed = (fieldName: string, currentValue: any): boolean => {
    if (!isFieldRejected(fieldName)) return false;
    const snap = profile?.profileSnapshot;
    if (!snap || typeof snap !== "object" || Object.keys(snap).length === 0) {
      return false;
    }
    const prev = (snap as Record<string, any>)[fieldName];
    if (prev === undefined) return false;
    const norm = (v: any) => (v === undefined || v === null ? "" : String(v));
    return norm(prev) !== norm(currentValue);
  };

  // Summary counts driving the banner at the top of the profile when a
  // review cycle is active. `pending` = fields admin rejected that vendor
  // hasn't touched yet. `addressed` = fields the vendor has changed from
  // the snapshot baseline. The two together cover everything in the
  // current review round.
  const rejectionSummary = (() => {
    if (!profile?.adminComments)
      return { rejected: [], addressed: [], pending: [] };
    const rejectedFields = Object.keys(profile.adminComments).filter((f) =>
      isFieldRejected(f),
    );
    const addressed: string[] = [];
    const pending: string[] = [];
    for (const f of rejectedFields) {
      // For input fields the current value lives in companyForm / bankForm.
      // For doc/MOU fields the snapshot stores the raw filePath (the
      // stable GCS path the backend writes) — NOT the signed fileUrl,
      // which is regenerated per request. Comparing against fileUrl
      // would make every flagged doc read as "addressed" since the URL
      // tokens differ between requests even when the file is unchanged.
      const current =
        (companyForm as Record<string, any>)[f] ??
        (bankForm as Record<string, any>)[f] ??
        profile.documents?.items?.find((d) => d.type === f)?.filePath ??
        (f === "mou" ? profile.mou?.filePath : undefined);
      if (isFieldAddressed(f, current)) addressed.push(f);
      else pending.push(f);
    }
    return { rejected: rejectedFields, addressed, pending };
  })();

  // ============== LOADING ==============

  if (isLoading || !profile) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[profile.status] || STATUS_CONFIG.INVITED;
  const StatusIcon = statusCfg.icon;

  // Pre-compute affected doc types so both the popover CTA and the dedicated
  // Request Changes button can pre-tick them.
  const allAffectedDocTypes = [
    ...profile.expiredDocs.map((d) => d.type),
    ...profile.expiringDocs.map((d) => d.type),
  ];

  // ============== RENDER ==============

  return (
    <div className="space-y-6">
      {/* ============== STATUS BANNER ==============
          Mirrors fleet/drivers' banner: icon + status + inline expiry popover
          + Verified chip on the right when APPROVED. */}
      <div
        className={`p-4 rounded-xl border flex items-center gap-3 ${statusCfg.bgColor}`}
      >
        <StatusIcon className={`w-5 h-5 flex-shrink-0 ${statusCfg.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-sm font-medium ${statusCfg.color}`}>
              {statusCfg.label}
            </p>
            {profile.hasPendingRequest && (
              <span className="px-2 py-0.5 text-xs rounded-full border bg-amber-500/15 text-amber-400 border-amber-500/40 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Change Request Pending
              </span>
            )}
            {/* Doc expiry chip is APPROVED-only. Pre-approval the
                warning is just noise — admin hasn't validated the
                uploads yet, and the only action attached to the chip
                (Request Changes) is already locked to APPROVED status,
                so the chip would render as a decoration with no
                clickable affordance. Hiding it entirely keeps the
                onboarding focus on "finish your profile and submit"
                rather than mixing in "your docs might expire soon"
                signals that the vendor can't act on anyway. */}
            {profile.status === "APPROVED" && (
              <DocExpiryIndicator
                expiringDocs={profile.expiringDocs}
                expiredDocs={profile.expiredDocs}
                onRequestChanges={
                  !profile.hasPendingRequest
                    ? openChangeRequestModal
                    : undefined
                }
              />
            )}
          </div>
          <p className={`text-xs opacity-80 mt-0.5 ${statusCfg.color}`}>
            {statusCfg.message}
          </p>
          {profile.unresolvedCommentCount > 0 && (
            <p className={`text-xs mt-1 font-medium ${statusCfg.color}`}>
              {profile.unresolvedCommentCount} unresolved comment
              {profile.unresolvedCommentCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        {profile.status === "APPROVED" && (
          <span className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-medium rounded-full border border-green-500/30 flex-shrink-0">
            Verified
          </span>
        )}
      </div>

      {/* ============== CHANGE REQUEST PANEL ==============
          APPROVED vendors get a dedicated panel to request edits + see recent
          requests. Mirrors driver/fleet exactly. */}
      {profile.status === "APPROVED" && (
        <div className="p-4 bg-neutral-800/50 border border-neutral-700 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Edit2 className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">
                  Need to update your profile?
                </p>
                <p className="text-xs text-gray-500">
                  Submit a change request to admin
                </p>
              </div>
            </div>
            <button
              onClick={() => openChangeRequestModal(allAffectedDocTypes)}
              disabled={profile.hasPendingRequest}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {profile.hasPendingRequest ? (
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
          {profile.changeRequests.length > 0 && (
            <div className="mt-3 pt-3 border-t border-neutral-700 space-y-2">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                Recent Requests
              </p>
              {profile.changeRequests.slice(0, 3).map((req) => {
                const statusBadge =
                  req.status === "PENDING"
                    ? {
                        text: "⏳ Pending",
                        cls: "bg-amber-500/20 text-amber-400",
                      }
                    : req.status === "APPROVED"
                      ? req.isResolved
                        ? {
                            text: "✓ Resolved",
                            cls: "bg-green-500/20 text-green-400",
                          }
                        : {
                            text: "🔓 Approved",
                            cls: "bg-blue-500/20 text-blue-400",
                          }
                      : {
                          text: "✗ Rejected",
                          cls: "bg-red-500/20 text-red-400",
                        };
                return (
                  <div
                    key={req.id}
                    className={`p-2.5 rounded-lg border text-xs ${
                      req.status === "PENDING" ||
                      (req.status === "APPROVED" && !req.isResolved)
                        ? "bg-amber-500/5 border-amber-500/20"
                        : "bg-neutral-800/50 border-neutral-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadge.cls}`}
                      >
                        {statusBadge.text}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {formatDate(req.createdAt)}
                      </span>
                    </div>
                    <p className="text-gray-400 mt-1">
                      Fields: {req.fieldLabels.join(", ")}
                    </p>
                    {req.adminNote && (
                      <p className="text-[11px] text-gray-500 mt-1 italic">
                        Admin: {req.adminNote}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============== COMPANY HEADER WITH LOGO ============== */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative">
            <LogoImage logoUrl={profile.companyInfo.logoUrl} />
            {/* Logo edit is no longer gated by isFieldEditable —
                branding isn't subject to admin review and shouldn't
                require approval. Backend now returns canEditLogo
                (true unless SUSPENDED); falls back to isFieldEditable
                for older API responses. */}
            {((profile as any).canEditLogo ?? isFieldEditable("logo")) && (
              <label className="absolute -bottom-2 -right-2 w-10 h-10 bg-luxury-gold rounded-full flex items-center justify-center cursor-pointer hover:bg-luxury-gold/90 transition-colors">
                {isUploadingLogo ? (
                  <Loader2 className="w-5 h-5 text-black animate-spin" />
                ) : (
                  <Camera className="w-5 h-5 text-black" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoFileChosen}
                  disabled={isUploadingLogo}
                />
              </label>
            )}
          </div>
          <div className="text-center sm:text-left flex-1">
            <h2 className="text-2xl font-bold text-white">
              {profile.companyInfo.companyName || "Company Name"}
            </h2>
            <p className="text-gray-400 mt-1">
              {profile.companyInfo.contactPerson || profile.user.name}
            </p>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-3">
              <span
                className={`px-3 py-1 text-sm rounded-full border ${statusCfg.bgColor} ${statusCfg.color}`}
              >
                {statusCfg.label}
              </span>
              {profile.companyInfo.crNumber && (
                <span className="text-sm text-gray-500">
                  CR: {profile.companyInfo.crNumber}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ============== REVIEW PROGRESS BANNER ==============
          Only renders when admin has an active review cycle (at least
          one field has an unresolved rejection comment). Shows running
          counts so the vendor knows how many items they've addressed
          in this round vs how many still need attention — useful
          before clicking Submit so they don't bounce back from admin
          for an item they overlooked. The per-field red/emerald
          badges below still do the heavy lifting; this banner is the
          at-a-glance summary. */}
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
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
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

      {/* ============== COMPANY DETAILS ============== */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-white font-semibold">Company Details</h3>
          {profile.isEditable && (
            <button
              onClick={() => setIsEditingCompany(!isEditingCompany)}
              className="px-4 py-2 bg-luxury-gold/10 text-luxury-gold rounded-lg hover:bg-luxury-gold/20 transition-colors flex items-center gap-2"
            >
              <Edit2 className="w-4 h-4" />
              {isEditingCompany ? "Cancel" : "Edit"}
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { key: "companyName", label: "Company Name" },
            { key: "contactPerson", label: "Contact Person" },
            { key: "contactEmail", label: "Email", readonly: true },
            { key: "contactPhone", label: "Phone" },
            { key: "crNumber", label: "CR Number" },
            { key: "vatNumber", label: "VAT Number" },
            { key: "address", label: "Address", fullWidth: true },
          ].map(({ key, label, readonly, fullWidth }) => {
            const comments = getFieldComments(key);
            const fieldLocked = !readonly && !isFieldEditable(key);
            const isRejected = isFieldRejected(key);
            const isDisabled = !isEditingCompany || readonly || fieldLocked;
            const fieldValue = companyForm[key] || "";
            // Addressed means admin rejected this field AND the vendor has
            // since changed it from the snapshot baseline. We split it out
            // from needsUpdate so the visual flips from red ("still needs
            // attention") to emerald ("you've addressed this") the moment
            // the vendor types a new value. Comment text below stays
            // visible either way so the vendor doesn't lose context.
            const isAddressed = isFieldAddressed(key, fieldValue);
            const needsUpdate = isRejected && !isAddressed;
            const handleFieldChange = (newValue: string) =>
              setCompanyForm((p) => ({ ...p, [key]: newValue }));

            // Specialized inputs from the shared form-fields library
            // for the fields that need formatting/validation. The rest
            // fall through to a plain text input with the same styling
            // the file used before this refactor. Each branch passes
            // `label=""` so the parent's label-with-badges wins, and
            // forwards `needsUpdate` (NOT `isRejected`) via `error` so
            // the red border drops as soon as the vendor enters a
            // different value — the addressed state is then conveyed by
            // the emerald wrapper added below for the free-form input.
            let inputEl: React.ReactNode;
            if (key === "contactPhone") {
              inputEl = (
                <PhoneInput
                  value={fieldValue}
                  onChange={handleFieldChange}
                  label=""
                  disabled={isDisabled}
                  error={needsUpdate}
                />
              );
            } else if (key === "contactEmail") {
              inputEl = (
                <EmailInput
                  value={fieldValue}
                  onChange={handleFieldChange}
                  label=""
                  disabled={isDisabled}
                  error={needsUpdate}
                />
              );
            } else if (key === "crNumber") {
              inputEl = (
                <CRNumberInput
                  value={fieldValue}
                  onChange={handleFieldChange}
                  label=""
                  disabled={isDisabled}
                  error={needsUpdate}
                />
              );
            } else if (key === "vatNumber") {
              inputEl = (
                <VATNumberInput
                  value={fieldValue}
                  onChange={handleFieldChange}
                  label=""
                  disabled={isDisabled}
                  error={needsUpdate}
                />
              );
            } else {
              // companyName, contactPerson, address — free-form text.
              // Three-state border: emerald when addressed, red when
              // still needs update, neutral otherwise.
              inputEl = (
                <input
                  type="text"
                  value={fieldValue}
                  onChange={(e) => handleFieldChange(e.target.value)}
                  disabled={isDisabled}
                  className={`w-full px-4 py-3 bg-neutral-800 rounded-lg text-white disabled:opacity-60 focus:outline-none ${
                    isAddressed
                      ? "border-2 border-emerald-500/60 focus:border-emerald-400"
                      : needsUpdate
                        ? "border-2 border-red-500/60 focus:border-red-400"
                        : "border border-neutral-700 focus:border-luxury-gold/50"
                  }`}
                />
              );
            }

            return (
              <div key={key} className={fullWidth ? "md:col-span-2" : ""}>
                <label className="block text-sm text-gray-400 mb-2 flex items-center gap-1.5">
                  {label}
                  {fieldLocked && isEditingCompany && (
                    <span className="px-1.5 py-0.5 bg-neutral-700 text-gray-400 text-[10px] rounded font-medium">
                      Locked
                    </span>
                  )}
                  {/* NEEDS UPDATE / ADDRESSED — mutually exclusive.
                      Needs Update flags an open admin rejection; Addressed
                      lights up the moment vendor changes the value from
                      the snapshot baseline. Pair with the input border
                      below so the field's state is visible at a glance. */}
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
                </label>
                {inputEl}
                {comments.map((c) => (
                  <p
                    key={c.id}
                    className="text-xs text-amber-400 flex items-start gap-1 mt-1"
                  >
                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    {c.comment}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
        {isEditingCompany && (
          <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-neutral-800">
            <button
              onClick={() => setIsEditingCompany(false)}
              className="px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveCompany}
              disabled={isSaving}
              className="px-4 py-2 bg-luxury-gold text-black font-medium rounded-lg hover:bg-luxury-gold/90 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Changes
            </button>
          </div>
        )}
      </div>

      {/* ============== BUSINESS DOCUMENTS ============== */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-luxury-gold/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-luxury-gold" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Business Documents</h3>
              <p className="text-xs text-gray-500">
                {profile.documents.uploadedCount}/
                {profile.documents.requiredCount} uploaded
              </p>
            </div>
          </div>
          {profile.documents.allUploaded ? (
            <span className="px-3 py-1.5 bg-green-500/10 text-green-400 text-xs rounded-lg border border-green-500/20 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> All Complete
            </span>
          ) : (
            <span className="px-3 py-1.5 bg-amber-500/10 text-amber-400 text-xs rounded-lg border border-amber-500/20 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />{" "}
              {profile.documents.missingDocuments.length} missing
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profile.documents.items.map((doc) => {
            const comments = getFieldComments(doc.type);
            const docEditable = isFieldEditable(doc.type);
            const hasPendingFile = !!pendingFile[doc.type];
            const expiryNeeded =
              doc.requiresExpiry && hasPendingFile && !docExpiryInput[doc.type];
            const isRejected = isFieldRejected(doc.type);
            // Addressed when admin rejected this doc AND the vendor has
            // since uploaded a replacement. We compare against `filePath`
            // (the stable GCS path) NOT `fileUrl` — the latter is a
            // signed URL regenerated on every getProfile call, so it
            // changes even when the underlying file hasn't, which would
            // make every flagged doc read as "addressed" incorrectly.
            // The backend snapshot stores filePath equivalents.
            const isAddressed =
              isRejected &&
              !!profile.profileSnapshot &&
              typeof profile.profileSnapshot === "object" &&
              (profile.profileSnapshot as Record<string, any>)[doc.type] !==
                undefined &&
              (profile.profileSnapshot as Record<string, any>)[doc.type] !==
                (doc.filePath ?? null);
            const needsUpdate = isRejected && !isAddressed;
            return (
              <div
                key={doc.type}
                className={`p-4 bg-neutral-800 rounded-xl ${
                  isAddressed
                    ? "border-2 border-emerald-500/60"
                    : needsUpdate
                      ? "border-2 border-red-500/60"
                      : doc.isUploaded
                        ? "border border-neutral-700"
                        : "border border-red-500/30"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        doc.isUploaded ? "bg-green-500/20" : "bg-red-500/20"
                      }`}
                    >
                      {doc.isUploaded ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                    <span className="text-white font-medium text-sm">
                      {doc.label}
                    </span>
                    {/* NEEDS UPDATE / ADDRESSED — mutually exclusive.
                        Mirrors the input-field pattern. Addressed wins
                        once the vendor uploads a replacement file. */}
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
                    {/* Inline expiry chip — surfaces days-remaining right next
                        to the doc label. */}
                    {doc.isUploaded && doc.expiryDate && (
                      <InlineExpiryChip expiryDate={doc.expiryDate} size="xs" />
                    )}
                  </div>
                </div>
                {doc.isUploaded ? (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">
                      {doc.fileName || "Uploaded"}
                      {doc.expiryDate &&
                        ` · Expires: ${formatDate(doc.expiryDate)}`}
                    </p>
                    <div className="flex gap-2">
                      {doc.fileUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            openViewer(
                              doc.fileUrl as string,
                              doc.fileName || undefined,
                              doc.label,
                            )
                          }
                          className="flex-1 px-3 py-2 bg-neutral-700 text-gray-300 rounded-lg text-xs hover:bg-neutral-600 transition-colors flex items-center justify-center gap-1"
                        >
                          <Eye className="w-3 h-3" /> View
                        </button>
                      )}
                      {docEditable && (
                        <label className="px-3 py-2 bg-neutral-700 text-gray-300 rounded-lg text-xs hover:bg-neutral-600 transition-colors cursor-pointer flex items-center gap-1">
                          {uploadingDocType === doc.type ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Upload className="w-3 h-3" />
                          )}
                          Replace
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.jpg,.jpeg,.png,.webp"
                            onChange={(e) => handleDocFilePick(doc.type, e)}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-red-400 mb-2">Not uploaded</p>
                    {docEditable ? (
                      <label className="w-full px-3 py-2 bg-luxury-gold/10 text-luxury-gold rounded-lg text-xs hover:bg-luxury-gold/20 transition-colors cursor-pointer flex items-center justify-center gap-1">
                        {uploadingDocType === doc.type ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Upload className="w-3 h-3" />
                        )}
                        Upload Document
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                          onChange={(e) => handleDocFilePick(doc.type, e)}
                        />
                      </label>
                    ) : (
                      <p className="text-[11px] text-gray-500 italic">
                        Locked — submit a change request to upload
                      </p>
                    )}
                  </div>
                )}

                {/* Inline expiry input + confirm button — shows after vendor
                    picks a file. No more browser prompt(). */}
                {hasPendingFile && (
                  <div className="mt-3 pt-3 border-t border-neutral-700 space-y-2">
                    <p className="text-[11px] text-gray-400 truncate">
                      Selected: {pendingFile[doc.type].name}
                    </p>
                    {doc.requiresExpiry && (
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-1">
                          Expiry date *
                        </label>
                        <input
                          type="date"
                          value={docExpiryInput[doc.type] || ""}
                          onChange={(e) =>
                            setDocExpiryInput((p) => ({
                              ...p,
                              [doc.type]: e.target.value,
                            }))
                          }
                          className="w-full px-2 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-white text-xs focus:outline-none focus:border-luxury-gold/50"
                        />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setPendingFile((p) => {
                            const { [doc.type]: _, ...rest } = p;
                            return rest;
                          });
                          setDocExpiryInput((p) => {
                            const { [doc.type]: _, ...rest } = p;
                            return rest;
                          });
                        }}
                        className="flex-1 px-2 py-1.5 bg-neutral-700 text-gray-300 rounded text-xs hover:bg-neutral-600"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDocUploadConfirm(doc.type)}
                        disabled={uploadingDocType === doc.type || expiryNeeded}
                        className="flex-1 px-2 py-1.5 bg-luxury-gold text-black font-medium rounded text-xs hover:bg-luxury-gold/90 disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        {uploadingDocType === doc.type ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Upload className="w-3 h-3" />
                        )}
                        Upload
                      </button>
                    </div>
                  </div>
                )}

                {comments.map((c) => (
                  <p
                    key={c.id}
                    className="text-xs text-amber-400 flex items-start gap-1 mt-2"
                  >
                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    {c.comment}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* ============== MOU SECTION ============== */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        {(() => {
          // Hoisted MOU state — both the heading badge and the body card
          // need the same rejected/addressed flags, and the previous
          // version re-computed isFieldRejected in two places. The
          // snapshot key here matches what backend stores ("mou" for
          // legacy buckets, "MOU" for the doc-type enum — we try both
          // in the helper).
          const isRejected = isFieldRejected("mou");
          const snap = profile.profileSnapshot as Record<string, any> | null;
          const snapValue = snap ? (snap["mou"] ?? snap["MOU"]) : undefined;
          // Use filePath (raw GCS path), not fileUrl (signed and
          // ephemeral). Without this, the diff against the snapshot
          // would always show "different" even with no actual upload.
          const isAddressed =
            isRejected &&
            snapValue !== undefined &&
            snapValue !== (profile.mou.filePath ?? null);
          const needsUpdate = isRejected && !isAddressed;
          return (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-luxury-gold/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-luxury-gold" />
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold flex items-center gap-2 flex-wrap">
                    MOU / Contract
                    {/* NEEDS UPDATE / ADDRESSED — mutually exclusive,
                        mirrors input + doc field treatment. */}
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
                    {profile.mou.expiryDate && (
                      <InlineExpiryChip
                        expiryDate={
                          typeof profile.mou.expiryDate === "string"
                            ? profile.mou.expiryDate
                            : new Date(profile.mou.expiryDate).toISOString()
                        }
                      />
                    )}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Memorandum of Understanding with LuxDrive
                  </p>
                </div>
              </div>
              {profile.mou.fileUrl ? (
                <div
                  className={`p-4 bg-neutral-800 rounded-xl ${
                    isAddressed
                      ? "border-2 border-emerald-500/60"
                      : needsUpdate
                        ? "border-2 border-red-500/60"
                        : "border border-neutral-700"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <span className="text-green-400 font-medium">
                      MOU Uploaded
                    </span>
                  </div>
                  <div className="space-y-2 mb-4">
                    {profile.mou.expiryDate && (
                      <p className="text-sm text-gray-400">
                        Expires:{" "}
                        <span className="text-white">
                          {formatDate(
                            typeof profile.mou.expiryDate === "string"
                              ? profile.mou.expiryDate
                              : new Date(profile.mou.expiryDate).toISOString(),
                          )}
                        </span>
                      </p>
                    )}
                    {profile.mou.uploadedAt && (
                      <p className="text-sm text-gray-400">
                        Uploaded:{" "}
                        <span className="text-white">
                          {formatDate(
                            typeof profile.mou.uploadedAt === "string"
                              ? profile.mou.uploadedAt
                              : new Date(profile.mou.uploadedAt).toISOString(),
                          )}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="flex gap-3 items-center">
                    <button
                      type="button"
                      onClick={() =>
                        openViewer(
                          profile.mou.fileUrl as string,
                          undefined,
                          "Memorandum of Understanding",
                        )
                      }
                      className="text-sm text-luxury-gold hover:underline flex items-center gap-1"
                    >
                      <Eye className="w-4 h-4" /> View MOU
                    </button>
                    {isFieldEditable("mou") && (
                      <label className="text-sm text-gray-400 hover:text-white cursor-pointer flex items-center gap-1">
                        <Upload className="w-4 h-4" /> Replace
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={handleMouFilePick}
                        />
                      </label>
                    )}
                  </div>
                  {getFieldComments("mou").map((c) => (
                    <p
                      key={c.id}
                      className="text-xs text-amber-400 flex items-start gap-1 mt-2"
                    >
                      <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      {c.comment}
                    </p>
                  ))}
                </div>
              ) : isFieldEditable("mou") ? (
                <label className="border-2 border-dashed border-neutral-700 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:border-luxury-gold/50 transition-colors cursor-pointer">
                  <Upload className="w-8 h-8 text-gray-500 mb-3" />
                  <p className="text-sm text-gray-400 mb-1">
                    Upload MOU Document
                  </p>
                  <p className="text-xs text-gray-500">
                    PDF, JPG, PNG (Max 10MB)
                  </p>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleMouFilePick}
                  />
                </label>
              ) : (
                <div className="p-4 bg-neutral-800/50 rounded-xl text-center">
                  <p className="text-gray-400 text-sm">
                    {profile.status === "APPROVED"
                      ? "MOU upload is locked — submit a change request"
                      : "No MOU uploaded yet"}
                  </p>
                </div>
              )}
            </>
          );
        })()}

        {/* Inline MOU file confirmation (after pick) */}
        {mouFile && (
          <div className="mt-4 p-3 bg-neutral-800 border border-neutral-700 rounded-lg space-y-2">
            <p className="text-xs text-gray-400 truncate">
              Selected: {mouFile.name}
            </p>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                MOU Expiry date *
              </label>
              <input
                type="date"
                value={mouExpiryInput}
                onChange={(e) => setMouExpiryInput(e.target.value)}
                className="w-full px-2 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-white text-xs focus:outline-none focus:border-luxury-gold/50"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setMouFile(null);
                  setMouExpiryInput("");
                }}
                className="flex-1 px-2 py-1.5 bg-neutral-700 text-gray-300 rounded text-xs hover:bg-neutral-600"
              >
                Cancel
              </button>
              <button
                onClick={handleMouUpload}
                disabled={isUploadingMou || !mouExpiryInput}
                className="flex-1 px-2 py-1.5 bg-luxury-gold text-black font-medium rounded text-xs hover:bg-luxury-gold/90 disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {isUploadingMou ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Upload className="w-3 h-3" />
                )}
                Upload MOU
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ============== BANK DETAILS ============== */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-luxury-gold/10 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-luxury-gold" />
            </div>
            <h3 className="text-white font-semibold">Bank Details</h3>
          </div>
          {profile.isEditable && isBankEditable() && (
            <button
              onClick={() => setIsEditingBank(!isEditingBank)}
              className="px-4 py-2 bg-luxury-gold/10 text-luxury-gold rounded-lg hover:bg-luxury-gold/20 transition-colors flex items-center gap-2"
            >
              <Edit2 className="w-4 h-4" />
              {isEditingBank ? "Cancel" : "Edit"}
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Bank Name
            </label>
            {/* BankSelector restricts choice to the KSA bank list —
                no more typos breaking downstream payouts. Label is
                rendered by the wrapping <label> above; we pass an
                empty `label` to BankSelector so it doesn't double up. */}
            <BankSelector
              value={bankForm.bankName || ""}
              onChange={(bankName) => setBankForm((p) => ({ ...p, bankName }))}
              label=""
              disabled={!isEditingBank}
              error={isFieldRejected("bankName")}
            />
            {getFieldComments("bankName").map((c) => (
              <p
                key={c.id}
                className="text-xs text-amber-400 flex items-start gap-1 mt-1"
              >
                <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                {c.comment}
              </p>
            ))}
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Account Name
            </label>
            {/* Account holder name is free-form — no formatting helper
                needed. Keep the plain input. */}
            <input
              type="text"
              value={bankForm.bankAccountName || ""}
              onChange={(e) =>
                setBankForm((p) => ({
                  ...p,
                  bankAccountName: e.target.value,
                }))
              }
              disabled={!isEditingBank}
              className={`w-full px-4 py-3 bg-neutral-800 rounded-lg text-white disabled:opacity-60 focus:outline-none ${
                isFieldRejected("bankAccountName")
                  ? "border-2 border-red-500/60 focus:border-red-400"
                  : "border border-neutral-700 focus:border-luxury-gold/50"
              }`}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-400 mb-2">IBAN</label>
            {/* IBANInput formats as "SA00 0000 0000 0000 0000 0000",
                uppercases automatically, validates the SA prefix, and
                surfaces a live "N more characters needed" hint. The
                underlying onChange receives the cleaned value with
                no spaces (already uppercase) — ready to persist. */}
            <IBANInput
              value={bankForm.bankIban || ""}
              onChange={(iban) =>
                setBankForm((p) => ({ ...p, bankIban: iban }))
              }
              label=""
              disabled={!isEditingBank}
              error={isFieldRejected("bankIban")}
            />
            {getFieldComments("bankIban").map((c) => (
              <p
                key={c.id}
                className="text-xs text-amber-400 flex items-start gap-1 mt-1"
              >
                <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                {c.comment}
              </p>
            ))}
          </div>
        </div>
        {isEditingBank && (
          <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-neutral-800">
            <button
              onClick={() => setIsEditingBank(false)}
              className="px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveBank}
              disabled={isSaving}
              className="px-4 py-2 bg-luxury-gold text-black font-medium rounded-lg hover:bg-luxury-gold/90 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Bank Details
            </button>
          </div>
        )}
      </div>

      {/* ============== TEAM MEMBERS ==============
          Team-member functionality is on the roadmap but not yet
          shipped. Until the feature is real (invite flow, role
          management, permissions, audit trail), this section shows a
          Coming Soon placeholder instead of the WIP list view, which
          was rendering misleading data. The card structure is kept so
          the page rhythm doesn't shift when the feature lands — we
          just swap the body. */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Team Members</h3>
              <p className="text-xs text-gray-500">
                Manage colleagues with access to this vendor account
              </p>
            </div>
          </div>
          {/* Coming Soon pill — same visual weight as the status pills
              elsewhere in the page so the signal reads as intentional
              rather than as a warning/error. */}
          <span className="px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase rounded-full bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/20 whitespace-nowrap">
            Coming Soon
          </span>
        </div>

        {/* Centered placeholder body. Dashed border + muted palette
            communicate "draft / not active yet" without screaming
            broken. Sized to match the height of the old list state so
            scroll position stays roughly stable when the real feature
            replaces this block later. */}
        <div className="border border-dashed border-neutral-700 rounded-xl py-12 px-6 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center mb-4">
            <Clock className="w-6 h-6 text-gray-400" />
          </div>
          <h4 className="text-white font-medium mb-1">
            Team management is on the way
          </h4>
          <p className="text-sm text-gray-500 max-w-md">
            We&apos;re building invite flows, role-based access, and activity
            tracking so you can onboard colleagues to your vendor account. This
            section will activate once the feature ships.
          </p>
        </div>
      </div>

      {/* ============== SUBMIT FOR REVIEW BUTTON ==============
          Gated by `isEditable` alone — the backend's EDITABLE_STATUSES
          set (INVITED + ONBOARDING + CHANGES_REQUESTED) decides which
          vendors can submit. Previously this gate hardcoded
          "INVITED || CHANGES_REQUESTED" and missed ONBOARDING entirely,
          so vendors that had just accepted their invitation link
          (which puts them in ONBOARDING) never saw the submit button
          even after filling everything out. Matching the partner
          pattern, where `editable` is the single source of truth. */}
      {profile.isEditable && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-white font-semibold">Ready to Submit?</h3>
              <p className="text-sm text-gray-400 mt-1">
                Ensure all required fields and documents are complete before
                submitting for admin review.
              </p>
              {profile.documents.missingDocuments.length > 0 && (
                <p className="text-xs text-amber-400 mt-2">
                  Missing: {profile.documents.missingDocuments.join(", ")}
                </p>
              )}
            </div>
            <button
              onClick={handleSubmitForReview}
              disabled={isSubmitting}
              className="px-6 py-3 bg-luxury-gold text-black font-semibold rounded-lg hover:bg-luxury-gold/90 transition-colors flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Submit for Review
            </button>
          </div>
        </div>
      )}

      {/* ============== CHANGE REQUEST MODAL ============== */}
      {showChangeRequestModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
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
                  {profile.companyInfo.companyName || "Your profile"}
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
                  {VENDOR_CHANGE_REQUEST_FIELD_GROUPS.map((group) => {
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
                  placeholder="e.g. Our CR was renewed under a new number; need to update both the number and the certificate document..."
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

      {/* ============== LOGO UPLOAD CROPPER ==============
          Two-stage flow (preview → optional adjust → upload). Free
          aspect — vendor logos are whatever ratio the company has
          (square favicons, wide banners, tall logomarks all valid).
          Lives at the bottom of the tree so the backdrop doesn't get
          clipped by any parent overflow. */}
      {logoCropper && (
        <ImageCropper
          imageSrc={logoCropper.imageSrc}
          onCropComplete={handleLogoCropComplete}
          onCancel={() => setLogoCropper(null)}
          title="Upload Company Logo"
          saving={isUploadingLogo}
        />
      )}

      {/* ============== DOCUMENT / MOU CROPPER ==============
          Generic preview-first cropper for any image upload in
          documents or MOU. The picker handlers stage the file here
          when it's an image; PDFs bypass this modal entirely. The
          cropper produces a JPEG Blob → we wrap it in a File (keeping
          the original filename's base, swapping the extension to
          .jpg) → hand it to the staged `onComplete`, which routes it
          to the right destination state (pendingFile / mouFile). */}
      {imageUploadCropper && (
        <ImageCropper
          imageSrc={imageUploadCropper.imageSrc}
          onCancel={() => setImageUploadCropper(null)}
          title={imageUploadCropper.title}
          onCropComplete={(blob) => {
            const base =
              imageUploadCropper.originalName.replace(/\.[^.]+$/, "") ||
              "image";
            const file = new File([blob], `${base}.jpg`, {
              type: blob.type || "image/jpeg",
            });
            imageUploadCropper.onComplete(file);
          }}
        />
      )}

      {/* ============== DOCUMENT VIEWER ==============
          Handles both images and PDFs inline so View buttons don't
          punt the user out to a new tab. Same component used in
          partner profile + fleet/drivers sections. */}
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
