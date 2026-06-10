"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ImageCropper from "@/components/ui/image-cropper";
import DocumentViewer from "@/components/ui/document-viewer";
import { vendorApi, uploadApi } from "@/lib/api";
import {
  Car,
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
  Gauge,
  Hash,
  CheckCircle,
  AlertTriangle,
  Camera,
  Loader2,
  Save,
  User,
  XCircle,
  AlertCircle,
  Send,
  PenLine,
  Clock,
  ShieldCheck,
  Wrench,
  Pause,
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
import { proxiedImageUrl } from "@/lib/image-url";

// ============== TYPES ==============

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  category: string;
  categoryLabel: string;
  color: string | null;
  seats: number | null;
  isActive: boolean;
  status: string;
  statusLabel: string;
  thumbnailUrl?: string | null;
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
  suspendedForDocs?: boolean;
  uploadedDocsCount: number;
  totalRequiredDocs: number;
  hasUnresolvedReview: boolean;
  assignedDriver: { id: string; name: string } | null;
  createdAt: string;
}

interface VehicleDetail {
  id: string;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  color: string | null;
  seats: number | null;
  category: string;
  categoryLabel: string;
  mileage: number | null;
  isActive: boolean;
  status: string;
  statusLabel: string;
  canBeAssigned: boolean;
  documents: Array<{
    type: string;
    label: string;
    isUploaded: boolean;
    fileUrl: string | null;
    // Stable raw GCS path — used for snapshot-diff comparisons. See
    // partner/profile-panel and drivers.tsx for the same field's
    // rationale: fileUrl is a signed URL that rotates per request, so
    // it can't be used to decide "has this doc been replaced?" on the
    // client side. The backend (fleet.controller.ts) now writes this
    // alongside fileUrl on every doc.
    filePath: string | null;
    fileName: string | null;
    expiryDate: string | null;
    isExpired: boolean;
    requiresExpiry: boolean;
    uploadedAt: string | null;
  }>;
  allDocumentsUploaded: boolean;
  missingDocuments: string[];
  expiredDocuments: string[];
  suspendedForDocs?: boolean;
  assignedDriver: {
    id: string;
    name: string;
    phone: string;
    photoUrl: string | null;
    rating: number | null;
  } | null;
  unresolvedReviews: Array<{
    id: string;
    documents: string[];
    message: string;
    createdAt: string;
  }>;
  hasUnresolvedReviews: boolean;
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

interface ChangeRequest {
  id: string;
  fields: string[];
  fieldLabels: string[];
  message: string;
  isResolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

interface AvailableDriver {
  id: string;
  name: string;
  phone: string;
  rating: number | null;
}

interface CatalogModel {
  model: string;
  classes: string[];
  minYear: number;
  maxYear: number;
  defaultSeats: number;
}
interface CatalogMake {
  make: string;
  models: CatalogModel[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface VendorFleetProps {
  refreshBadges: () => void;
  // Vendor status used to gate write actions: only APPROVED vendors can add
  // new vehicles, submit change requests, or resubmit vehicles for review.
  // Viewing the fleet, drafts, and CHANGES_REQUESTED details remains open.
  vendorStatus?: string | null;
  // Required profile docs that are past their expiry. When non-empty, fleet
  // write actions are locked even with vendorStatus === APPROVED.
  expiredRequiredDocs?: Array<{
    type: string;
    label: string;
    expiryDate: string;
  }>;
}

// ============== CONSTANTS ==============

const VEHICLE_CATEGORIES = [
  { key: "ECONOMY_SEDAN", label: "Economy Sedan" },
  { key: "BUSINESS_SEDAN", label: "Business Sedan" },
  { key: "FIRST_CLASS", label: "First Class" },
  { key: "BUSINESS_SUV", label: "Business SUV" },
  { key: "ELECTRIC", label: "Electric" },
  { key: "HIACE", label: "Hiace" },
  { key: "COASTER", label: "Coaster" },
  { key: "KING_LONG", label: "King Long" },
];

const CHANGE_REQUEST_FIELD_GROUPS = [
  {
    section: "Vehicle Information",
    icon: Car,
    fields: [
      { key: "make", label: "Make" },
      { key: "model", label: "Model" },
      { key: "year", label: "Year" },
      { key: "color", label: "Color" },
      { key: "plateNumber", label: "Plate Number" },
      { key: "category", label: "Vehicle Category" },
      { key: "capacity", label: "Seating Capacity" },
    ],
  },
  {
    section: "Photos",
    icon: Camera,
    fields: [
      { key: "NUMBER_PLATE_FRONT", label: "Number Plate (Front)" },
      { key: "NUMBER_PLATE_BACK", label: "Number Plate (Back)" },
      { key: "PHOTO_FRONT", label: "Vehicle Photo (Front)" },
      { key: "PHOTO_BACK", label: "Vehicle Photo (Back)" },
      { key: "PHOTO_LEFT", label: "Vehicle Photo (Left)" },
      { key: "PHOTO_RIGHT", label: "Vehicle Photo (Right)" },
      { key: "PHOTO_INTERIOR_FRONT", label: "Interior (Front)" },
      { key: "PHOTO_INTERIOR_BACK", label: "Interior (Back)" },
      { key: "ODOMETER", label: "Odometer Reading" },
    ],
  },
  {
    section: "Legal Documents",
    icon: FileText,
    fields: [
      { key: "INSURANCE", label: "Car Insurance" },
      { key: "ISTIMARA", label: "Istimara (Registration)" },
    ],
  },
];

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
  UNDER_REVIEW: {
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/30",
    icon: Clock,
  },
  UNDER_MAINTENANCE: {
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/30",
    icon: Wrench,
  },
  EXPIRED_DOCS: {
    color: "text-red-400",
    bgColor: "bg-red-500/10 border-red-500/30",
    icon: AlertCircle,
  },
};

// ============== HELPERS ==============

function getStatusColor(status: string) {
  switch (status) {
    case "DRAFT":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "APPROVED":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "PENDING_REVIEW":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "CHANGES_REQUESTED":
      return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    default:
      return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  }
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatStatus(status: string) {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ============== DOC EXPIRY INDICATOR ==============
// Renders a single pill on the entity card whenever it has expired or about-to-
// expire documents. On hover (desktop) or tap (mobile), opens a generous
// popover listing each affected document with its expiry date, days remaining,
// and a colour-coded urgency chip. Optionally includes a "Request Changes"
// CTA that pre-fills the affected doc types so the vendor doesn't have to
// re-pick them in the modal.
//
// Rendering: the popover uses `position: fixed` with coordinates computed from
// the trigger element's bounding rect at the time it opens. This sidesteps
// `overflow: hidden` on ancestor cards (which would otherwise clip the popover)
// and gives us viewport-aware placement on mobile.

type ExpiryDoc = { type: string; label: string; expiryDate: string | null };

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

// Single row inside the popover.
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
  // Callback receives the list of affected doc types so the parent can
  // pre-select them in the change-request modal. Parents that don't care
  // can ignore the argument.
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

  // Compute popover placement relative to the trigger. Anchors top-left to the
  // trigger's bottom-left, then clamps horizontally so it never overflows the
  // viewport (important on narrow phones where the pill sits near the right
  // edge of a card).
  const computePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = Math.min(288, window.innerWidth - 16); // w-72 = 288px
    const margin = 8;
    let left = rect.left;
    // Clamp right edge
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - popoverWidth - margin;
    }
    // Clamp left edge
    if (left < margin) left = margin;

    let top = rect.bottom + 8;
    const estimatedHeight = 240; // rough cap; if it would overflow, flip above
    if (top + estimatedHeight > window.innerHeight - margin) {
      const above = rect.top - estimatedHeight - 8;
      if (above >= margin) top = above;
    }
    setPos({ top, left, width: popoverWidth });
  };

  // Close on outside click / scroll / resize while open.
  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      // Allow clicks on the popover itself
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

  // Toggle helper — used on click (tap) and on hover for desktop.
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
          // Small delay so the user can move into the popover.
          // Use setTimeout so onMouseEnter on popover can cancel it.
          // For simplicity we just close immediately on leave; the popover has
          // its own hover handlers below to keep it open while the user reads.
          setTimeout(() => {
            // Only close if the popover isn't being hovered
            const popover = document.getElementById("doc-expiry-popover");
            if (popover && popover.matches(":hover")) return;
            setOpen(false);
          }, 120);
        }}
        onClick={(e) => {
          // Tap-to-toggle for touch devices. Stop propagation so the outside-
          // click handler doesn't immediately close us.
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
            {/* Explicit close for touch users who didn't tap outside. */}
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
                // Pre-select all affected doc types so the modal opens with
                // them already ticked.
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

function hasDocAttention(v: {
  expiringDocs?: ExpiryDoc[];
  expiredDocs?: ExpiryDoc[];
}): "expired" | "expiring" | null {
  if ((v.expiredDocs?.length ?? 0) > 0) return "expired";
  if ((v.expiringDocs?.length ?? 0) > 0) return "expiring";
  return null;
}

// ============== INLINE EXPIRY CHIP ==============
// Small chip rendered inline next to a specific document/field that's expired
// or expiring. Useful in the detail panel where the parent context already
// makes it clear what entity we're talking about; we just need to flag the
// individual row/field.
function InlineExpiryChip({
  expiryDate,
  size = "sm",
}: {
  expiryDate: string | null;
  size?: "sm" | "xs";
}) {
  const days = daysUntil(expiryDate);
  if (days === null) return null;
  // Threshold: only show within 30 days OR expired.
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

// ============== VEHICLE HERO IMAGE ==============
// Hero image used on each vehicle card. Mirrors the loading-state pattern used
// by TopDriverAvatar in the dashboard: three states (loading → loaded → error),
// shimmer skeleton while the signed GCS URL is fetched, fade-in on success,
// graceful fallback icon on error or when no photo is uploaded.
//
// Without this, the user would see an empty grey box for the time it takes the
// browser to fetch the signed URL, then a sudden pop-in — looks broken.

function VehicleHeroImage({
  photoUrl,
  alt,
}: {
  photoUrl: string | null | undefined;
  alt: string;
}) {
  // Route through the resize proxy. Vehicle hero cards display at
  // roughly 400px wide on most layouts; proxiedImageUrl doubles that
  // internally for retina, and the backend clamps to its allowed
  // widths. Falls back to the original URL if proxying isn't
  // possible (non-GCS source, etc.).
  //
  // Important: effectiveSrc is derived from the GCS object PATH, not
  // the signed URL. The path is stable across refetches; the signed
  // URL is not (signature/date rotate every time the parent re-fetches
  // the vehicle list). Using the signed URL as the effect dep meant
  // every refetch reset state to "loading" → user saw the image for a
  // moment, then it disappeared until the next onLoad fired. Keying
  // off effectiveSrc fixes that flicker.
  const effectiveSrc = photoUrl
    ? (proxiedImageUrl(photoUrl, 400) ?? photoUrl)
    : null;

  // Start in "loading" only when there's a URL to fetch; otherwise jump straight
  // to "empty" so we skip the loader and show the fallback immediately.
  const [state, setState] = useState<"loading" | "loaded" | "error" | "empty">(
    effectiveSrc ? "loading" : "empty",
  );
  const imgRef = useRef<HTMLImageElement>(null);

  // Track the previously-seen effectiveSrc so we only reset state when
  // it ACTUALLY changes (different photo uploaded), not on every mount.
  // Why this matters: a naive `useEffect(() => setState(...), [effectiveSrc])`
  // runs once on mount AND on changes. The mount-time call races with
  // the <img>'s onLoad event — when the image is in browser cache, onLoad
  // fires synchronously during commit, calling setState("loaded") FIRST.
  // Then the useEffect runs and overwrites it with setState("loading"),
  // permanently stuck. Using a ref to compare prev vs current and only
  // re-setting on real changes avoids the race.
  const prevSrcRef = useRef(effectiveSrc);
  useEffect(() => {
    if (prevSrcRef.current !== effectiveSrc) {
      prevSrcRef.current = effectiveSrc;
      setState(effectiveSrc ? "loading" : "empty");
    }
  }, [effectiveSrc]);

  // Belt-and-suspenders for cached images. If the <img> finished loading
  // before React attached the onLoad handler (which can happen for
  // hot-cached images), `imgRef.current.complete` will be true. Sync
  // state to "loaded" so we don't get stuck at opacity-0 forever.
  useEffect(() => {
    if (
      state === "loading" &&
      imgRef.current?.complete &&
      imgRef.current?.naturalWidth > 0
    ) {
      setState("loaded");
    }
  });

  return (
    <>
      {/* The actual photo — only mounted when we have a URL and haven't errored.
          Faded out until `onLoad` fires, then fades in over the skeleton. */}
      {effectiveSrc && state !== "error" && (
        <img
          ref={imgRef}
          src={effectiveSrc}
          alt={alt}
          decoding="async"
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            state === "loaded" ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setState("loaded")}
          onError={() => setState("error")}
        />
      )}

      {/* Loading skeleton — animated shimmer occupying the full hero area until
          the image fires its onLoad. Once loaded, the img fades in over this. */}
      {state === "loading" && (
        <div className="absolute inset-0 bg-gradient-to-r from-neutral-800 via-neutral-700/50 to-neutral-800 animate-pulse" />
      )}

      {/* Gradient overlay — only when the image is fully loaded, so we don't
          darken the skeleton. */}
      {state === "loaded" && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
      )}

      {/* No-photo / error fallback. Subtle radial gradient + faded car icon. */}
      {(state === "empty" || state === "error") && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.06),transparent_70%)]" />
          <Car
            className="w-16 h-16 text-neutral-700 relative"
            strokeWidth={1.25}
          />
        </div>
      )}
    </>
  );
}

// ============== MAIN COMPONENT ==============

export default function VendorFleet({
  refreshBadges,
  vendorStatus,
  expiredRequiredDocs,
}: VendorFleetProps) {
  const { showNotification } = useNotification();

  // Doc-expiry is its own axis on top of vendorStatus. Same lock effect, but
  // we surface a distinct, more actionable banner ("Balady Expired") instead
  // of the generic "profile under review" copy.
  const hasExpiredDocs = (expiredRequiredDocs?.length ?? 0) > 0;

  // Vendor must be APPROVED to perform write actions on the fleet: adding new
  // vehicles, submitting vehicle change requests, resubmitting after admin
  // rejection. Drafts can be opened for viewing (D5) but their final-submit
  // CTA is also gated.
  const canModifyFleet = vendorStatus === "APPROVED" && !hasExpiredDocs;
  const fleetLockReason = hasExpiredDocs
    ? `The following profile document${expiredRequiredDocs!.length > 1 ? "s have" : " has"} expired: ${expiredRequiredDocs!.map((d) => d.label).join(", ")}. Submit a profile change request to renew before modifying your fleet.`
    : vendorStatus === "INVITED"
      ? "Complete and submit your profile to manage your fleet"
      : vendorStatus === "CHANGES_REQUESTED"
        ? "Admin has requested profile changes — update your profile and resubmit before modifying your fleet."
        : "Your profile must be approved before you can modify your fleet.";

  // List state
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 9,
    total: 0,
    totalPages: 0,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);

  // Detail sidebar
  const [vehicleDetail, setVehicleDetail] = useState<VehicleDetail | null>(
    null,
  );
  const [showDetailSidebar, setShowDetailSidebar] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Add/Edit sidebar
  const [showAddSidebar, setShowAddSidebar] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  // True when the Add sidebar is open to RESUME a DRAFT vehicle (as opposed to editing
  // a CHANGES_REQUESTED vehicle). Lets us show the correct header copy + final button.
  const [isDraftResume, setIsDraftResume] = useState(false);
  const [addStep, setAddStep] = useState<"info" | "photos" | "documents">(
    "info",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [savedVehicleId, setSavedVehicleId] = useState<string | null>(null);
  const [vehicleForm, setVehicleForm] = useState({
    make: "",
    model: "",
    year: new Date().getFullYear(),
    color: "",
    plateNumber: "",
    category: "",
    capacity: "",
    odometerReading: "",
  });

  // Photo & document uploads during add flow
  interface FileUpload {
    file: File | null;
    preview: string | null;
    progress: number;
    uploaded: boolean;
  }
  const emptyUpload: FileUpload = {
    file: null,
    preview: null,
    progress: 0,
    uploaded: false,
  };
  const [photoUploads, setPhotoUploads] = useState<Record<string, FileUpload>>({
    NUMBER_PLATE_FRONT: { ...emptyUpload },
    NUMBER_PLATE_BACK: { ...emptyUpload },
    PHOTO_FRONT: { ...emptyUpload },
    PHOTO_BACK: { ...emptyUpload },
    PHOTO_LEFT: { ...emptyUpload },
    PHOTO_RIGHT: { ...emptyUpload },
    PHOTO_INTERIOR_FRONT: { ...emptyUpload },
    PHOTO_INTERIOR_BACK: { ...emptyUpload },
    ODOMETER: { ...emptyUpload },
  });
  const [docUploads, setDocUploads] = useState<
    Record<string, FileUpload & { expiryDate: string }>
  >({
    INSURANCE: { ...emptyUpload, expiryDate: "" },
    ISTIMARA: { ...emptyUpload, expiryDate: "" },
  });

  // Document upload (detail sidebar)
  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);

  // Assign driver
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [availableDrivers, setAvailableDrivers] = useState<AvailableDriver[]>(
    [],
  );
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  // Action loading & delete
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingVehicleId, setDeletingVehicleId] = useState<string | null>(
    null,
  );

  // Inline field editor inside detail panel
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingFieldValue, setEditingFieldValue] = useState<string>("");
  const [savingField, setSavingField] = useState(false);
  const [deletingVehicleName, setDeletingVehicleName] = useState("");

  // Image cropper — `aspect` is optional. When undefined, the cropper
  // opens in preview-first mode and the user can upload as-is, opt
  // into adjust, or cancel. Mirrors the partner profile + vendor
  // profile flows so the entire portal behaves the same way for any
  // image upload.
  const [cropperState, setCropperState] = useState<{
    imageSrc: string;
    onComplete: (blob: Blob) => void;
    aspect?: number;
    shape: "rect" | "round";
    title: string;
  } | null>(null);

  // Document viewer
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerFileName, setViewerFileName] = useState<string | undefined>(
    undefined,
  );
  const [viewerTitle, setViewerTitle] = useState<string | undefined>(undefined);

  // Change request modal
  const [showChangeRequestModal, setShowChangeRequestModal] = useState(false);
  const [changeRequestFields, setChangeRequestFields] = useState<string[]>([]);
  const [changeRequestReason, setChangeRequestReason] = useState("");
  const [submittingChangeRequest, setSubmittingChangeRequest] = useState(false);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);

  // Pending vehicle-document upload state. When the user picks a file
  // for a doc that requires an expiry date, the file is held in this
  // map (keyed by doc.type) until they fill in the date and confirm.
  // The previous code used a native `prompt("Enter expiry date...")`
  // for this which was awful UX — no calendar, no validation, no way
  // to back out. The same `pendingFile`/inline-date-picker pattern is
  // used in vendor/profile.tsx for profile documents.
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

  // Vehicle catalog
  const [catalogMakes, setCatalogMakes] = useState<CatalogMake[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [useManualEntry, setUseManualEntry] = useState(false);

  // Derived catalog data
  const catalogModelsForMake =
    catalogMakes.find((m) => m.make === vehicleForm.make)?.models || [];
  const selectedCatalogModel = catalogModelsForMake.find(
    (m) => m.model === vehicleForm.model,
  );
  const catalogYears: number[] = selectedCatalogModel
    ? Array.from(
        {
          length:
            selectedCatalogModel.maxYear - selectedCatalogModel.minYear + 1,
        },
        (_, i) => selectedCatalogModel.maxYear - i,
      )
    : [];

  // ============== EFFECTS ==============

  useEffect(() => {
    if (!vehicleForm.category) {
      setCatalogMakes([]);
      return;
    }
    const fetchCatalog = async () => {
      setIsLoadingCatalog(true);
      try {
        const res = await vendorApi.getVehicleCatalog({
          category: vehicleForm.category,
        });
        if (res.success && res.data) setCatalogMakes(res.data.makes || []);
      } catch {
        setCatalogMakes([]);
      } finally {
        setIsLoadingCatalog(false);
      }
    };
    fetchCatalog();
    if (!editingVehicleId) {
      setVehicleForm((p) => ({
        ...p,
        make: "",
        model: "",
        year: new Date().getFullYear(),
      }));
      setUseManualEntry(false);
    }
  }, [vehicleForm.category]);

  useEffect(() => {
    if (selectedCatalogModel && !editingVehicleId && !useManualEntry) {
      setVehicleForm((p) => ({
        ...p,
        capacity: selectedCatalogModel.defaultSeats.toString(),
      }));
    }
  }, [selectedCatalogModel]);

  // ============== FETCH VEHICLES ==============

  const fetchVehicles = useCallback(
    async (page = 1) => {
      setIsLoading(true);
      try {
        const params: Record<string, any> = { page, limit: pagination.limit };
        if (searchQuery) params.search = searchQuery;
        if (statusFilter !== "all") params.status = statusFilter;
        if (categoryFilter !== "all") params.category = categoryFilter;
        const res = await vendorApi.getVehicles(params);
        if (res.success && res.data) {
          setVehicles(res.data.vehicles || []);
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
        showNotification("error", err.message || "Failed to load vehicles");
      } finally {
        setIsLoading(false);
      }
    },
    [searchQuery, statusFilter, categoryFilter, pagination.limit],
  );

  useEffect(() => {
    fetchVehicles(1);
  }, [statusFilter, categoryFilter]);
  useEffect(() => {
    const t = setTimeout(() => fetchVehicles(1), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Mark all fleet-related notifications as read once the vendor actually engages with
  // this section (scrolls, clicks, key-presses) — NOT on bare mount. Mounting alone can
  // happen because the user just logged in and the app dropped them here, in which case
  // they haven't actually "opened" Fleet yet. Waiting for an interaction signal is the
  // simplest reliable proxy for "the vendor is now looking at this page."
  useEffect(() => {
    let cancelled = false;
    let didMark = false;
    const markRead = async () => {
      if (didMark || cancelled) return;
      didMark = true;
      teardown();
      try {
        await vendorApi.markAllNotificationsAsRead("vehicles");
        if (!cancelled) refreshBadges();
      } catch {
        /* silent — badge will refresh on next nav */
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

  const handleViewDetail = async (vehicleId: string) => {
    setIsLoadingDetail(true);
    setShowDetailSidebar(true);
    try {
      const res = await vendorApi.getVehicle(vehicleId);
      if (res.success && res.data) {
        setVehicleDetail(res.data);
        if (res.data.status === "APPROVED") fetchChangeRequests(vehicleId);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load vehicle");
      setShowDetailSidebar(false);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // ============== ADD / EDIT ==============

  const resetAddForm = () => {
    setVehicleForm({
      make: "",
      model: "",
      year: new Date().getFullYear(),
      color: "",
      plateNumber: "",
      category: "",
      capacity: "",
      odometerReading: "",
    });
    setPhotoUploads({
      NUMBER_PLATE_FRONT: { ...emptyUpload },
      NUMBER_PLATE_BACK: { ...emptyUpload },
      PHOTO_FRONT: { ...emptyUpload },
      PHOTO_BACK: { ...emptyUpload },
      PHOTO_LEFT: { ...emptyUpload },
      PHOTO_RIGHT: { ...emptyUpload },
      PHOTO_INTERIOR_FRONT: { ...emptyUpload },
      PHOTO_INTERIOR_BACK: { ...emptyUpload },
      ODOMETER: { ...emptyUpload },
    });
    setDocUploads({
      INSURANCE: { ...emptyUpload, expiryDate: "" },
      ISTIMARA: { ...emptyUpload, expiryDate: "" },
    });
    setSavedVehicleId(null);
    setAddStep("info");
    setCatalogMakes([]);
    setUseManualEntry(false);
    setIsDraftResume(false);
  };

  const handleOpenAdd = () => {
    setEditingVehicleId(null);
    resetAddForm();
    setShowAddSidebar(true);
  };

  const handleOpenEdit = async (vehicleId: string) => {
    setEditingVehicleId(vehicleId);
    resetAddForm();
    try {
      const res = await vendorApi.getVehicle(vehicleId);
      if (res.success && res.data) {
        const v = res.data;
        setVehicleForm({
          make: v.make || "",
          model: v.model || "",
          year: v.year || new Date().getFullYear(),
          color: v.color || "",
          plateNumber: v.plateNumber || "",
          category: v.category || "",
          capacity: v.seats?.toString() || "",
          odometerReading: v.mileage?.toString() || "",
        });
        setSavedVehicleId(vehicleId);
        setUseManualEntry(true);
        if (v.documents && v.documents.length > 0) {
          const newPhoto = { ...photoUploads };
          const newDoc = { ...docUploads };
          for (const doc of v.documents) {
            if (doc.isUploaded && doc.fileUrl) {
              if (doc.type in newPhoto)
                newPhoto[doc.type] = {
                  file: null,
                  preview: doc.fileUrl,
                  progress: 100,
                  uploaded: true,
                };
              if (doc.type in newDoc)
                newDoc[doc.type] = {
                  file: null,
                  preview: doc.fileUrl,
                  progress: 100,
                  uploaded: true,
                  expiryDate: doc.expiryDate
                    ? new Date(doc.expiryDate).toISOString().split("T")[0]
                    : "",
                };
            }
          }
          setPhotoUploads(newPhoto);
          setDocUploads(newDoc);
          const hasAllPhotos = Object.values(newPhoto).every((u) => u.uploaded);
          const hasAnyPhotos = Object.values(newPhoto).some((u) => u.uploaded);
          const hasAllDocs = Object.values(newDoc).every((u) => u.uploaded);
          if (hasAllPhotos && !hasAllDocs) setAddStep("documents");
          else if (hasAnyPhotos && !hasAllPhotos) setAddStep("photos");
          else setAddStep("info");
        }
        setShowAddSidebar(true);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load vehicle");
    }
  };

  // Inline-save a single text field from the detail panel (CHANGES_REQUESTED flow)
  const handleSaveInlineField = async (
    vehicleId: string,
    fieldName: string,
    value: string,
  ) => {
    setSavingField(true);
    try {
      const data: any = {};
      // Map UI field name → API key.
      if (fieldName === "make") data.make = value.trim();
      else if (fieldName === "model") data.model = value.trim();
      else if (fieldName === "year") data.year = parseInt(value);
      else if (fieldName === "plateNumber") data.plateNumber = value.trim();
      else if (fieldName === "color") data.color = value.trim();
      else if (fieldName === "category") data.category = value;
      else if (fieldName === "mileage" || fieldName === "odometerReading")
        data.mileage = value ? parseInt(value) : null;
      else if (fieldName === "capacity" || fieldName === "seats")
        data.seats = value ? parseInt(value) : null;
      else {
        showNotification(
          "error",
          `Field "${fieldName}" cannot be edited inline`,
        );
        return;
      }
      const res = await vendorApi.updateVehicle(vehicleId, data);
      if (res.success) {
        showNotification("success", `${fieldName} updated`);
        setEditingField(null);
        setEditingFieldValue("");
        // Refresh detail panel + list
        await handleViewDetail(vehicleId);
        fetchVehicles(pagination.page);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to update");
    } finally {
      setSavingField(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const data = {
        make: vehicleForm.make,
        model: vehicleForm.model,
        year: vehicleForm.year,
        color: vehicleForm.color,
        plateNumber: vehicleForm.plateNumber,
        category: vehicleForm.category,
        seats: vehicleForm.capacity
          ? parseInt(vehicleForm.capacity)
          : undefined,
        mileage: vehicleForm.odometerReading
          ? parseInt(vehicleForm.odometerReading)
          : undefined,
      };
      let res;
      if (editingVehicleId)
        res = await vendorApi.updateVehicle(editingVehicleId, data);
      else res = await vendorApi.addVehicle(data);
      if (res.success) {
        setSavedVehicleId(res.data?.id || editingVehicleId);
        showNotification(
          "success",
          res.message ||
            (editingVehicleId ? "Vehicle updated" : "Vehicle added"),
        );
        setAddStep("photos");
        fetchVehicles(pagination.page);
        refreshBadges();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to save vehicle");
    } finally {
      setIsSaving(false);
    }
  };

  // ============== FILE HANDLING ==============

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
        // No aspect default — undefined means preview-first with
        // free crop available. The previous 16:9 default forced
        // every vehicle photo through Adjust mode, which is the
        // opposite of what we want for arbitrary phone snaps. If a
        // specific aspect is ever needed for a particular upload,
        // the caller can pass it explicitly via `options.aspect`.
        aspect: options?.aspect,
        shape: options?.shape ?? "rect",
        title: options?.title ?? "Upload Image",
      });
    };
    reader.readAsDataURL(file);
  };

  const handleAddFlowUpload = async (
    type: string,
    file: File,
    isDoc: boolean,
    expiryDate?: string,
  ) => {
    if (!savedVehicleId) return;
    const setState = isDoc ? setDocUploads : setPhotoUploads;
    setState((prev: any) => ({
      ...prev,
      [type]: {
        ...prev[type],
        file,
        preview: URL.createObjectURL(file),
        progress: 30,
      },
    }));
    try {
      const signedRes = await uploadApi.getSignedUploadUrl({
        fileName: file.name,
        fileType: file.type,
        section: "vendors",
        folder: "vehicles",
        entityId: savedVehicleId,
      });
      if (!signedRes.success || !signedRes.data)
        throw new Error("Failed to get upload URL");
      setState((prev: any) => ({
        ...prev,
        [type]: { ...prev[type], progress: 60 },
      }));
      await fetch(signedRes.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const res = await vendorApi.uploadVehicleDocument(savedVehicleId, {
        type,
        fileUrl: signedRes.data.filePath,
        fileName: file.name,
        expiryDate,
      });
      if (res.success)
        setState((prev: any) => ({
          ...prev,
          [type]: { ...prev[type], progress: 100, uploaded: true },
        }));
    } catch (err: any) {
      showNotification("error", err.message || `Failed to upload ${type}`);
      setState((prev: any) => ({
        ...prev,
        [type]: { ...prev[type], progress: 0, file: null, preview: null },
      }));
    }
  };

  const handleFinishAdd = async () => {
    if (!savedVehicleId) {
      setShowAddSidebar(false);
      resetAddForm();
      return;
    }
    setIsSaving(true);
    try {
      const submitRes = await vendorApi.submitVehicleForReview(savedVehicleId);
      if (!submitRes.success) {
        showNotification(
          "error",
          submitRes.message ||
            "Documents saved but submission failed. Use Continue Setup to retry.",
        );
        setShowAddSidebar(false);
        resetAddForm();
        fetchVehicles(pagination.page);
        return;
      }
      showNotification("success", "Vehicle submitted for admin review");
      setShowAddSidebar(false);
      resetAddForm();
      fetchVehicles(pagination.page);
      refreshBadges();
    } catch (err: any) {
      showNotification(
        "error",
        err.message ||
          "Documents saved but submission failed. Use Continue Setup to retry.",
      );
      setShowAddSidebar(false);
      resetAddForm();
      fetchVehicles(pagination.page);
    } finally {
      setIsSaving(false);
    }
  };

  /** Resume a DRAFT vehicle — same flow as edit but enters at the wizard step that's not yet complete. */
  const handleResumeDraft = (vehicleId: string) => {
    setIsDraftResume(true);
    handleOpenEdit(vehicleId);
  };

  // ============== ACTIONS ==============

  const handleOpenDeleteConfirm = (id: string, name: string) => {
    setDeletingVehicleId(id);
    setDeletingVehicleName(name);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingVehicleId) return;
    setActionLoading(deletingVehicleId);
    try {
      const res = await vendorApi.deleteVehicle(deletingVehicleId);
      if (res.success) {
        showNotification("success", res.message || "Vehicle deleted");
        setShowDetailSidebar(false);
        setShowDeleteConfirm(false);
        setDeletingVehicleId(null);
        fetchVehicles(pagination.page);
        refreshBadges();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to delete vehicle");
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleStatus = async (
    vehicleId: string,
    newStatus: "activate" | "deactivate" | "maintenance",
  ) => {
    setActionLoading(vehicleId);
    try {
      const res = await vendorApi.toggleVehicleStatus(vehicleId, {
        action: newStatus,
      });
      if (res.success) {
        showNotification("success", res.message || "Status updated");
        fetchVehicles(pagination.page);
        if (vehicleDetail?.id === vehicleId) handleViewDetail(vehicleId);
        refreshBadges();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to update status");
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenAssign = async () => {
    setShowAssignModal(true);
    setSelectedDriverId(null);
    try {
      const res = await vendorApi.getAvailableDrivers();
      if (res.success && res.data) setAvailableDrivers(res.data.drivers || []);
    } catch {
      setAvailableDrivers([]);
    }
  };

  const handleAssignDriver = async () => {
    if (!vehicleDetail) return;
    setIsAssigning(true);
    try {
      const res = await vendorApi.assignDriverToVehicle(vehicleDetail.id, {
        driverId: selectedDriverId,
      });
      if (res.success) {
        showNotification("success", res.message || "Driver assigned");
        setShowAssignModal(false);
        handleViewDetail(vehicleDetail.id);
        fetchVehicles(pagination.page);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to assign driver");
    } finally {
      setIsAssigning(false);
    }
  };

  const handleSubmitForReview = async (vehicleId: string) => {
    setActionLoading(vehicleId);
    try {
      const res = await vendorApi.submitVehicleForReview(vehicleId);
      if (res.success) {
        showNotification("success", res.message || "Submitted for review");
        if (vehicleDetail?.id === vehicleId) handleViewDetail(vehicleId);
        fetchVehicles(pagination.page);
        refreshBadges();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to submit");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDocumentUpload = async (
    vehicleId: string,
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
        folder: "vehicles",
        entityId: vehicleId,
      });
      if (!signedRes.success || !signedRes.data)
        throw new Error("Failed to get upload URL");
      await fetch(signedRes.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const res = await vendorApi.uploadVehicleDocument(vehicleId, {
        type,
        fileUrl: signedRes.data.filePath,
        fileName: file.name,
        expiryDate,
      });
      if (res.success) {
        showNotification("success", res.message || "Document uploaded");
        handleViewDetail(vehicleId);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Upload failed");
    } finally {
      setUploadingDocType(null);
    }
  };

  const handleViewDocument = (
    fileUrl: string,
    fileName?: string,
    title?: string,
  ) => {
    if (!fileUrl) return;
    setViewerUrl(fileUrl);
    setViewerFileName(fileName || undefined);
    setViewerTitle(title || undefined);
  };

  // ============== CHANGE REQUESTS ==============

  const fetchChangeRequests = async (vehicleId: string) => {
    try {
      const res = await vendorApi.getVehicleChangeRequests(vehicleId);
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
    if (!vehicleDetail) return;
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
      const res = await vendorApi.requestVehicleChanges(vehicleDetail.id, {
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
        fetchChangeRequests(vehicleDetail.id);
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

  // ============== RENDER ==============

  return (
    <div className="space-y-6">
      {/* Vendor-status lock banner — explains why write actions are disabled.
          Doc-expired takes precedence (more actionable than the generic
          status-based copy). */}
      {!canModifyFleet && (hasExpiredDocs || vendorStatus) && (
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
                      : "Fleet modifications disabled"}
            </p>
            <p
              className={`text-xs mt-0.5 ${
                hasExpiredDocs ? "text-red-400/70" : "text-amber-400/70"
              }`}
            >
              {hasExpiredDocs
                ? `Renew the expired document${expiredRequiredDocs!.length > 1 ? "s" : ""} via the profile change-request flow. Fleet viewing remains available but adding vehicles and submitting change requests are disabled.`
                : "You can view your fleet, but adding new vehicles, submitting change requests, and resubmitting for review are disabled until your profile is approved."}
            </p>
          </div>
        </div>
      )}

      {/* ============== FLEET NOTIFICATIONS BANNER ============== */}
      {!isLoading &&
        vehicles.length > 0 &&
        (() => {
          const changesRequested = vehicles.filter(
            (v) => v.status === "CHANGES_REQUESTED",
          );
          const incompleteUploads = vehicles.filter(
            (v) =>
              v.uploadedDocsCount < v.totalRequiredDocs &&
              v.status === "PENDING_REVIEW",
          );
          const expiredDocs = vehicles.filter((v) => v.hasExpiredDocs);
          const suspendedForDocs = vehicles.filter((v) => v.suspendedForDocs);
          const expiringSoon = vehicles.filter(
            (v) =>
              !v.hasExpiredDocs &&
              !v.suspendedForDocs &&
              (v.expiringSoonDocCount || 0) > 0,
          );
          if (
            changesRequested.length === 0 &&
            incompleteUploads.length === 0 &&
            expiredDocs.length === 0 &&
            suspendedForDocs.length === 0 &&
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
                      {changesRequested
                        .map((v) => `${v.make} ${v.model}`)
                        .join(", ")}{" "}
                      — review and fix flagged fields, then resubmit.
                    </p>
                  </div>
                  {changesRequested.length === 1 && (
                    <button
                      onClick={() => handleViewDetail(changesRequested[0].id)}
                      className="px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-xs font-medium hover:bg-amber-500/30 transition-colors"
                    >
                      Review
                    </button>
                  )}
                </div>
              )}
              {incompleteUploads.length > 0 && (
                <div className="p-4 rounded-xl border bg-orange-500/5 border-orange-500/20 flex items-start gap-3">
                  <Upload className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-orange-400">
                      Incomplete Uploads
                    </p>
                    <p className="text-xs text-orange-400/70 mt-0.5">
                      {incompleteUploads
                        .map(
                          (v) =>
                            `${v.make} ${v.model} (${v.uploadedDocsCount}/${v.totalRequiredDocs})`,
                        )
                        .join(", ")}
                    </p>
                  </div>
                </div>
              )}
              {suspendedForDocs.length > 0 && (
                <div className="p-4 rounded-xl border bg-red-500/10 border-red-500/40 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-400">
                      Vehicle Suspended
                    </p>
                    <p className="text-xs text-red-400/80 mt-0.5">
                      {suspendedForDocs
                        .map((v) => `${v.make} ${v.model} (${v.plateNumber})`)
                        .join(", ")}{" "}
                      — suspended because one or more documents expired. Open
                      the vehicle and replace the expired document(s) to
                      reactivate.
                    </p>
                  </div>
                  {suspendedForDocs.length === 1 && (
                    <button
                      onClick={() => handleViewDetail(suspendedForDocs[0].id)}
                      className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/30 transition-colors flex-shrink-0"
                    >
                      Open & Update
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
                      {expiredDocs
                        .map((v) => `${v.make} ${v.model}`)
                        .join(", ")}{" "}
                      — update expired documents to maintain eligibility.
                    </p>
                  </div>
                  {expiredDocs.length === 1 && (
                    <button
                      onClick={() => handleViewDetail(expiredDocs[0].id)}
                      className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/30 transition-colors flex-shrink-0"
                    >
                      Open & Update
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
                        .map((v) => {
                          const daysLeft = v.nextExpiryDate
                            ? Math.max(
                                0,
                                Math.ceil(
                                  (new Date(v.nextExpiryDate).getTime() -
                                    Date.now()) /
                                    (1000 * 60 * 60 * 24),
                                ),
                              )
                            : null;
                          const docPart = v.nextExpiringDocLabel
                            ? `${v.make} ${v.model} — ${v.nextExpiringDocLabel}`
                            : `${v.make} ${v.model}`;
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
                      Open & Update
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })()}

      {/* ============== HEADER ============== */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by make, model, plate..."
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
            <option value="UNDER_MAINTENANCE">Under Maintenance</option>
          </select>
        </div>
        <button
          onClick={() =>
            canModifyFleet
              ? handleOpenAdd()
              : showNotification("warning", fleetLockReason)
          }
          disabled={!canModifyFleet}
          title={canModifyFleet ? undefined : fleetLockReason}
          className={`px-4 py-2.5 font-medium rounded-lg transition-colors flex items-center gap-2 ${
            canModifyFleet
              ? "bg-luxury-gold text-black hover:bg-luxury-gold/90"
              : "bg-neutral-800 text-gray-500 cursor-not-allowed"
          }`}
        >
          {canModifyFleet ? (
            <Plus className="w-4 h-4" />
          ) : (
            <ShieldAlert className="w-4 h-4" />
          )}{" "}
          Add Vehicle
        </button>
      </div>

      {/* ============== CATEGORY TABS ============== */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <button
          onClick={() => setCategoryFilter("all")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${categoryFilter === "all" ? "bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/30" : "bg-neutral-900 text-gray-400 border border-neutral-800 hover:text-white"}`}
        >
          All Vehicles
        </button>
        {VEHICLE_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategoryFilter(cat.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${categoryFilter === cat.key ? "bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/30" : "bg-neutral-900 text-gray-400 border border-neutral-800 hover:text-white"}`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* ============== VEHICLE LIST ============== */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
        </div>
      ) : vehicles.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-12">
          <Empty>
            <EmptyMedia>
              <div className="w-24 h-24 bg-neutral-800 rounded-full flex items-center justify-center mb-4">
                <Car className="w-12 h-12 text-gray-500" />
              </div>
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle className="text-white">
                {searchQuery ||
                categoryFilter !== "all" ||
                statusFilter !== "all"
                  ? "No vehicles found"
                  : "No fleet added yet"}
              </EmptyTitle>
              <EmptyDescription className="text-gray-400">
                {searchQuery ||
                categoryFilter !== "all" ||
                statusFilter !== "all"
                  ? "Try adjusting your search or filter criteria"
                  : "Add your first vehicle to start managing your fleet"}
              </EmptyDescription>
            </EmptyHeader>
            {!searchQuery &&
              categoryFilter === "all" &&
              statusFilter === "all" && (
                <button
                  onClick={() =>
                    canModifyFleet
                      ? handleOpenAdd()
                      : showNotification("warning", fleetLockReason)
                  }
                  disabled={!canModifyFleet}
                  title={canModifyFleet ? undefined : fleetLockReason}
                  className={`mt-4 px-6 py-3 font-medium rounded-lg transition-colors flex items-center gap-2 mx-auto ${
                    canModifyFleet
                      ? "bg-luxury-gold text-black hover:bg-luxury-gold/90"
                      : "bg-neutral-800 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  {canModifyFleet ? (
                    <Plus className="w-5 h-5" />
                  ) : (
                    <ShieldAlert className="w-5 h-5" />
                  )}{" "}
                  Add Your First Vehicle
                </button>
              )}
          </Empty>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {vehicles.map((vehicle) => {
              const docAttention = hasDocAttention(vehicle);
              return (
                <div
                  key={vehicle.id}
                  className={`bg-neutral-900 border rounded-xl overflow-hidden transition-colors ${
                    docAttention === "expired"
                      ? "border-red-500/40 hover:border-red-500/60"
                      : docAttention === "expiring"
                        ? "border-amber-500/40 hover:border-amber-500/60"
                        : "border-neutral-800 hover:border-neutral-700"
                  }`}
                >
                  {/* Hero banner — uses the vehicle's own PHOTO_FRONT as the card's
                    primary visual when available. VehicleHeroImage handles the
                    loading skeleton, fade-in, and graceful fallback so the user
                    never sees an empty grey box while the signed URL is fetched. */}
                  <div className="relative aspect-[16/9] bg-gradient-to-br from-neutral-800 to-neutral-900 overflow-hidden">
                    <VehicleHeroImage
                      photoUrl={vehicle.thumbnailUrl}
                      alt={`${vehicle.make} ${vehicle.model}`}
                    />
                    {/* Status pill — top-right corner of the hero */}
                    <div className="absolute top-3 right-3">
                      <span
                        className={`flex items-center gap-1 px-2 py-1 text-xs rounded-full border backdrop-blur-sm ${getStatusColor(vehicle.status)}`}
                      >
                        {formatStatus(vehicle.status)}
                      </span>
                    </div>
                    {/* Plate number — bottom-left corner, monospaced for that "real plate" feel */}
                    <div className="absolute bottom-3 left-3 px-2.5 py-1 bg-black/50 backdrop-blur-sm border border-white/10 rounded text-white text-xs font-mono tracking-wider">
                      {vehicle.plateNumber}
                    </div>
                  </div>

                  {/* Title block — make/model + category */}
                  <div className="p-4 border-b border-neutral-800">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <h4 className="text-white font-semibold truncate">
                          {vehicle.make} {vehicle.model}
                        </h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {vehicle.year}
                          {vehicle.color ? ` · ${vehicle.color}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-block px-2 py-1 text-xs bg-luxury-gold/10 text-luxury-gold rounded">
                        {vehicle.categoryLabel || vehicle.category}
                      </span>
                      {vehicle.uploadedDocsCount < vehicle.totalRequiredDocs ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border bg-orange-500/10 text-orange-400 border-orange-500/30">
                          <AlertTriangle className="w-3 h-3" />
                          {vehicle.uploadedDocsCount}/
                          {vehicle.totalRequiredDocs} Uploads
                        </span>
                      ) : vehicle.status === "APPROVED" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border bg-green-500/20 text-green-400 border-green-500/30">
                          <ShieldCheck className="w-3 h-3" /> Approved
                        </span>
                      ) : (
                        <span
                          className={`inline-block px-2 py-1 text-xs rounded-full border ${getStatusColor(vehicle.status)}`}
                        >
                          {vehicle.statusLabel || formatStatus(vehicle.status)}
                        </span>
                      )}
                      {/* Operational state — separate from review status. Only meaningful when the vehicle
                        has cleared review (status APPROVED or UNDER_MAINTENANCE). */}
                      {vehicle.status === "DRAFT" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border bg-blue-500/10 text-blue-400 border-blue-500/30">
                          <PenLine className="w-3 h-3" /> Draft — Continue Setup
                        </span>
                      ) : vehicle.suspendedForDocs ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border bg-red-500/15 text-red-400 border-red-500/40">
                          <AlertCircle className="w-3 h-3" /> Suspended
                        </span>
                      ) : vehicle.status === "UNDER_MAINTENANCE" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border bg-amber-500/10 text-amber-400 border-amber-500/30">
                          <Wrench className="w-3 h-3" /> Under Maintenance
                        </span>
                      ) : vehicle.status === "APPROVED" && !vehicle.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border bg-neutral-700 text-gray-400 border-neutral-600">
                          <Pause className="w-3 h-3" /> Inactive
                        </span>
                      ) : vehicle.status === "APPROVED" && vehicle.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border bg-green-500/10 text-green-400 border-green-500/30">
                          <CheckCircle className="w-3 h-3" /> Active
                        </span>
                      ) : null}
                      {/* Document expiry indicator — only renders if there are expired or expiring docs. */}
                      <DocExpiryIndicator
                        expiringDocs={vehicle.expiringDocs}
                        expiredDocs={vehicle.expiredDocs}
                      />
                    </div>
                  </div>
                  <div className="p-3 flex items-center justify-between text-xs border-b border-neutral-800">
                    <span className="text-gray-500">
                      {vehicle.seats ? `${vehicle.seats} seats` : "—"}
                    </span>
                    {vehicle.assignedDriver && (
                      <span className="text-gray-500">
                        <User className="w-3 h-3 inline mr-1" />
                        {vehicle.assignedDriver.name}
                      </span>
                    )}
                  </div>
                  <div className="p-4 flex gap-2">
                    {vehicle.status === "DRAFT" ? (
                      <button
                        onClick={() => handleResumeDraft(vehicle.id)}
                        className="flex-1 px-3 py-2 bg-luxury-gold text-black text-sm font-medium rounded-lg hover:bg-luxury-gold/90 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <PenLine className="w-4 h-4" /> Continue Setup
                      </button>
                    ) : (
                      <button
                        onClick={() => handleViewDetail(vehicle.id)}
                        className="flex-1 px-3 py-2 bg-neutral-800 text-white text-sm rounded-lg hover:bg-neutral-700 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Eye className="w-4 h-4" /> View Details
                      </button>
                    )}
                    <button
                      onClick={() =>
                        handleOpenDeleteConfirm(
                          vehicle.id,
                          `${vehicle.make} ${vehicle.model}`,
                        )
                      }
                      disabled={actionLoading === vehicle.id}
                      className="px-3 py-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      {actionLoading === vehicle.id ? (
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
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <p className="text-sm text-gray-400">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                {Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
                of {pagination.total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchVehicles(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="p-2 bg-neutral-800 rounded-lg text-white disabled:opacity-50 hover:bg-neutral-700 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from(
                  { length: Math.min(pagination.totalPages, 5) },
                  (_, i) => i + 1,
                ).map((page) => (
                  <button
                    key={page}
                    onClick={() => fetchVehicles(page)}
                    className={`w-8 h-8 rounded-lg text-sm ${pagination.page === page ? "bg-luxury-gold text-black font-medium" : "bg-neutral-800 text-gray-400 hover:bg-neutral-700"}`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => fetchVehicles(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="p-2 bg-neutral-800 rounded-lg text-white disabled:opacity-50 hover:bg-neutral-700 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ============== ADD / EDIT SIDEBAR ============== */}
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
                  {isDraftResume
                    ? "Continue Vehicle Setup"
                    : editingVehicleId
                      ? "Edit Vehicle"
                      : "Add New Vehicle"}
                </h3>
                <p className="text-sm text-gray-400 mt-0.5">
                  {addStep === "info"
                    ? "Step 1 of 3 — Vehicle Information"
                    : addStep === "photos"
                      ? "Step 2 of 3 — Photos & Plates"
                      : "Step 3 of 3 — Legal Documents"}
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
            <div className="flex items-center gap-1 px-5 py-3 border-b border-neutral-800">
              {(["info", "photos", "documents"] as const).map((step, i) => {
                const labels = ["Info", "Photos", "Documents"];
                const icons = [Car, Camera, FileText];
                const StepIcon = icons[i];
                const isActive = addStep === step;
                const isPast =
                  (addStep === "photos" && i === 0) ||
                  (addStep === "documents" && i <= 1);
                return (
                  <div key={step} className="flex items-center gap-1 flex-1">
                    <button
                      onClick={() => {
                        if (isPast) setAddStep(step);
                        if (
                          step === "documents" &&
                          addStep === "photos" &&
                          savedVehicleId
                        )
                          setAddStep(step);
                      }}
                      disabled={!isPast && !isActive}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium w-full transition-colors ${isActive ? "bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/30" : isPast ? "bg-green-500/10 text-green-400 border border-green-500/30 cursor-pointer" : "bg-neutral-800 text-gray-500 border border-neutral-700"}`}
                    >
                      {isPast ? (
                        <CheckCircle className="w-3.5 h-3.5" />
                      ) : (
                        <StepIcon className="w-3.5 h-3.5" />
                      )}
                      {labels[i]}
                    </button>
                    {i < 2 && (
                      <div
                        className={`w-4 h-0.5 flex-shrink-0 ${isPast ? "bg-green-500/50" : "bg-neutral-700"}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* ===== STEP 1: Vehicle Info ===== */}
              {addStep === "info" && (
                <form
                  id="vehicle-info-form"
                  onSubmit={handleSave}
                  className="space-y-5"
                >
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Vehicle Category *
                    </label>
                    <select
                      required
                      value={vehicleForm.category}
                      onChange={(e) =>
                        setVehicleForm((p) => ({
                          ...p,
                          category: e.target.value,
                        }))
                      }
                      className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold/50"
                    >
                      <option value="">Select category...</option>
                      {VEHICLE_CATEGORIES.map((cat) => (
                        <option key={cat.key} value={cat.key}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {isLoadingCatalog && vehicleForm.category && (
                    <div className="flex items-center gap-2 text-xs text-luxury-gold">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading
                      available makes and models...
                    </div>
                  )}
                  {vehicleForm.category && !isLoadingCatalog && (
                    <>
                      {!useManualEntry ? (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm text-gray-400 mb-2">
                                Make *
                              </label>
                              <select
                                required
                                value={vehicleForm.make}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === "__OTHER__") {
                                    setUseManualEntry(true);
                                    setVehicleForm((p) => ({
                                      ...p,
                                      make: "",
                                      model: "",
                                      year: new Date().getFullYear(),
                                      capacity: "",
                                    }));
                                    return;
                                  }
                                  setVehicleForm((p) => ({
                                    ...p,
                                    make: val,
                                    model: "",
                                    year: new Date().getFullYear(),
                                  }));
                                }}
                                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold/50"
                              >
                                <option value="">Select make...</option>
                                {catalogMakes.map((m) => (
                                  <option key={m.make} value={m.make}>
                                    {m.make}
                                  </option>
                                ))}
                                <option value="__OTHER__">
                                  Other / Not Listed
                                </option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm text-gray-400 mb-2">
                                Model *
                              </label>
                              <select
                                required
                                value={vehicleForm.model}
                                disabled={!vehicleForm.make}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === "__OTHER__") {
                                    setUseManualEntry(true);
                                    setVehicleForm((p) => ({
                                      ...p,
                                      model: "",
                                      year: new Date().getFullYear(),
                                      capacity: "",
                                    }));
                                    return;
                                  }
                                  setVehicleForm((p) => ({ ...p, model: val }));
                                }}
                                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold/50 disabled:opacity-50"
                              >
                                <option value="">
                                  {vehicleForm.make
                                    ? "Select model..."
                                    : "Select make first"}
                                </option>
                                {catalogModelsForMake.map((m) => (
                                  <option key={m.model} value={m.model}>
                                    {m.model}
                                  </option>
                                ))}
                                {vehicleForm.make && (
                                  <option value="__OTHER__">
                                    Other / Not Listed
                                  </option>
                                )}
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <label className="block text-sm text-gray-400 mb-2">
                                Year *
                              </label>
                              {catalogYears.length > 0 ? (
                                <select
                                  required
                                  value={vehicleForm.year}
                                  onChange={(e) =>
                                    setVehicleForm((p) => ({
                                      ...p,
                                      year: parseInt(e.target.value),
                                    }))
                                  }
                                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold/50"
                                >
                                  {catalogYears.map((y) => (
                                    <option key={y} value={y}>
                                      {y}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="number"
                                  required
                                  value={vehicleForm.year}
                                  onChange={(e) =>
                                    setVehicleForm((p) => ({
                                      ...p,
                                      year: parseInt(e.target.value),
                                    }))
                                  }
                                  min="2015"
                                  max={new Date().getFullYear() + 1}
                                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold/50"
                                />
                              )}
                            </div>
                            <div>
                              <label className="block text-sm text-gray-400 mb-2">
                                Color
                              </label>
                              <input
                                type="text"
                                value={vehicleForm.color}
                                onChange={(e) =>
                                  setVehicleForm((p) => ({
                                    ...p,
                                    color: e.target.value,
                                  }))
                                }
                                placeholder="e.g. Black"
                                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold/50"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-gray-400 mb-2">
                                Capacity
                              </label>
                              <input
                                type="number"
                                value={vehicleForm.capacity}
                                onChange={(e) =>
                                  setVehicleForm((p) => ({
                                    ...p,
                                    capacity: e.target.value,
                                  }))
                                }
                                placeholder="Auto-filled"
                                min="1"
                                max="50"
                                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold/50"
                              />
                              {selectedCatalogModel && (
                                <p className="text-xs text-gray-500 mt-1">
                                  Default: {selectedCatalogModel.defaultSeats}{" "}
                                  seats
                                </p>
                              )}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg flex items-center justify-between">
                            <p className="text-xs text-amber-400 flex items-center gap-2">
                              <PenLine className="w-3.5 h-3.5 flex-shrink-0" />{" "}
                              Manual entry mode — type make and model manually.
                            </p>
                            {!editingVehicleId && catalogMakes.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setUseManualEntry(false);
                                  setVehicleForm((p) => ({
                                    ...p,
                                    make: "",
                                    model: "",
                                    year: new Date().getFullYear(),
                                    capacity: "",
                                  }));
                                }}
                                className="text-xs text-amber-400 hover:text-amber-300 underline ml-3 whitespace-nowrap"
                              >
                                Back to catalog
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm text-gray-400 mb-2">
                                Make *
                              </label>
                              <input
                                type="text"
                                required
                                value={vehicleForm.make}
                                onChange={(e) =>
                                  setVehicleForm((p) => ({
                                    ...p,
                                    make: e.target.value,
                                  }))
                                }
                                placeholder="e.g. Mercedes-Benz"
                                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold/50"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-gray-400 mb-2">
                                Model *
                              </label>
                              <input
                                type="text"
                                required
                                value={vehicleForm.model}
                                onChange={(e) =>
                                  setVehicleForm((p) => ({
                                    ...p,
                                    model: e.target.value,
                                  }))
                                }
                                placeholder="e.g. E-Class"
                                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold/50"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <label className="block text-sm text-gray-400 mb-2">
                                Year *
                              </label>
                              <input
                                type="number"
                                required
                                value={vehicleForm.year}
                                onChange={(e) =>
                                  setVehicleForm((p) => ({
                                    ...p,
                                    year: parseInt(e.target.value),
                                  }))
                                }
                                min="2015"
                                max={new Date().getFullYear() + 1}
                                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold/50"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-gray-400 mb-2">
                                Color
                              </label>
                              <input
                                type="text"
                                value={vehicleForm.color}
                                onChange={(e) =>
                                  setVehicleForm((p) => ({
                                    ...p,
                                    color: e.target.value,
                                  }))
                                }
                                placeholder="e.g. Black"
                                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold/50"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-gray-400 mb-2">
                                Capacity
                              </label>
                              <input
                                type="number"
                                value={vehicleForm.capacity}
                                onChange={(e) =>
                                  setVehicleForm((p) => ({
                                    ...p,
                                    capacity: e.target.value,
                                  }))
                                }
                                placeholder="e.g. 4"
                                min="1"
                                max="50"
                                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold/50"
                              />
                            </div>
                          </div>
                        </>
                      )}
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">
                          Plate Number *
                        </label>
                        <input
                          type="text"
                          required
                          value={vehicleForm.plateNumber}
                          onChange={(e) =>
                            setVehicleForm((p) => ({
                              ...p,
                              plateNumber: e.target.value,
                            }))
                          }
                          placeholder="e.g. ABC 1234"
                          className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold/50"
                        />
                      </div>
                    </>
                  )}
                  {!vehicleForm.category && (
                    <div className="p-6 bg-neutral-800/30 border border-neutral-700/50 rounded-lg text-center">
                      <Car className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">
                        Select a vehicle category above to see available makes
                        and models
                      </p>
                    </div>
                  )}
                </form>
              )}

              {/* ===== STEP 2: Photos ===== */}
              {addStep === "photos" && (
                <div className="space-y-6">
                  {[
                    {
                      title: "Number Plate Photos",
                      icon: Hash,
                      items: [
                        {
                          key: "NUMBER_PLATE_FRONT",
                          label: "Front Plate with Car",
                        },
                        {
                          key: "NUMBER_PLATE_BACK",
                          label: "Back Plate with Car",
                        },
                      ],
                    },
                    {
                      title: "Car Exterior Photos",
                      icon: Camera,
                      items: [
                        { key: "PHOTO_FRONT", label: "Front View" },
                        { key: "PHOTO_BACK", label: "Back View" },
                        { key: "PHOTO_LEFT", label: "Left Side" },
                        { key: "PHOTO_RIGHT", label: "Right Side" },
                      ],
                    },
                    {
                      title: "Interior Photos",
                      icon: Eye,
                      items: [
                        {
                          key: "PHOTO_INTERIOR_FRONT",
                          label: "Interior Front",
                        },
                        { key: "PHOTO_INTERIOR_BACK", label: "Interior Back" },
                      ],
                    },
                  ].map((section) => {
                    const SectionIcon = section.icon;
                    return (
                      <div key={section.title}>
                        <h4 className="text-sm font-medium text-luxury-gold flex items-center gap-2 mb-4">
                          <SectionIcon className="w-4 h-4" /> {section.title}
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                          {section.items.map(({ key, label }) => (
                            <div key={key}>
                              <label className="block text-xs text-gray-500 mb-2">
                                {label} *
                              </label>
                              {photoUploads[key].preview ? (
                                <div className="relative bg-neutral-800 rounded-lg overflow-hidden aspect-video">
                                  <img
                                    src={photoUploads[key].preview!}
                                    alt={label}
                                    className="w-full h-full object-cover"
                                  />
                                  {photoUploads[key].progress < 100 && (
                                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-neutral-700">
                                      <div
                                        className="h-full bg-luxury-gold transition-all"
                                        style={{
                                          width: `${photoUploads[key].progress}%`,
                                        }}
                                      />
                                    </div>
                                  )}
                                  {photoUploads[key].uploaded && (
                                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full flex items-center gap-1">
                                      <CheckCircle className="w-3 h-3" /> Done
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPhotoUploads((p) => ({
                                        ...p,
                                        [key]: { ...emptyUpload },
                                      }))
                                    }
                                    className="absolute top-2 right-2 p-1 bg-red-500/80 rounded-full hover:bg-red-400"
                                  >
                                    <X className="w-3 h-3 text-white" />
                                  </button>
                                </div>
                              ) : (
                                <label className="flex flex-col items-center justify-center aspect-video bg-neutral-800 border-2 border-dashed border-neutral-600 rounded-lg text-gray-400 hover:border-luxury-gold/50 hover:text-luxury-gold cursor-pointer transition-colors">
                                  <Camera className="w-6 h-6 mb-1" />
                                  <span className="text-xs">Upload</span>
                                  <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f)
                                        handleFileWithCropper(
                                          f,
                                          (cropped) =>
                                            handleAddFlowUpload(
                                              key,
                                              cropped,
                                              false,
                                            ),
                                          { title: label },
                                        );
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {/* Odometer */}
                  <div>
                    <h4 className="text-sm font-medium text-luxury-gold flex items-center gap-2 mb-4">
                      <Gauge className="w-4 h-4" /> Odometer Reading
                    </h4>
                    <div>
                      <label className="block text-xs text-gray-500 mb-2">
                        Odometer Photo *
                      </label>
                      {photoUploads.ODOMETER.preview ? (
                        <div className="relative bg-neutral-800 rounded-lg overflow-hidden aspect-video max-w-[50%]">
                          <img
                            src={photoUploads.ODOMETER.preview}
                            alt="Odometer"
                            className="w-full h-full object-cover"
                          />
                          {photoUploads.ODOMETER.progress < 100 && (
                            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-neutral-700">
                              <div
                                className="h-full bg-luxury-gold transition-all"
                                style={{
                                  width: `${photoUploads.ODOMETER.progress}%`,
                                }}
                              />
                            </div>
                          )}
                          {photoUploads.ODOMETER.uploaded && (
                            <div className="absolute top-2 left-2 px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> Done
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setPhotoUploads((p) => ({
                                ...p,
                                ODOMETER: { ...emptyUpload },
                              }))
                            }
                            className="absolute top-2 right-2 p-1 bg-red-500/80 rounded-full hover:bg-red-400"
                          >
                            <X className="w-3 h-3 text-white" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center aspect-video max-w-[50%] bg-neutral-800 border-2 border-dashed border-neutral-600 rounded-lg text-gray-400 hover:border-luxury-gold/50 hover:text-luxury-gold cursor-pointer transition-colors">
                          <Gauge className="w-6 h-6 mb-1" />
                          <span className="text-xs">Upload Odometer</span>
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f)
                                handleFileWithCropper(
                                  f,
                                  (cropped) =>
                                    handleAddFlowUpload(
                                      "ODOMETER",
                                      cropped,
                                      false,
                                    ),
                                  { title: "Crop Odometer Photo" },
                                );
                            }}
                          />
                        </label>
                      )}
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs text-gray-500 mb-1.5">
                        Current Reading (km) *
                      </label>
                      <input
                        type="number"
                        value={vehicleForm.odometerReading}
                        onChange={(e) =>
                          setVehicleForm((p) => ({
                            ...p,
                            odometerReading: e.target.value,
                          }))
                        }
                        placeholder="e.g. 45000"
                        min="0"
                        className="w-full max-w-[60%] px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-lg font-bold focus:outline-none focus:border-luxury-gold/50"
                      />
                    </div>
                  </div>
                  <div className="p-3 bg-neutral-800/50 rounded-lg">
                    <p className="text-xs text-gray-400">
                      {
                        Object.values(photoUploads).filter((u) => u.uploaded)
                          .length
                      }{" "}
                      of {Object.keys(photoUploads).length} photos uploaded. You
                      can skip and upload later from the vehicle detail page.
                    </p>
                  </div>
                </div>
              )}

              {/* ===== STEP 3: Legal Documents ===== */}
              {addStep === "documents" && (
                <div className="space-y-6">
                  <p className="text-sm text-gray-400">
                    Upload required legal documents. Expiry dates help us notify
                    you before they expire.
                  </p>
                  {[
                    { key: "INSURANCE", label: "Vehicle Insurance" },
                    { key: "ISTIMARA", label: "Istimara (Registration)" },
                  ].map(({ key, label }) => (
                    <div
                      key={key}
                      className="p-4 bg-neutral-800 rounded-xl border border-neutral-700 space-y-3"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center ${docUploads[key].uploaded ? "bg-green-500/20" : "bg-luxury-gold/10"}`}
                        >
                          {docUploads[key].uploaded ? (
                            <CheckCircle className="w-5 h-5 text-green-400" />
                          ) : (
                            <FileText className="w-5 h-5 text-luxury-gold" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-medium">{label} *</p>
                          <p className="text-xs text-gray-500">
                            {docUploads[key].uploaded
                              ? "Uploaded successfully"
                              : "PDF, JPG or PNG (max 10MB)"}
                          </p>
                        </div>
                      </div>
                      {!docUploads[key].uploaded ? (
                        <>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              Expiry Date *
                            </label>
                            <input
                              type="date"
                              value={docUploads[key].expiryDate}
                              onChange={(e) =>
                                setDocUploads((prev) => ({
                                  ...prev,
                                  [key]: {
                                    ...prev[key],
                                    expiryDate: e.target.value,
                                  },
                                }))
                              }
                              className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-luxury-gold/50"
                            />
                          </div>
                          {docUploads[key].expiryDate ? (
                            <label className="flex items-center justify-center gap-2 px-4 py-4 bg-neutral-900 border-2 border-dashed border-neutral-600 rounded-lg text-gray-400 hover:border-luxury-gold/50 hover:text-luxury-gold cursor-pointer transition-colors">
                              <Upload className="w-5 h-5" />
                              <span className="text-sm">
                                Click to upload {label}
                              </span>
                              <input
                                type="file"
                                className="hidden"
                                accept=".pdf,.jpg,.jpeg,.png,.webp"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f)
                                    handleFileWithCropper(
                                      f,
                                      (ready) =>
                                        handleAddFlowUpload(
                                          key,
                                          ready,
                                          true,
                                          docUploads[key].expiryDate ||
                                            undefined,
                                        ),
                                      { title: `Crop ${label}` },
                                    );
                                }}
                              />
                            </label>
                          ) : (
                            <div className="flex items-center justify-center gap-2 px-4 py-4 bg-neutral-900 border-2 border-dashed border-neutral-700 rounded-lg text-gray-600">
                              <Upload className="w-5 h-5" />
                              <span className="text-sm">
                                Enter expiry date first to upload
                              </span>
                            </div>
                          )}
                          {docUploads[key].progress > 0 &&
                            docUploads[key].progress < 100 && (
                              <div className="flex items-center gap-2 text-xs text-luxury-gold">
                                <Loader2 className="w-3 h-3 animate-spin" />{" "}
                                Uploading... {docUploads[key].progress}%
                              </div>
                            )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                          <FileText className="w-4 h-4" />
                          <span className="truncate">
                            {docUploads[key].file?.name || "Document uploaded"}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="p-3 bg-neutral-800/50 rounded-lg">
                    <p className="text-xs text-gray-400">
                      {
                        Object.values(docUploads).filter((u) => u.uploaded)
                          .length
                      }{" "}
                      of {Object.keys(docUploads).length} documents uploaded.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-neutral-800 bg-neutral-900/80 backdrop-blur-sm">
              {addStep === "info" && (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddSidebar(false)}
                    disabled={isSaving}
                    className="flex-1 px-4 py-3 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="vehicle-info-form"
                    disabled={isSaving}
                    className="flex-1 px-4 py-3 bg-luxury-gold text-black font-medium rounded-lg hover:bg-luxury-gold/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {editingVehicleId ? "Update & Continue" : "Save & Continue"}
                  </button>
                </div>
              )}
              {addStep === "photos" && (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setAddStep("info")}
                    disabled={isSaving}
                    className="px-4 py-3 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={async () => {
                      // Odometer reading is collected on Step 2 but the vehicle row was already
                      // created on Step 1 with mileage=null. Persist it before moving on, so the
                      // saved value survives a wizard close. No-op if vendor left it blank.
                      if (savedVehicleId && vehicleForm.odometerReading) {
                        try {
                          setIsSaving(true);
                          await vendorApi.updateVehicle(savedVehicleId, {
                            mileage: parseInt(vehicleForm.odometerReading),
                          });
                        } catch (err: any) {
                          showNotification(
                            "error",
                            err.message || "Failed to save odometer reading",
                          );
                          return;
                        } finally {
                          setIsSaving(false);
                        }
                      }
                      setAddStep("documents");
                    }}
                    className="flex-1 px-4 py-3 bg-luxury-gold text-black font-medium rounded-lg hover:bg-luxury-gold/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : null}
                    Continue to Documents
                  </button>
                </div>
              )}
              {addStep === "documents" && (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setAddStep("photos")}
                    disabled={isSaving}
                    className="px-4 py-3 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      canModifyFleet
                        ? handleFinishAdd()
                        : showNotification("warning", fleetLockReason)
                    }
                    disabled={isSaving || !canModifyFleet}
                    title={canModifyFleet ? undefined : fleetLockReason}
                    className={`flex-1 px-4 py-3 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${
                      canModifyFleet
                        ? "bg-luxury-gold text-black hover:bg-luxury-gold/90"
                        : "bg-neutral-800 text-gray-500"
                    }`}
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : !canModifyFleet ? (
                      <ShieldAlert className="w-4 h-4" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}{" "}
                    Submit for Admin Review
                  </button>
                </div>
              )}
            </div>
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
          ) : vehicleDetail ? (
            <div className="flex flex-col h-full">
              {/* Detail Header */}
              <div className="flex items-center justify-between p-5 border-b border-neutral-800">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {vehicleDetail.make} {vehicleDetail.model}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {vehicleDetail.plateNumber}
                  </p>
                </div>
                <button
                  onClick={() => setShowDetailSidebar(false)}
                  className="p-2 hover:bg-neutral-800 rounded-lg"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Detail Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Status Banner */}
                {(() => {
                  const cfg = STATUS_CONFIG[vehicleDetail.status];
                  const StatusIcon = cfg?.icon || AlertCircle;
                  // Derive expiring/expired doc lists from the documents array so we can
                  // surface them in the popover here too (and let the vendor open the
                  // Request Changes modal directly from the popover).
                  const expiringDocs = vehicleDetail.documents
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
                  const expiredDocsList = vehicleDetail.documents
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
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p
                            className={`text-sm font-medium ${cfg?.color || "text-gray-400"}`}
                          >
                            {vehicleDetail.statusLabel ||
                              formatStatus(vehicleDetail.status)}
                          </p>
                          <DocExpiryIndicator
                            expiringDocs={expiringDocs}
                            expiredDocs={expiredDocsList}
                            onRequestChanges={
                              vehicleDetail.status === "APPROVED" &&
                              !hasPendingRequest &&
                              canModifyFleet
                                ? (affectedDocTypes) => {
                                    // Pre-tick the affected doc types in the change request
                                    // modal so the vendor doesn't have to re-pick them.
                                    setChangeRequestFields(affectedDocTypes);
                                    setShowChangeRequestModal(true);
                                  }
                                : undefined
                            }
                          />
                        </div>
                        {vehicleDetail.status === "CHANGES_REQUESTED" &&
                          vehicleDetail.hasUnresolvedReviews && (
                            <p className="text-xs text-amber-400/70 mt-0.5">
                              Admin has flagged fields that need attention — see
                              highlighted items below
                            </p>
                          )}
                        {vehicleDetail.status === "PENDING_REVIEW" && (
                          <p className="text-xs text-purple-400/70 mt-0.5">
                            Your vehicle is being reviewed by the admin team
                          </p>
                        )}
                      </div>
                      {vehicleDetail.status === "APPROVED" && (
                        <span className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-medium rounded-full border border-green-500/30">
                          Verified
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Admin Review Comments */}
                {vehicleDetail.unresolvedReviews &&
                  vehicleDetail.unresolvedReviews.length > 0 && (
                    <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                      <p className="text-xs text-amber-400 font-semibold mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> Admin Review
                        Comments
                      </p>
                      {vehicleDetail.unresolvedReviews.map((review) => (
                        <div
                          key={review.id}
                          className="mt-2 text-xs text-amber-400/80"
                        >
                          <p>{review.message}</p>
                          {review.documents && review.documents.length > 0 && (
                            <p className="mt-1 text-amber-400/60">
                              Flagged: {review.documents.join(", ")}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                {/* Suspended due to expired documents */}
                {vehicleDetail.suspendedForDocs && (
                  <div className="p-4 bg-red-500/10 border border-red-500/40 rounded-xl">
                    <p className="text-sm text-red-400 font-semibold mb-1 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4" /> Vehicle Suspended
                    </p>
                    <p className="text-xs text-red-400/80 mb-2">
                      This vehicle is offline because the following document
                      {vehicleDetail.expiredDocuments.length > 1
                        ? "s have"
                        : " has"}{" "}
                      expired:
                    </p>
                    <ul className="text-xs text-red-400/90 ml-2 mb-2 space-y-0.5">
                      {vehicleDetail.documents
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
                      <span className="font-semibold">
                        Photos &amp; Documents
                      </span>
                      , find the highlighted item
                      {vehicleDetail.expiredDocuments.length > 1 ? "s" : ""},
                      and click <span className="font-semibold">Replace</span>{" "}
                      to upload a renewed copy. Once all required documents are
                      valid, click{" "}
                      <span className="font-semibold">
                        Submit Renewed Documents for Review
                      </span>{" "}
                      at the bottom. The vehicle will be reactivated only after
                      admin approval.
                    </p>
                  </div>
                )}

                {/* Missing uploads */}
                {!vehicleDetail.allDocumentsUploaded && (
                  <div className="p-3 bg-orange-500/5 border border-orange-500/20 rounded-lg">
                    <p className="text-xs text-orange-400 flex items-center gap-2">
                      <Upload className="w-3.5 h-3.5 flex-shrink-0" />{" "}
                      {vehicleDetail.missingDocuments.length} required upload
                      {vehicleDetail.missingDocuments.length !== 1
                        ? "s"
                        : ""}{" "}
                      still missing.
                    </p>
                  </div>
                )}

                {/* Change Request (approved vehicles) */}
                {vehicleDetail.status === "APPROVED" && (
                  <div className="p-4 bg-neutral-800/50 border border-neutral-700 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                          <Edit2 className="w-4 h-4 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">
                            Need to update this vehicle?
                          </p>
                          <p className="text-xs text-gray-500">
                            Submit a change request to admin
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (!canModifyFleet) {
                            showNotification("warning", fleetLockReason);
                            return;
                          }
                          // When opening the modal from the dedicated button, also pre-tick
                          // any currently-expired or about-to-expire doc types. The vendor
                          // can deselect them if they're requesting changes for some other
                          // reason — this is just a sensible default.
                          const affected: string[] = [];
                          vehicleDetail.documents.forEach((d) => {
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
                        disabled={hasPendingRequest || !canModifyFleet}
                        title={
                          !canModifyFleet
                            ? fleetLockReason
                            : hasPendingRequest
                              ? "You already have a pending change request"
                              : undefined
                        }
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {!canModifyFleet ? (
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
                            className={`p-2.5 rounded-lg border text-xs ${!req.isResolved ? "bg-amber-500/5 border-amber-500/20" : "bg-neutral-800/50 border-neutral-700"}`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${!req.isResolved ? "bg-amber-500/20 text-amber-400" : "bg-green-500/20 text-green-400"}`}
                              >
                                {!req.isResolved ? "⏳ Pending" : "✓ Resolved"}
                              </span>
                              <span className="text-[10px] text-gray-500">
                                {formatDate(req.createdAt)}
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
                    Only renders when admin has flagged at least one
                    field/doc/photo on this vehicle. Counts addressed vs
                    pending across info fields, photos, plates, odometer
                    and legal docs — gives the vendor an at-a-glance
                    sense of progress before they hit "Submit Changes
                    for Review" at the bottom. Mirrors the vendor-driver
                    and vendor-profile banners. */}
                {(() => {
                  const snapshot = vehicleDetail.editSnapshot || null;
                  const flaggedFromReq =
                    vehicleDetail.unresolvedReviews?.flatMap(
                      (r) => r.documents || [],
                    ) || [];
                  const flaggedFromCom =
                    vehicleDetail.reviewComments?.map(
                      (c: any) => c.fieldName,
                    ) || [];
                  // Same bucket-expansion as the photo IIFE — a flag on
                  // "vehiclePhotos" means every PHOTO_* type is in play.
                  const BUCKET_EXPAND: Record<string, string[]> = {
                    vehiclePhotos: [
                      "PHOTO_FRONT",
                      "PHOTO_BACK",
                      "PHOTO_LEFT",
                      "PHOTO_RIGHT",
                      "PHOTO_INTERIOR_FRONT",
                      "PHOTO_INTERIOR_BACK",
                    ],
                    numberPlates: ["NUMBER_PLATE_FRONT", "NUMBER_PLATE_BACK"],
                    odometer: ["ODOMETER"],
                    insurance: ["INSURANCE"],
                    istimara: ["ISTIMARA"],
                  };
                  const expanded = [
                    ...flaggedFromReq,
                    ...flaggedFromCom,
                  ].flatMap((t: string) => BUCKET_EXPAND[t] || [t]);
                  const allFlagged = Array.from(new Set<string>(expanded));
                  if (allFlagged.length === 0) return null;
                  if (!snapshot) return null;

                  const norm = (v: any) =>
                    v === undefined || v === null ? "" : String(v);
                  const addressed: string[] = [];
                  const pending: string[] = [];
                  for (const key of allFlagged) {
                    const prev = snapshot[key];
                    if (prev === undefined) {
                      pending.push(key);
                      continue;
                    }
                    // Doc/photo keys live in vehicleDetail.documents[].filePath;
                    // info field keys (make/model/year/plateNumber/...) live
                    // as direct properties on vehicleDetail. Use filePath
                    // (raw, stable) not fileUrl (signed, rotates per
                    // request) for the diff.
                    const docMatch = vehicleDetail.documents?.find(
                      (d: any) => d.type === key,
                    );
                    const curr =
                      docMatch !== undefined
                        ? docMatch.filePath
                        : (vehicleDetail as any)[key];
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

                {/* Vehicle Info — inline-editable when admin has flagged a field */}
                {(() => {
                  // Build flagged set from BOTH the reviewRequest.documents arrays AND the
                  // reviewComments fieldName values (admin's per-field rejections live here).
                  const flaggedFromRequests =
                    vehicleDetail.unresolvedReviews?.flatMap(
                      (r) => r.documents || [],
                    ) || [];
                  const flaggedFromComments =
                    vehicleDetail.reviewComments?.map((c) => c.fieldName) || [];
                  const expiredDocTypes = vehicleDetail.documents
                    .filter((d) => d.isExpired)
                    .map((d) => d.type);
                  const allFlagged = new Set<string>([
                    ...flaggedFromRequests,
                    ...flaggedFromComments,
                    ...expiredDocTypes,
                  ]);
                  const editableFields: string[] | null =
                    vehicleDetail.editableFields ?? null;
                  const snapshot = vehicleDetail.editSnapshot || null;

                  // Editing rules:
                  // - PENDING_REVIEW with NO snapshot = first-time onboarding, all fields editable
                  // - PENDING_REVIEW WITH snapshot = vendor already submitted, awaiting admin → LOCKED
                  // - CHANGES_REQUESTED = only flagged fields editable
                  // - Everything else = locked
                  const isAwaitingReview =
                    vehicleDetail.status === "PENDING_REVIEW";

                  const isEditable = (key: string) => {
                    // PENDING_REVIEW = vendor already submitted, admin's turn → never editable
                    if (isAwaitingReview) return false;
                    // CHANGES_REQUESTED = admin flagged specific fields → only those editable
                    if (vehicleDetail.status === "CHANGES_REQUESTED") {
                      return editableFields
                        ? editableFields.includes(key)
                        : allFlagged.has(key);
                    }
                    // APPROVED / SUSPENDED / etc. → not editable; vendor uses Request Changes path
                    return false;
                  };

                  // After resubmit, fields the vendor changed show "ADDRESSED" with diff
                  const wasAddressed = (key: string) => {
                    if (!snapshot) return false;
                    const prev = snapshot[key];
                    const curr = (vehicleDetail as any)[key];
                    return prev !== undefined && prev !== curr && curr != null;
                  };

                  const infoFields = [
                    {
                      key: "make",
                      label: "Make",
                      value: vehicleDetail.make,
                      type: "text",
                    },
                    {
                      key: "model",
                      label: "Model",
                      value: vehicleDetail.model,
                      type: "text",
                    },
                    {
                      key: "year",
                      label: "Year",
                      value: vehicleDetail.year,
                      type: "number",
                    },
                    {
                      key: "plateNumber",
                      label: "Plate Number",
                      value: vehicleDetail.plateNumber,
                      type: "text",
                    },
                    {
                      key: "color",
                      label: "Color",
                      value: vehicleDetail.color,
                      type: "text",
                    },
                    {
                      key: "category",
                      label: "Category",
                      value: vehicleDetail.category,
                      displayValue: vehicleDetail.categoryLabel,
                      type: "category",
                    },
                    {
                      key: "mileage",
                      label: "Mileage (km)",
                      value: vehicleDetail.mileage,
                      type: "number",
                    },
                  ];

                  return (
                    <div>
                      <h4 className="text-sm font-medium text-luxury-gold flex items-center gap-2 mb-3">
                        <FileText className="w-4 h-4" /> Vehicle Information
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        {infoFields.map((f) => {
                          const isFlagged = allFlagged.has(f.key);
                          const editable = isEditable(f.key);
                          const isEditing = editingField === f.key;
                          const addressed = wasAddressed(f.key);
                          const fieldComment =
                            vehicleDetail.reviewComments?.find(
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
                                  {f.type === "category" ? (
                                    <select
                                      value={editingFieldValue}
                                      onChange={(e) =>
                                        setEditingFieldValue(e.target.value)
                                      }
                                      className="w-full px-2 py-1.5 bg-neutral-900 border border-luxury-gold/40 rounded text-white text-sm focus:outline-none focus:border-luxury-gold"
                                      autoFocus
                                    >
                                      <option value="">
                                        Select category...
                                      </option>
                                      <option value="FIRST_CLASS">
                                        First Class
                                      </option>
                                      <option value="BUSINESS">Business</option>
                                      <option value="ECONOMY">Economy</option>
                                      <option value="LUXURY">Luxury</option>
                                      <option value="SUV">SUV</option>
                                    </select>
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
                                            vehicleDetail.id,
                                            f.key,
                                            editingFieldValue,
                                          );
                                        if (e.key === "Escape") {
                                          setEditingField(null);
                                          setEditingFieldValue("");
                                        }
                                      }}
                                    />
                                  )}
                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={() =>
                                        handleSaveInlineField(
                                          vehicleDetail.id,
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
                                // After resubmit: show before/after diff
                                <div className="space-y-1">
                                  <p className="text-xs text-red-400/70 line-through">
                                    {prevValue != null && prevValue !== ""
                                      ? String(prevValue)
                                      : "Empty"}
                                  </p>
                                  <p className="text-emerald-400 font-medium">
                                    {f.displayValue ??
                                      (f.value != null && f.value !== ""
                                        ? String(f.value)
                                        : "—")}
                                  </p>
                                </div>
                              ) : (
                                <p className="text-white font-medium">
                                  {f.displayValue ??
                                    (f.value != null && f.value !== ""
                                      ? String(f.value)
                                      : "—")}
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
                        <div className="bg-neutral-800/50 rounded-lg p-3">
                          <p className="text-xs text-gray-500">Driver</p>
                          <p className="text-white font-medium">
                            {vehicleDetail.assignedDriver?.name || "Unassigned"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ===== PHOTO SECTIONS (plates, exterior, interior) ===== */}
                {(() => {
                  const flaggedFromReq =
                    vehicleDetail.unresolvedReviews?.flatMap(
                      (r) => r.documents || [],
                    ) || [];
                  const flaggedFromCom =
                    vehicleDetail.reviewComments?.map(
                      (c: any) => c.fieldName,
                    ) || [];
                  // Expand bucket names to individual doc types so a flag on "vehiclePhotos" highlights every PHOTO_*
                  const BUCKET_EXPAND: Record<string, string[]> = {
                    vehiclePhotos: [
                      "PHOTO_FRONT",
                      "PHOTO_BACK",
                      "PHOTO_LEFT",
                      "PHOTO_RIGHT",
                      "PHOTO_INTERIOR_FRONT",
                      "PHOTO_INTERIOR_BACK",
                    ],
                    numberPlates: ["NUMBER_PLATE_FRONT", "NUMBER_PLATE_BACK"],
                    odometer: ["ODOMETER"],
                    insurance: ["INSURANCE"],
                    istimara: ["ISTIMARA"],
                  };
                  // Also treat any expired document as "flagged" so the same UI affordances apply.
                  const flaggedFromExpiry = vehicleDetail.documents
                    .filter((d) => d.isExpired)
                    .map((d) => d.type);
                  const flaggedTypes = Array.from(
                    new Set([
                      ...flaggedFromReq,
                      ...flaggedFromCom,
                      ...flaggedFromExpiry,
                      ...[...flaggedFromReq, ...flaggedFromCom].flatMap(
                        (t: string) => BUCKET_EXPAND[t] || [],
                      ),
                    ]),
                  );
                  const photoSections = [
                    {
                      title: "Number Plate Photos",
                      icon: Hash,
                      filter: (d: any) => d.type.includes("PLATE"),
                    },
                    {
                      title: "Car Exterior Photos",
                      icon: Camera,
                      filter: (d: any) =>
                        d.type.startsWith("PHOTO_") &&
                        !d.type.startsWith("PHOTO_INTERIOR"),
                    },
                    {
                      title: "Interior Photos",
                      icon: Eye,
                      filter: (d: any) => d.type.startsWith("PHOTO_INTERIOR"),
                    },
                  ];
                  return photoSections.map((section) => {
                    const docs =
                      vehicleDetail.documents?.filter(section.filter) || [];
                    if (docs.length === 0) return null;
                    const SectionIcon = section.icon;
                    // Snapshot lookup — populated by admin's request-changes
                    // path. Keys are individual doc types (PHOTO_FRONT,
                    // NUMBER_PLATE_FRONT, etc.). Comparing snapshot[type]
                    // to the current fileUrl lets us flip a photo card to
                    // emerald "Addressed" the moment the vendor uploads
                    // a replacement. Mirrors the vendor-driver pattern.
                    const snapshot = vehicleDetail.editSnapshot || null;
                    const normUrl = (v: any) =>
                      v === undefined || v === null ? "" : String(v);
                    return (
                      <div key={section.title}>
                        <h4 className="text-sm font-medium text-luxury-gold flex items-center gap-2 mb-3">
                          <SectionIcon className="w-4 h-4" /> {section.title}
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                          {docs.map((doc) => {
                            const isFlagged = flaggedTypes.includes(doc.type);
                            const isAddressed =
                              isFlagged &&
                              !!snapshot &&
                              snapshot[doc.type] !== undefined &&
                              normUrl(snapshot[doc.type]) !==
                                normUrl(doc.filePath);
                            return (
                              <div
                                key={doc.type}
                                className={`rounded-lg overflow-hidden ${
                                  isAddressed
                                    ? "ring-2 ring-emerald-500/60"
                                    : isFlagged
                                      ? "ring-2 ring-amber-500/50"
                                      : ""
                                }`}
                              >
                                <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
                                  {doc.label}
                                  {/* Addressed wins over Action Required —
                                      mirrors the driver-side doc pattern. */}
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
                                </p>
                                {doc.isUploaded && doc.fileUrl ? (
                                  <div
                                    className={`relative bg-neutral-800 rounded-lg overflow-hidden aspect-video group cursor-pointer ${
                                      isAddressed
                                        ? "ring-2 ring-emerald-500/60"
                                        : isFlagged
                                          ? "ring-2 ring-amber-500/50"
                                          : ""
                                    }`}
                                  >
                                    <img
                                      src={
                                        proxiedImageUrl(doc.fileUrl, 320) ||
                                        doc.fileUrl
                                      }
                                      alt={doc.label}
                                      loading="lazy"
                                      decoding="async"
                                      className="w-full h-full object-cover"
                                      onClick={() =>
                                        handleViewDocument(
                                          doc.fileUrl!,
                                          doc.fileName || undefined,
                                          doc.label,
                                        )
                                      }
                                    />
                                    <div
                                      className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center pointer-events-none"
                                      onClick={() =>
                                        handleViewDocument(
                                          doc.fileUrl!,
                                          doc.fileName || undefined,
                                          doc.label,
                                        )
                                      }
                                    >
                                      <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    {!isFlagged && (
                                      <div className="absolute top-1.5 left-1.5 px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full flex items-center gap-1">
                                        <CheckCircle className="w-3 h-3" />{" "}
                                        Uploaded
                                      </div>
                                    )}
                                    {isFlagged &&
                                      !(
                                        vehicleDetail.status ===
                                          "PENDING_REVIEW" &&
                                        vehicleDetail.editSnapshot
                                      ) && (
                                        <label className="absolute bottom-1.5 right-1.5 z-10 px-2 py-1 bg-amber-500 text-black text-[11px] font-semibold rounded-md hover:bg-amber-400 cursor-pointer flex items-center gap-1 shadow-lg">
                                          <Upload className="w-3 h-3" /> Replace
                                          <input
                                            type="file"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => {
                                              const file = e.target.files?.[0];
                                              if (file)
                                                handleFileWithCropper(
                                                  file,
                                                  (cropped) =>
                                                    handleDocumentUpload(
                                                      vehicleDetail.id,
                                                      doc.type,
                                                      cropped,
                                                    ),
                                                  {
                                                    title: `Crop ${doc.label}`,
                                                  },
                                                );
                                            }}
                                          />
                                        </label>
                                      )}
                                  </div>
                                ) : (
                                  <label className="flex flex-col items-center justify-center aspect-video bg-neutral-800 border-2 border-dashed border-neutral-600 rounded-lg text-gray-400 hover:border-luxury-gold/50 hover:text-luxury-gold cursor-pointer transition-colors">
                                    <Camera className="w-6 h-6 mb-1" />
                                    <span className="text-xs">Upload</span>
                                    <input
                                      type="file"
                                      className="hidden"
                                      accept="image/*"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file)
                                          handleFileWithCropper(
                                            file,
                                            (cropped) =>
                                              handleDocumentUpload(
                                                vehicleDetail.id,
                                                doc.type,
                                                cropped,
                                              ),
                                            { title: `Crop ${doc.label}` },
                                          );
                                      }}
                                    />
                                  </label>
                                )}
                                {uploadingDocType === doc.type && (
                                  <div className="mt-1 flex items-center gap-1 text-xs text-luxury-gold">
                                    <Loader2 className="w-3 h-3 animate-spin" />{" "}
                                    Uploading...
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}

                {/* ===== ODOMETER ===== */}
                {(() => {
                  const odometerDoc = vehicleDetail.documents?.find(
                    (d) => d.type === "ODOMETER",
                  );
                  const flaggedFromReq =
                    vehicleDetail.unresolvedReviews?.flatMap(
                      (r) => r.documents || [],
                    ) || [];
                  const flaggedFromCom =
                    vehicleDetail.reviewComments?.map(
                      (c: any) => c.fieldName,
                    ) || [];
                  // Expand bucket names to individual doc types so a flag on "vehiclePhotos" highlights every PHOTO_*
                  const BUCKET_EXPAND: Record<string, string[]> = {
                    vehiclePhotos: [
                      "PHOTO_FRONT",
                      "PHOTO_BACK",
                      "PHOTO_LEFT",
                      "PHOTO_RIGHT",
                      "PHOTO_INTERIOR_FRONT",
                      "PHOTO_INTERIOR_BACK",
                    ],
                    numberPlates: ["NUMBER_PLATE_FRONT", "NUMBER_PLATE_BACK"],
                    odometer: ["ODOMETER"],
                    insurance: ["INSURANCE"],
                    istimara: ["ISTIMARA"],
                  };
                  // Also treat any expired document as "flagged" so the same UI affordances apply.
                  const flaggedFromExpiry = vehicleDetail.documents
                    .filter((d) => d.isExpired)
                    .map((d) => d.type);
                  const flaggedTypes = Array.from(
                    new Set([
                      ...flaggedFromReq,
                      ...flaggedFromCom,
                      ...flaggedFromExpiry,
                      ...[...flaggedFromReq, ...flaggedFromCom].flatMap(
                        (t: string) => BUCKET_EXPAND[t] || [],
                      ),
                    ]),
                  );
                  const isFlagged = flaggedTypes.includes("ODOMETER");
                  // Snapshot diff for odometer — same logic as photo grid:
                  // when admin rejected odometer AND vendor uploaded a
                  // replacement, snapshot's old fileUrl ≠ current → flip
                  // to emerald "Addressed."
                  const odomSnapshot = vehicleDetail.editSnapshot || null;
                  const odomNorm = (v: any) =>
                    v === undefined || v === null ? "" : String(v);
                  const isAddressed =
                    isFlagged &&
                    !!odomSnapshot &&
                    odomSnapshot["ODOMETER"] !== undefined &&
                    odomNorm(odomSnapshot["ODOMETER"]) !==
                      odomNorm(odometerDoc?.filePath);
                  return (
                    <div>
                      <h4 className="text-sm font-medium text-luxury-gold flex items-center gap-2 mb-3">
                        <Gauge className="w-4 h-4" /> Odometer Reading
                      </h4>
                      <div
                        className={`bg-neutral-800 rounded-xl border p-4 space-y-4 ${
                          isAddressed
                            ? "border-emerald-500/40"
                            : isFlagged
                              ? "border-amber-500/30"
                              : "border-neutral-700"
                        }`}
                      >
                        <div>
                          <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
                            Odometer Photo{" "}
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
                          </p>
                          {odometerDoc?.isUploaded && odometerDoc?.fileUrl ? (
                            <div
                              className={`relative bg-neutral-900 rounded-lg overflow-hidden aspect-video max-w-[60%] group cursor-pointer ${
                                isAddressed
                                  ? "ring-2 ring-emerald-500/60"
                                  : isFlagged
                                    ? "ring-2 ring-amber-500/50"
                                    : ""
                              }`}
                            >
                              <img
                                src={
                                  proxiedImageUrl(odometerDoc.fileUrl, 400) ??
                                  odometerDoc.fileUrl
                                }
                                alt="Odometer"
                                className="w-full h-full object-cover"
                                onClick={() =>
                                  handleViewDocument(
                                    odometerDoc.fileUrl!,
                                    odometerDoc.fileName || undefined,
                                    "Odometer Reading",
                                  )
                                }
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center pointer-events-none">
                                <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                              {isFlagged &&
                                !(
                                  vehicleDetail.status === "PENDING_REVIEW" &&
                                  vehicleDetail.editSnapshot
                                ) && (
                                  <label className="absolute bottom-1.5 right-1.5 z-10 px-2 py-1 bg-amber-500 text-black text-[11px] font-semibold rounded-md hover:bg-amber-400 cursor-pointer flex items-center gap-1 shadow-lg">
                                    <Upload className="w-3 h-3" /> Replace
                                    <input
                                      type="file"
                                      className="hidden"
                                      accept="image/*"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file)
                                          handleFileWithCropper(
                                            file,
                                            (cropped) =>
                                              handleDocumentUpload(
                                                vehicleDetail.id,
                                                "ODOMETER",
                                                cropped,
                                              ),
                                            { title: "Crop Odometer Photo" },
                                          );
                                      }}
                                    />
                                  </label>
                                )}
                            </div>
                          ) : (
                            <label className="flex flex-col items-center justify-center aspect-video max-w-[60%] bg-neutral-900 border-2 border-dashed border-neutral-600 rounded-lg text-gray-400 hover:border-luxury-gold/50 hover:text-luxury-gold cursor-pointer transition-colors">
                              <Gauge className="w-6 h-6 mb-1" />
                              <span className="text-xs">Upload Odometer</span>
                              <input
                                type="file"
                                className="hidden"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file)
                                    handleFileWithCropper(
                                      file,
                                      (cropped) =>
                                        handleDocumentUpload(
                                          vehicleDetail.id,
                                          "ODOMETER",
                                          cropped,
                                        ),
                                      { title: "Crop Odometer Photo" },
                                    );
                                }}
                              />
                            </label>
                          )}
                          {uploadingDocType === "ODOMETER" && (
                            <div className="mt-1 flex items-center gap-1 text-xs text-luxury-gold">
                              <Loader2 className="w-3 h-3 animate-spin" />{" "}
                              Uploading...
                            </div>
                          )}
                        </div>
                        {vehicleDetail.mileage != null ? (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">
                              Current Reading
                            </p>
                            <p className="text-2xl font-bold text-white">
                              {Number(vehicleDetail.mileage).toLocaleString()}{" "}
                              <span className="text-sm text-luxury-gold font-normal">
                                km
                              </span>
                            </p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">
                              Current Reading
                            </p>
                            <p className="text-sm text-gray-400">
                              Not recorded yet
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* ===== LEGAL DOCUMENTS ===== */}
                {(() => {
                  const legalDocs =
                    vehicleDetail.documents?.filter(
                      (d) =>
                        !d.type.includes("PLATE") &&
                        !d.type.startsWith("PHOTO_") &&
                        d.type !== "ODOMETER",
                    ) || [];
                  const flaggedFromReq =
                    vehicleDetail.unresolvedReviews?.flatMap(
                      (r) => r.documents || [],
                    ) || [];
                  const flaggedFromCom =
                    vehicleDetail.reviewComments?.map(
                      (c: any) => c.fieldName,
                    ) || [];
                  // Expand bucket names to individual doc types so a flag on "vehiclePhotos" highlights every PHOTO_*
                  const BUCKET_EXPAND: Record<string, string[]> = {
                    vehiclePhotos: [
                      "PHOTO_FRONT",
                      "PHOTO_BACK",
                      "PHOTO_LEFT",
                      "PHOTO_RIGHT",
                      "PHOTO_INTERIOR_FRONT",
                      "PHOTO_INTERIOR_BACK",
                    ],
                    numberPlates: ["NUMBER_PLATE_FRONT", "NUMBER_PLATE_BACK"],
                    odometer: ["ODOMETER"],
                    insurance: ["INSURANCE"],
                    istimara: ["ISTIMARA"],
                  };
                  // Also treat any expired document as "flagged" so the same UI affordances apply.
                  const flaggedFromExpiry = vehicleDetail.documents
                    .filter((d) => d.isExpired)
                    .map((d) => d.type);
                  const flaggedTypes = Array.from(
                    new Set([
                      ...flaggedFromReq,
                      ...flaggedFromCom,
                      ...flaggedFromExpiry,
                      ...[...flaggedFromReq, ...flaggedFromCom].flatMap(
                        (t: string) => BUCKET_EXPAND[t] || [],
                      ),
                    ]),
                  );
                  if (legalDocs.length === 0) return null;
                  // Snapshot diff for legal docs — same logic as photos
                  // and odometer. INSURANCE / ISTIMARA keys are the
                  // canonical snapshot keys.
                  const legalSnapshot = vehicleDetail.editSnapshot || null;
                  const legalNorm = (v: any) =>
                    v === undefined || v === null ? "" : String(v);
                  return (
                    <div>
                      <h4 className="text-sm font-medium text-luxury-gold flex items-center gap-2 mb-3">
                        <FileText className="w-4 h-4" /> Legal Documents
                      </h4>
                      <div className="space-y-3">
                        {legalDocs.map((doc) => {
                          const isFlagged = flaggedTypes.includes(doc.type);
                          const isAddressed =
                            isFlagged &&
                            !!legalSnapshot &&
                            legalSnapshot[doc.type] !== undefined &&
                            legalNorm(legalSnapshot[doc.type]) !==
                              legalNorm(doc.filePath);
                          return (
                            <div
                              key={doc.type}
                              className={`bg-neutral-800 rounded-xl p-4 border ${
                                isAddressed
                                  ? "border-emerald-500/60 bg-emerald-500/5"
                                  : isFlagged
                                    ? "border-amber-500/30 bg-amber-500/5"
                                    : doc.isUploaded
                                      ? "border-neutral-700"
                                      : "border-red-500/30"
                              }`}
                            >
                              <div className="flex items-center gap-3 mb-2">
                                <div
                                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
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
                                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                                  ) : isFlagged ? (
                                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                                  ) : doc.isUploaded ? (
                                    <CheckCircle className="w-5 h-5 text-green-400" />
                                  ) : (
                                    <XCircle className="w-5 h-5 text-red-400" />
                                  )}
                                </div>
                                <div className="flex-1">
                                  <p className="text-white font-medium flex items-center gap-2 flex-wrap">
                                    {doc.label}
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
                                    {doc.isUploaded && doc.expiryDate && (
                                      <InlineExpiryChip
                                        expiryDate={doc.expiryDate}
                                      />
                                    )}
                                  </p>
                                  {doc.isUploaded ? (
                                    <p className="text-xs text-gray-500">
                                      {doc.fileName || "Uploaded"}
                                      {doc.expiryDate &&
                                        ` · Expires: ${formatDate(doc.expiryDate)}`}
                                      {doc.isExpired && (
                                        <span className="text-red-400 ml-1">
                                          — Expired!
                                        </span>
                                      )}
                                    </p>
                                  ) : (
                                    <p className="text-xs text-red-400">
                                      Not uploaded
                                    </p>
                                  )}
                                </div>
                                {doc.isUploaded && doc.fileUrl && (
                                  <button
                                    onClick={() =>
                                      handleViewDocument(
                                        doc.fileUrl!,
                                        doc.fileName || undefined,
                                        doc.label,
                                      )
                                    }
                                    className="p-2 text-luxury-gold hover:bg-luxury-gold/10 rounded-lg transition-colors"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                              {!doc.isUploaded &&
                                !pendingDocFile[doc.type] &&
                                canModifyFleet && (
                                  <label className="flex items-center justify-center gap-2 px-4 py-3 bg-neutral-900 border-2 border-dashed border-neutral-600 rounded-lg text-gray-400 hover:border-luxury-gold/50 hover:text-luxury-gold cursor-pointer transition-colors">
                                    <Upload className="w-4 h-4" />
                                    <span className="text-sm">
                                      Upload {doc.label}
                                    </span>
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
                                          // Stage the file — UI now shows
                                          // the inline expiry-date picker
                                          // (rendered below). The cropper
                                          // and upload won't run until the
                                          // user confirms with a date.
                                          setPendingDocFile((p) => ({
                                            ...p,
                                            [doc.type]: file,
                                          }));
                                        } else {
                                          // No expiry needed — go straight
                                          // through the cropper to upload.
                                          handleFileWithCropper(
                                            file,
                                            (ready) =>
                                              handleDocumentUpload(
                                                vehicleDetail.id,
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
                                )}
                              {doc.isUploaded &&
                                !pendingDocFile[doc.type] &&
                                canModifyFleet &&
                                (isFlagged ||
                                  vehicleDetail.status === "PENDING_REVIEW") &&
                                !(
                                  vehicleDetail.status === "PENDING_REVIEW" &&
                                  vehicleDetail.editSnapshot
                                ) && (
                                  <label className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 bg-neutral-700 text-gray-300 rounded-lg text-xs hover:bg-neutral-600 cursor-pointer transition-colors">
                                    <Upload className="w-3 h-3" /> Replace
                                    <input
                                      type="file"
                                      className="hidden"
                                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        e.target.value = "";
                                        if (doc.requiresExpiry) {
                                          // Stage — inline date picker
                                          // renders below.
                                          setPendingDocFile((p) => ({
                                            ...p,
                                            [doc.type]: file,
                                          }));
                                        } else {
                                          handleFileWithCropper(
                                            file,
                                            (ready) =>
                                              handleDocumentUpload(
                                                vehicleDetail.id,
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
                                )}

                              {/* Inline expiry-date picker for a staged
                                  file. Rendered for both Upload and
                                  Replace flows — the staged file plus a
                                  date both need to be present before the
                                  cropper + upload runs. */}
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
                                      // Disallow past dates — the doc is
                                      // being uploaded as currently-valid
                                      // proof, so the expiry must be in
                                      // the future. (Backend also rejects
                                      // past dates for required-expiry
                                      // doc types.)
                                      min={
                                        new Date().toISOString().split("T")[0]
                                      }
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
                                        const expiry =
                                          pendingDocExpiry[doc.type];
                                        if (!file || !expiry) return;
                                        // Snapshot the values before
                                        // clearing — state updates are
                                        // batched and we don't want the
                                        // cropper callback closing over
                                        // stale values.
                                        const docType = doc.type;
                                        const docLabel = doc.label;
                                        const vehicleId = vehicleDetail.id;
                                        clearPendingDoc(docType);
                                        handleFileWithCropper(
                                          file,
                                          (ready) =>
                                            handleDocumentUpload(
                                              vehicleId,
                                              docType,
                                              ready,
                                              expiry,
                                            ),
                                          { title: `Crop ${docLabel}` },
                                        );
                                      }}
                                      className="flex-1 px-3 py-1.5 bg-luxury-gold/20 text-luxury-gold rounded text-xs hover:bg-luxury-gold/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                    </div>
                  );
                })()}
              </div>
              {/* END scrollable content */}

              {/* Detail Footer */}
              <div className="p-5 border-t border-neutral-800 space-y-3">
                {(() => {
                  const isSuspended = vehicleDetail.suspendedForDocs === true;
                  const awaitingReview =
                    vehicleDetail.status === "PENDING_REVIEW";

                  // Awaiting admin review — vendor's job is done, just show a banner
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
                              ? "Your renewed documents are with the admin. The vehicle will be reactivated once approved."
                              : "Your submission is with the admin. You'll be notified when they respond."}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  // Suspended + status APPROVED → vendor needs to resubmit after renewals
                  if (isSuspended && vehicleDetail.status === "APPROVED") {
                    const requiredWithExpiry = ["INSURANCE", "ISTIMARA"];
                    const now = new Date();
                    const stillMissingOrExpired = requiredWithExpiry.filter(
                      (t) => {
                        const d = vehicleDetail.documents.find(
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
                          canModifyFleet
                            ? handleSubmitForReview(vehicleDetail.id)
                            : showNotification("warning", fleetLockReason)
                        }
                        disabled={
                          actionLoading === vehicleDetail.id || !canModifyFleet
                        }
                        title={canModifyFleet ? undefined : fleetLockReason}
                        className={`w-full px-4 py-3 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${
                          canModifyFleet
                            ? "bg-luxury-gold text-black hover:bg-luxury-gold/90"
                            : "bg-neutral-800 text-gray-500"
                        }`}
                      >
                        {actionLoading === vehicleDetail.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : !canModifyFleet ? (
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

                  // CHANGES_REQUESTED → vendor can resubmit at any time. We don't gate on
                  // whether the vendor has actually addressed the flagged items — if they
                  // haven't, the admin can re-reject. This matches the user's expectation
                  // that they can always send their current state back to the admin.
                  if (vehicleDetail.status === "CHANGES_REQUESTED") {
                    const hasFlags =
                      (vehicleDetail.reviewComments?.length ?? 0) > 0;
                    const hasMissingDocs = !vehicleDetail.allDocumentsUploaded;
                    return (
                      <div className="space-y-2">
                        <button
                          onClick={() =>
                            canModifyFleet
                              ? handleSubmitForReview(vehicleDetail.id)
                              : showNotification("warning", fleetLockReason)
                          }
                          disabled={
                            actionLoading === vehicleDetail.id ||
                            !canModifyFleet
                          }
                          title={canModifyFleet ? undefined : fleetLockReason}
                          className={`w-full px-4 py-3 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${
                            canModifyFleet
                              ? "bg-luxury-gold text-black hover:bg-luxury-gold/90"
                              : "bg-neutral-800 text-gray-500"
                          }`}
                        >
                          {actionLoading === vehicleDetail.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : !canModifyFleet ? (
                            <ShieldAlert className="w-4 h-4" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}{" "}
                          Submit Changes for Review
                        </button>
                        {(hasFlags || hasMissingDocs) && (
                          <p className="text-xs text-amber-400/80 text-center">
                            {hasMissingDocs
                              ? `Note: ${vehicleDetail.missingDocuments.length} document${vehicleDetail.missingDocuments.length !== 1 ? "s" : ""} still missing. `
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
                {(vehicleDetail.status === "APPROVED" ||
                  vehicleDetail.status === "UNDER_MAINTENANCE") &&
                  !vehicleDetail.suspendedForDocs && (
                    <>
                      {/* Assign / change driver — only when fully active */}
                      {vehicleDetail.status === "APPROVED" &&
                        vehicleDetail.isActive && (
                          <button
                            onClick={() => handleOpenAssign()}
                            className="w-full px-4 py-3 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2"
                          >
                            <User className="w-4 h-4" />
                            {vehicleDetail.assignedDriver
                              ? "Change Driver"
                              : "Assign Driver"}
                          </button>
                        )}

                      {/* Operational state controls */}
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
                          Vehicle State
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          {/* Active — green when current, faded otherwise. Disabled when already active. */}
                          <button
                            onClick={() =>
                              handleToggleStatus(vehicleDetail.id, "activate")
                            }
                            disabled={
                              actionLoading === vehicleDetail.id ||
                              (vehicleDetail.status === "APPROVED" &&
                                vehicleDetail.isActive)
                            }
                            className={`px-3 py-2.5 rounded-lg text-xs font-medium transition-colors flex flex-col items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed ${
                              vehicleDetail.status === "APPROVED" &&
                              vehicleDetail.isActive
                                ? "bg-green-500/20 text-green-400 border border-green-500/40"
                                : "bg-neutral-800 text-gray-300 hover:bg-green-500/10 hover:text-green-400 border border-neutral-700"
                            }`}
                          >
                            <CheckCircle className="w-4 h-4" />
                            Active
                          </button>

                          {/* Inactive */}
                          <button
                            onClick={() =>
                              handleToggleStatus(vehicleDetail.id, "deactivate")
                            }
                            disabled={
                              actionLoading === vehicleDetail.id ||
                              (vehicleDetail.status === "APPROVED" &&
                                !vehicleDetail.isActive)
                            }
                            className={`px-3 py-2.5 rounded-lg text-xs font-medium transition-colors flex flex-col items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed ${
                              vehicleDetail.status === "APPROVED" &&
                              !vehicleDetail.isActive
                                ? "bg-neutral-700 text-gray-300 border border-neutral-600"
                                : "bg-neutral-800 text-gray-300 hover:bg-neutral-700 border border-neutral-700"
                            }`}
                          >
                            <Pause className="w-4 h-4" />
                            Inactive
                          </button>

                          {/* Maintenance */}
                          <button
                            onClick={() =>
                              handleToggleStatus(
                                vehicleDetail.id,
                                "maintenance",
                              )
                            }
                            disabled={
                              actionLoading === vehicleDetail.id ||
                              vehicleDetail.status === "UNDER_MAINTENANCE"
                            }
                            className={`px-3 py-2.5 rounded-lg text-xs font-medium transition-colors flex flex-col items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed ${
                              vehicleDetail.status === "UNDER_MAINTENANCE"
                                ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                                : "bg-neutral-800 text-gray-300 hover:bg-amber-500/10 hover:text-amber-400 border border-neutral-700"
                            }`}
                          >
                            <Wrench className="w-4 h-4" />
                            Maintenance
                          </button>
                        </div>
                        {/* Contextual help text */}
                        <p className="text-[10px] text-gray-500 mt-2">
                          {vehicleDetail.status === "UNDER_MAINTENANCE"
                            ? "Under maintenance — vehicle is not bookable. Switch to Active when ready."
                            : !vehicleDetail.isActive
                              ? "Vehicle is inactive — not bookable."
                              : "Vehicle is active and available for bookings."}
                        </p>
                      </div>
                    </>
                  )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ============== ASSIGN DRIVER MODAL ============== */}
      {showAssignModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !isAssigning && setShowAssignModal(false)}
          />
          <div className="relative w-full max-w-sm mx-4 bg-neutral-900 border border-neutral-800 rounded-xl">
            <div className="p-5 border-b border-neutral-800">
              <h3 className="text-white font-semibold">
                {vehicleDetail?.assignedDriver
                  ? "Change Driver"
                  : "Assign Driver"}
              </h3>
            </div>
            <div className="p-5">
              <select
                value={selectedDriverId || ""}
                onChange={(e) => setSelectedDriverId(e.target.value || null)}
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold/50"
              >
                <option value="">No driver (unassign)</option>
                {availableDrivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.rating ? `(${d.rating.toFixed(1)}★)` : ""}
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
                onClick={handleAssignDriver}
                disabled={isAssigning}
                className="flex-1 px-4 py-2.5 bg-luxury-gold text-black font-medium rounded-lg hover:bg-luxury-gold/90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isAssigning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}{" "}
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
                Delete Vehicle
              </h3>
              <p className="text-gray-400 text-sm">
                Are you sure you want to delete{" "}
                <span className="text-white font-medium">
                  {deletingVehicleName}
                </span>
                ? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 p-5 border-t border-neutral-800">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeletingVehicleId(null);
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
                )}{" "}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============== CHANGE REQUEST MODAL ============== */}
      {showChangeRequestModal && vehicleDetail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowChangeRequestModal(false)}
          />
          <div className="relative w-full max-w-lg mx-4 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold text-lg">
                  Request Vehicle Changes
                </h3>
                <p className="text-sm text-gray-400">
                  {vehicleDetail.make} {vehicleDetail.model} —{" "}
                  {vehicleDetail.plateNumber}
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
                  {CHANGE_REQUEST_FIELD_GROUPS.map((group) => {
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
                              className={`w-4 h-4 rounded border flex items-center justify-center ${allSelected ? "bg-luxury-gold border-luxury-gold" : selectedInGroup > 0 ? "bg-luxury-gold/30 border-luxury-gold/50" : "border-neutral-600"}`}
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
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] border transition-all ${sel ? "bg-luxury-gold/15 border-luxury-gold/40 text-luxury-gold font-medium" : "bg-neutral-800/50 border-neutral-700/50 text-gray-500 hover:text-gray-300 hover:border-neutral-600"}`}
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
                  placeholder="e.g. Vehicle repainted, need to update exterior photos..."
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
                  !canModifyFleet
                }
                title={canModifyFleet ? undefined : fleetLockReason}
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
