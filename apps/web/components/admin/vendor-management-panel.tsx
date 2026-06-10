"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { adminApi } from "@/lib/api";
import {
  Truck,
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
  Car,
  Building2,
  CreditCard,
  AlertTriangle,
  FileText,
  MessageSquare,
  Send,
  User,
  Camera,
  Gauge,
  Shield,
  Edit2,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { useNotification } from "@/lib/notification-context";
import DocumentViewer from "@/components/ui/document-viewer";
import ProfileImage from "@/components/ui/profile-image";
import { EmailInput } from "@/components/ui/form-fields";

const statusColors: Record<string, string> = {
  INVITED: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  ONBOARDING: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  PENDING_REVIEW: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  CHANGES_REQUESTED: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  APPROVED: "bg-green-500/10 text-green-400 border-green-500/30",
  SUSPENDED: "bg-red-500/10 text-red-400 border-red-500/30",
};
const statusLabels: Record<string, string> = {
  INVITED: "Invited",
  ONBOARDING: "Onboarding",
  PENDING_REVIEW: "Pending Review",
  CHANGES_REQUESTED: "Changes Requested",
  APPROVED: "Active",
  SUSPENDED: "Suspended",
};

/**
 * Doc-health chip rendered in admin vendor list rows. Red (expired)
 * wins over amber (expiring within 30d) when both apply, since
 * expired docs are more urgent and stacking chips clutters the row.
 * Tooltip lists the actual doc types so admin can see what's
 * affected without drilling in. MOU is included alongside other
 * docs — and an expired MOU additionally triggers auto-suspension
 * via lib/cron.ts.
 */
function DocHealthChip({
  docHealth,
}: {
  docHealth?: {
    expiredCount: number;
    expiringSoonCount: number;
    expiredTypes: string[];
    expiringSoonTypes: string[];
  };
}) {
  if (!docHealth) return null;
  const { expiredCount, expiringSoonCount, expiredTypes, expiringSoonTypes } =
    docHealth;
  if (expiredCount === 0 && expiringSoonCount === 0) return null;
  if (expiredCount > 0) {
    const tooltip =
      expiredTypes.length > 0
        ? `Expired: ${expiredTypes.join(", ")}${
            expiringSoonCount > 0
              ? ` · Expiring: ${expiringSoonTypes.join(", ")}`
              : ""
          }`
        : "Expired documents";
    return (
      <span
        title={tooltip}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/15 text-red-400 border border-red-500/30 whitespace-nowrap"
      >
        <AlertCircle className="w-3 h-3" />
        {expiredCount} expired
      </span>
    );
  }
  return (
    <span
      title={`Expiring soon: ${expiringSoonTypes.join(", ")}`}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30 whitespace-nowrap"
    >
      <Clock className="w-3 h-3" />
      {expiringSoonCount} expiring
    </span>
  );
}

// Map of admin-side field keys to display labels
const DRIVER_FIELD_LABELS: Record<string, string> = {
  photo: "Driver Photo",
  nationalId: "National ID",
  iqama: "Iqama",
  licenseNumber: "License Number",
  licenseDocument: "Driving License",
  phone: "Phone Number",
  firstName: "First Name",
  lastName: "Last Name",
};

const VEHICLE_FIELD_LABELS: Record<string, string> = {
  vehiclePhotos: "Vehicle Photos",
  numberPlates: "Number Plates",
  odometer: "Odometer Reading",
  insurance: "Vehicle Insurance",
  istimara: "Istimara (Registration)",
  make: "Make",
  model: "Model",
  year: "Year",
  plateNumber: "Plate Number",
  color: "Color",
  category: "Category",
  mileage: "Mileage",
};

// Days until a given date — negative means past. Used by ExpiryChip below
// and inline in the vendor profile change-request banner.
function daysUntilDate(d: string | Date | null | undefined): number | null {
  if (!d) return null;
  const ts = new Date(d).getTime();
  return Math.ceil((ts - Date.now()) / (1000 * 60 * 60 * 24));
}

// Compact urgency chip shown next to a document's expiry date in the admin
// review banner. Colour-coded by days remaining:
//   expired → red,  <=14d → orange,  <=30d → amber,  else hidden.
// Renders nothing when the doc has no expiry or is comfortably in the future.
function ExpiryChip({ expiryDate }: { expiryDate: string | Date | null }) {
  const days = daysUntilDate(expiryDate);
  if (days === null) return null;
  if (days > 30) return null; // only surface when actually relevant

  let chipClass: string;
  let chipText: string;
  if (days < 0) {
    chipClass = "bg-red-500/20 text-red-300 border-red-500/40";
    chipText = `Expired ${Math.abs(days)}d ago`;
  } else if (days === 0) {
    chipClass = "bg-red-500/20 text-red-300 border-red-500/40";
    chipText = "Expires today";
  } else if (days <= 14) {
    chipClass = "bg-orange-500/15 text-orange-300 border-orange-500/30";
    chipText = `${days}d left`;
  } else {
    chipClass = "bg-amber-500/15 text-amber-300 border-amber-500/30";
    chipText = `${days}d left`;
  }
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border ${chipClass}`}
    >
      <Clock className="w-2.5 h-2.5" />
      {chipText}
    </span>
  );
}

// Vendor-profile field labels + groups — mirrors the partner-side FIELD_LABELS
// map. Keys must match VENDOR_EDITABLE_FIELDS in vendor/profile.controller.ts.
const VENDOR_PROFILE_FIELD_LABELS: Record<
  string,
  { label: string; group: string }
> = {
  companyName: { label: "Company Name", group: "Profile" },
  crNumber: { label: "CR Number", group: "Profile" },
  vatNumber: { label: "VAT Number", group: "Profile" },
  contactPerson: { label: "Contact Person", group: "Profile" },
  contactPhone: { label: "Contact Phone", group: "Profile" },
  address: { label: "Address", group: "Profile" },
  logo: { label: "Company Logo", group: "Profile" },
  bankName: { label: "Bank Name", group: "Bank" },
  bankAccountName: { label: "Account Name", group: "Bank" },
  bankIban: { label: "IBAN", group: "Bank" },
  CR: { label: "Commercial Registration", group: "Documents" },
  VAT: { label: "VAT Certificate", group: "Documents" },
  CHAMBER_OF_COMMERCE: { label: "Chamber of Commerce", group: "Documents" },
  BALADY: { label: "Balady License", group: "Documents" },
  NATIONAL_ADDRESS: { label: "National Address", group: "Documents" },
  IBAN_LETTER: { label: "IBAN Letter", group: "Documents" },
  mou: { label: "MOU Document", group: "MOU" },
  mouExpiry: { label: "MOU Expiry Date", group: "MOU" },
};

// ============== PDF THUMBNAIL ==============
// (ThumbnailImage was previously defined here; it has been replaced
// by `<ProfileImage fill ... />` from components/ui/profile-image.tsx
// to consolidate the platform's image loaders into a single shared
// component with consistent shimmer/error visuals.)

function PdfThumbnail({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
      <FileText className="w-8 h-8 text-gray-500" />
      <span className="absolute bottom-1 right-1 px-1 py-0.5 bg-black/70 rounded text-[9px] text-gray-300">
        PDF
      </span>
    </div>
  );
}

// ============== HELPERS ==============

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isPdf(
  url: string | null | undefined,
  fileName?: string | null,
): boolean {
  if (fileName) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".pdf")) return true;
    if (lower.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)$/)) return false;
  }
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes(".pdf?") || lowerUrl.endsWith(".pdf")) return true;
  if (
    lowerUrl.includes("content-type=application%2fpdf") ||
    lowerUrl.includes("response-content-type=application%2fpdf")
  )
    return true;
  return false;
}

// Group fields by section for change-request badges
const VEHICLE_FIELD_GROUPS: Record<string, string> = {
  make: "Info",
  model: "Info",
  year: "Info",
  plateNumber: "Info",
  color: "Info",
  category: "Info",
  mileage: "Info",
  vehiclePhotos: "Photos",
  numberPlates: "Photos",
  odometer: "Photos",
  insurance: "Documents",
  istimara: "Documents",
};
const DRIVER_FIELD_GROUPS: Record<string, string> = {
  firstName: "Info",
  lastName: "Info",
  phone: "Info",
  licenseNumber: "Info",
  photo: "Photos",
  nationalId: "Documents",
  iqama: "Documents",
  licenseDocument: "Documents",
};
const GROUP_COLORS: Record<string, string> = {
  Info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Photos: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Documents: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Profile: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Bank: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  MOU: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};
// ============== MAIN COMPONENT ==============

export default function VendorManagementPanel({
  initialOpenVendorId,
  onInitialOpenConsumed,
}: {
  // When the admin clicks an expired/expiring-doc row in the
  // overview banner, the parent passes that vendor's id here.
  // We open the detail drawer once on mount, then signal the
  // parent to clear the id so subsequent navigations don't
  // re-open the same row. See app/dashboard/admin/page.tsx.
  initialOpenVendorId?: string | null;
  onInitialOpenConsumed?: () => void;
} = {}) {
  const { showNotification } = useNotification();

  // ---- Summary / list state ----
  const [summary, setSummary] = useState({
    total: 0,
    active: 0,
    pending: 0,
    vehicles: 0,
    drivers: 0,
    bankRequests: 0,
  });
  const [notifications, setNotifications] = useState({
    pendingReview: 0,
    pendingBankRequests: 0,
    pendingDriverReviews: 0,
    pendingVehicleReviews: 0,
    pendingDriverChangeRequests: 0,
    pendingVehicleChangeRequests: 0,
    pendingVendorProfileChangeRequests: 0,
    total: 0,
  });
  const [vendors, setVendors] = useState<any[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // ---- Vendor detail panel ----
  const [selectedVendor, setSelectedVendor] = useState<any>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<
    "overview" | "drivers" | "vehicles"
  >("overview");

  // ---- Drivers list inside vendor panel ----
  const [drivers, setDrivers] = useState<any[]>([]);
  const [driversPag, setDriversPag] = useState({
    page: 1,
    limit: 5,
    total: 0,
    totalPages: 0,
  });
  const [isLoadingDrivers, setIsLoadingDrivers] = useState(false);
  // "active" (default) — only non-deleted drivers.
  // "deleted" — only soft-deleted drivers.
  // "all" — both, distinguishable by the Deleted badge on each row.
  // The default mirrors what the vendor sees in their own portal so an
  // admin viewing a vendor's drivers list isn't confused by phantom rows
  // that the vendor no longer has access to. Switching to "deleted" or
  // "all" surfaces the audit history.
  const [driversActiveStatus, setDriversActiveStatus] = useState<
    "active" | "deleted" | "all"
  >("active");

  // ---- Vehicles list inside vendor panel ----
  //
  // No activeStatus filter for vehicles: vehicle deletion is a hard
  // delete on the backend, and isActive=false means "suspended" /
  // "maintenance" / "deactivated" — operational states the admin still
  // wants to see (and act on) in the main list. Drivers DO have the
  // filter because driver delete is a true soft-delete.
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [vehiclesPag, setVehiclesPag] = useState({
    page: 1,
    limit: 5,
    total: 0,
    totalPages: 0,
  });
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(false);

  // ---- Driver detail modal ----
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [isLoadingDriverDetail, setIsLoadingDriverDetail] = useState(false);

  // ---- Vehicle detail modal ----
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [isLoadingVehicleDetail, setIsLoadingVehicleDetail] = useState(false);

  // ---- Onboard ----
  const [showOnboardModal, setShowOnboardModal] = useState(false);
  const [onboardForm, setOnboardForm] = useState({
    companyName: "",
    email: "",
  });
  const [isOnboarding, setIsOnboarding] = useState(false);

  // ---- Bank Requests ----
  const [showBankRequests, setShowBankRequests] = useState(false);
  const [bankRequests, setBankRequests] = useState<any[]>([]);
  const [isLoadingBankReqs, setIsLoadingBankReqs] = useState(false);

  // ---- Vendor profile review modal ----
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [pendingReviews, setPendingReviews] = useState<any[]>([]);
  const [reviewProfile, setReviewProfile] = useState<any>(null);
  const [isLoadingReview, setIsLoadingReview] = useState(false);

  // ---- Driver/Vehicle/Vendor-profile change request banners ----
  const [driverChangeRequests, setDriverChangeRequests] = useState<any[]>([]);
  const [vehicleChangeRequests, setVehicleChangeRequests] = useState<any[]>([]);
  const [vendorProfileChangeRequests, setVendorProfileChangeRequests] =
    useState<any[]>([]);

  // Vendors with drivers/vehicles awaiting initial approval (banner data)
  const [pendingFleetVendors, setPendingFleetVendors] = useState<
    Array<{
      id: string;
      companyName: string;
      pendingDrivers: number;
      pendingVehicles: number;
    }>
  >([]);

  // ---- Reject change request modal (shared by driver + vehicle + vendor-profile) ----
  const [showRejectCrModal, setShowRejectCrModal] = useState<{
    id: string;
    kind: "driver" | "vehicle" | "vendor-profile";
    name: string;
  } | null>(null);
  const [rejectCrNote, setRejectCrNote] = useState("");

  // ---- Field-level reject in driver/vehicle review (inline) ----
  const [rejectingField, setRejectingField] = useState<string | null>(null);
  const [rejectFieldComment, setRejectFieldComment] = useState("");

  // ---- Add comment composer for driver/vehicle modal ----
  const [driverReviewComment, setDriverReviewComment] = useState({
    fieldName: "",
    comment: "",
  });
  const [vehicleReviewComment, setVehicleReviewComment] = useState({
    fieldName: "",
    comment: "",
  });

  // ---- Document viewer overlay (legacy inline overlay for fleet thumbnails) ----
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerItems, setViewerItems] = useState<
    Array<{
      label: string;
      url: string | null;
      type: "photo" | "document";
      fileName?: string | null;
    }>
  >([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerTitle, setViewerTitle] = useState("");

  // ---- DocumentViewer (shared component) for the profile review modal ----
  const [viewerDoc, setViewerDoc] = useState<{
    url: string;
    title: string;
  } | null>(null);

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ============ FETCHES ============

  const fetchSummary = useCallback(async () => {
    try {
      const [summaryRes, notifRes] = await Promise.all([
        adminApi.getVendorSummary(),
        adminApi.getVendorNotifications(),
      ]);
      if (summaryRes.success && summaryRes.data?.cards) {
        setSummary({
          total: summaryRes.data.cards.totalVendors,
          active: summaryRes.data.cards.activeVendors,
          pending: summaryRes.data.cards.pendingApproval,
          vehicles: summaryRes.data.cards.fleet?.totalVehicles || 0,
          drivers: summaryRes.data.cards.fleet?.totalDrivers || 0,
          bankRequests: summaryRes.data.notifications?.pendingBankRequests || 0,
        });
      }
      if (notifRes.success && notifRes.data) {
        setNotifications({
          pendingReview: notifRes.data.pendingReview || 0,
          pendingBankRequests: notifRes.data.pendingBankRequests || 0,
          pendingDriverReviews: notifRes.data.pendingDriverReviews || 0,
          pendingVehicleReviews: notifRes.data.pendingVehicleReviews || 0,
          pendingDriverChangeRequests:
            notifRes.data.pendingDriverChangeRequests || 0,
          pendingVehicleChangeRequests:
            notifRes.data.pendingVehicleChangeRequests || 0,
          pendingVendorProfileChangeRequests:
            notifRes.data.pendingVendorProfileChangeRequests || 0,
          total: notifRes.data.total || 0,
        });
      }
    } catch {
      /* silent */
    }
  }, []);

  const fetchVendors = useCallback(
    async (page = 1, search = "", status = "all") => {
      setIsLoading(true);
      try {
        const params: any = { page, limit: 10 };
        if (search) params.search = search;
        if (status !== "all") params.status = status;
        const res = await adminApi.getVendors(params);
        if (res.success && res.data) {
          setVendors(res.data.vendors || []);
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
        showNotification("error", err.message || "Failed to load");
      } finally {
        setIsLoading(false);
      }
    },
    [showNotification],
  );

  const fetchDriverChangeRequests = useCallback(async () => {
    try {
      const res = await adminApi.getDriverChangeRequests();
      if (res.success && res.data)
        setDriverChangeRequests(res.data.requests || []);
    } catch {
      /* silent */
    }
  }, []);

  const fetchVehicleChangeRequests = useCallback(async () => {
    try {
      const res = await adminApi.getVehicleChangeRequests();
      if (res.success && res.data)
        setVehicleChangeRequests(res.data.requests || []);
    } catch {
      /* silent */
    }
  }, []);

  // Vendor-profile change requests (vendor asking admin for permission to edit
  // profile fields/docs). Mirrors fetchDriverChangeRequests pattern.
  const fetchVendorProfileChangeRequests = useCallback(async () => {
    try {
      const res = await adminApi.getVendorProfileChangeRequests();
      if (res.success && res.data)
        setVendorProfileChangeRequests(res.data.requests || []);
    } catch {
      /* silent */
    }
  }, []);

  const fetchPendingFleetVendors = useCallback(async () => {
    try {
      const res = await adminApi.getVendorsWithPendingFleetReviews();
      if (res.success && res.data)
        setPendingFleetVendors(res.data.vendors || []);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    fetchVendors(1);
    fetchDriverChangeRequests();
    fetchVehicleChangeRequests();
    fetchVendorProfileChangeRequests();
    fetchPendingFleetVendors();
  }, [
    fetchSummary,
    fetchVendors,
    fetchDriverChangeRequests,
    fetchVehicleChangeRequests,
    fetchVendorProfileChangeRequests,
    fetchPendingFleetVendors,
  ]);

  useEffect(() => {
    const t = setTimeout(() => fetchVendors(1, searchQuery, statusFilter), 400);
    return () => clearTimeout(t);
  }, [searchQuery, statusFilter]); // eslint-disable-line

  // ============ VENDOR DETAIL ============

  const handleViewVendor = async (id: string) => {
    setIsLoadingDetail(true);
    setDetailTab("overview");
    setSelectedDriver(null);
    setSelectedVehicle(null);
    try {
      const res = await adminApi.getVendor(id);
      if (res.success && res.data) setSelectedVendor(res.data);
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load vendor details");
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const fetchDrivers = async (vendorId: string, page = 1) => {
    setIsLoadingDrivers(true);
    try {
      const res = await adminApi.getVendorDrivers(vendorId, {
        page,
        limit: 5,
        activeStatus: driversActiveStatus,
      });
      if (res.success && res.data) {
        setDrivers(res.data.drivers || []);
        setDriversPag(
          res.data.pagination || { page: 1, limit: 5, total: 0, totalPages: 0 },
        );
      }
    } catch {
      /* */
    } finally {
      setIsLoadingDrivers(false);
    }
  };

  const fetchVehicles = async (vendorId: string, page = 1) => {
    setIsLoadingVehicles(true);
    try {
      const res = await adminApi.getVendorVehicles(vendorId, {
        page,
        limit: 5,
      });
      if (res.success && res.data) {
        setVehicles(res.data.vehicles || []);
        setVehiclesPag(
          res.data.pagination || { page: 1, limit: 5, total: 0, totalPages: 0 },
        );
      }
    } catch {
      /* */
    } finally {
      setIsLoadingVehicles(false);
    }
  };

  const fetchDriverDetail = async (vendorId: string, driverId: string) => {
    setIsLoadingDriverDetail(true);
    try {
      const res = await adminApi.getVendorDriverDetail(vendorId, driverId);
      if (res.success && res.data) setSelectedDriver(res.data);
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setIsLoadingDriverDetail(false);
    }
  };

  const fetchVehicleDetail = async (vendorId: string, vehicleId: string) => {
    setIsLoadingVehicleDetail(true);
    try {
      const res = await adminApi.getVendorVehicleDetail(vendorId, vehicleId);
      if (res.success && res.data) setSelectedVehicle(res.data);
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setIsLoadingVehicleDetail(false);
    }
  };

  // ============== DEEP-LINK CONSUMPTION ==============
  // When the admin clicked a vendor row from the overview banner,
  // open that vendor's detail drawer once on mount. The ref guard
  // ensures we don't re-fire if the parent re-renders before
  // clearing its pending state.
  const deepLinkConsumedRef = useRef(false);
  useEffect(() => {
    if (initialOpenVendorId && !deepLinkConsumedRef.current) {
      deepLinkConsumedRef.current = true;
      handleViewVendor(initialOpenVendorId);
      onInitialOpenConsumed?.();
    }
    // handleViewVendor is stable in practice (defined inside the
    // component but only references state setters and api calls).
    // Including it would re-fire if other state changes triggered
    // a recreation, which is exactly what the ref guard prevents
    // anyway — so leaving it out keeps the effect clean.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenVendorId]);

  useEffect(() => {
    if (!selectedVendor) return;
    if (detailTab === "drivers") fetchDrivers(selectedVendor.id);
    if (detailTab === "vehicles") fetchVehicles(selectedVendor.id);
    // driversActiveStatus is here so changing the Active/Deleted/All
    // filter re-fetches. Vehicles have no equivalent filter.
  }, [detailTab, selectedVendor?.id, driversActiveStatus]); // eslint-disable-line

  // ============ CHANGE REQUEST HANDLERS (DRIVER & VEHICLE & VENDOR-PROFILE) ============

  const handleApproveDriverCR = async (req: any) => {
    setActionLoading(req.id);
    try {
      const res = await adminApi.approveDriverChangeRequest(req.id, {
        adminNote: "Approved — please update the requested fields and resubmit",
      });
      if (res.success) {
        showNotification("success", res.message || "Change request approved");
        fetchDriverChangeRequests();
        fetchSummary();
        await handleViewVendor(req.vendor.id);
        setDetailTab("drivers");
        setTimeout(() => fetchDriverDetail(req.vendor.id, req.driverId), 300);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to approve");
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveVehicleCR = async (req: any) => {
    setActionLoading(req.id);
    try {
      const res = await adminApi.approveVehicleChangeRequest(req.id, {
        adminNote: "Approved — please update the requested fields and resubmit",
      });
      if (res.success) {
        showNotification("success", res.message || "Change request approved");
        fetchVehicleChangeRequests();
        fetchSummary();
        await handleViewVendor(req.vendor.id);
        setDetailTab("vehicles");
        setTimeout(() => fetchVehicleDetail(req.vendor.id, req.vehicleId), 300);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to approve");
    } finally {
      setActionLoading(null);
    }
  };

  // Vendor-profile change request approval. Mirrors driver/vehicle pattern:
  // backend flips vendor to CHANGES_REQUESTED and unlocks the requested fields,
  // we refresh banner + summary, then open the vendor detail panel so admin can
  // see the now-editable profile.
  const handleApproveVendorProfileCR = async (req: any) => {
    setActionLoading(req.id);
    try {
      const res = await adminApi.approveVendorProfileChangeRequest(req.id, {
        adminNote: "Approved — please update the requested fields and resubmit",
      });
      if (res.success) {
        showNotification("success", res.message || "Change request approved");
        fetchVendorProfileChangeRequests();
        fetchSummary();
        await handleViewVendor(req.vendor.id);
        setDetailTab("overview");
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to approve");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectChangeRequest = async () => {
    if (!showRejectCrModal) return;
    if (!rejectCrNote.trim()) {
      showNotification("error", "Please provide a reason for rejection");
      return;
    }
    setActionLoading(showRejectCrModal.id);
    try {
      // Dispatch to the right endpoint based on kind. All three reject endpoints
      // have the same shape — { adminNote: string } — so this stays tidy.
      const res =
        showRejectCrModal.kind === "driver"
          ? await adminApi.rejectDriverChangeRequest(showRejectCrModal.id, {
              adminNote: rejectCrNote.trim(),
            })
          : showRejectCrModal.kind === "vehicle"
            ? await adminApi.rejectVehicleChangeRequest(showRejectCrModal.id, {
                adminNote: rejectCrNote.trim(),
              })
            : await adminApi.rejectVendorProfileChangeRequest(
                showRejectCrModal.id,
                { adminNote: rejectCrNote.trim() },
              );
      if (res.success) {
        showNotification("info", res.message || "Change request rejected");
        const kind = showRejectCrModal.kind;
        setShowRejectCrModal(null);
        setRejectCrNote("");
        if (kind === "driver") fetchDriverChangeRequests();
        else if (kind === "vehicle") fetchVehicleChangeRequests();
        else fetchVendorProfileChangeRequests();
        fetchSummary();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to reject");
    } finally {
      setActionLoading(null);
    }
  };

  // ============ DRIVER/VEHICLE FIELD-LEVEL COMMENTS ============

  const handleAddDriverComment = async () => {
    if (!selectedDriver || !selectedVendor) return;
    if (!driverReviewComment.fieldName || !driverReviewComment.comment) return;
    try {
      const res = await adminApi.addDriverReviewComment(
        selectedVendor.id,
        selectedDriver.id,
        driverReviewComment,
      );
      if (res.success) {
        showNotification("success", "Comment added");
        setDriverReviewComment({ fieldName: "", comment: "" });
        fetchDriverDetail(selectedVendor.id, selectedDriver.id);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    }
  };

  const handleAddVehicleComment = async () => {
    if (!selectedVehicle || !selectedVendor) return;
    if (!vehicleReviewComment.fieldName || !vehicleReviewComment.comment)
      return;
    try {
      const res = await adminApi.addVehicleReviewComment(
        selectedVendor.id,
        selectedVehicle.id,
        vehicleReviewComment,
      );
      if (res.success) {
        showNotification("success", "Comment added");
        setVehicleReviewComment({ fieldName: "", comment: "" });
        fetchVehicleDetail(selectedVendor.id, selectedVehicle.id);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    }
  };

  const handleResolveDriverComment = async (commentId: string) => {
    if (!selectedDriver || !selectedVendor) return;
    setActionLoading(commentId);
    try {
      await adminApi.resolveDriverReviewComment(
        selectedVendor.id,
        selectedDriver.id,
        commentId,
      );
      showNotification("success", "Comment resolved");
      fetchDriverDetail(selectedVendor.id, selectedDriver.id);
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolveVehicleComment = async (commentId: string) => {
    if (!selectedVehicle || !selectedVendor) return;
    setActionLoading(commentId);
    try {
      await adminApi.resolveVehicleReviewComment(
        selectedVendor.id,
        selectedVehicle.id,
        commentId,
      );
      showNotification("success", "Comment resolved");
      fetchVehicleDetail(selectedVendor.id, selectedVehicle.id);
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectField = async (
    kind: "driver" | "vehicle",
    fieldName: string,
    existingCommentIds: string[],
  ) => {
    if (!rejectFieldComment.trim()) {
      showNotification("error", "Please provide a reason");
      return;
    }
    if (kind === "driver" && (!selectedDriver || !selectedVendor)) return;
    if (kind === "vehicle" && (!selectedVehicle || !selectedVendor)) return;

    setActionLoading("reject-" + fieldName);
    try {
      if (kind === "driver") {
        for (const cid of existingCommentIds) {
          await adminApi.resolveDriverReviewComment(
            selectedVendor!.id,
            selectedDriver.id,
            cid,
          );
        }
        await adminApi.addDriverReviewComment(
          selectedVendor!.id,
          selectedDriver.id,
          {
            fieldName,
            comment: `❌ Rejected: ${rejectFieldComment.trim()}`,
          },
        );
      } else {
        for (const cid of existingCommentIds) {
          await adminApi.resolveVehicleReviewComment(
            selectedVendor!.id,
            selectedVehicle.id,
            cid,
          );
        }
        await adminApi.addVehicleReviewComment(
          selectedVendor!.id,
          selectedVehicle.id,
          {
            fieldName,
            comment: `❌ Rejected: ${rejectFieldComment.trim()}`,
          },
        );
      }

      showNotification("info", "Field rejected — vendor will be notified");
      setRejectingField(null);
      setRejectFieldComment("");

      if (kind === "driver")
        fetchDriverDetail(selectedVendor!.id, selectedDriver.id);
      else fetchVehicleDetail(selectedVendor!.id, selectedVehicle.id);
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  // ============ ACTIONS (existing) ============

  const handleOnboard = async () => {
    if (!onboardForm.companyName || !onboardForm.email) return;
    setIsOnboarding(true);
    try {
      const res = await adminApi.onboardVendor(onboardForm);
      if (res.success) {
        showNotification("success", res.message || "Vendor onboarded");
        setShowOnboardModal(false);
        setOnboardForm({ companyName: "", email: "" });
        fetchVendors(pagination.page, searchQuery, statusFilter);
        fetchSummary();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setIsOnboarding(false);
    }
  };

  const handleSuspend = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await adminApi.suspendVendor(id, { reason: "Admin action" });
      if (res.success) {
        showNotification("info", "Vendor suspended");
        setSelectedVendor(null);
        fetchVendors(pagination.page, searchQuery, statusFilter);
        fetchSummary();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await adminApi.reactivateVendor(id);
      if (res.success) {
        showNotification("success", "Vendor reactivated");
        setSelectedVendor(null);
        fetchVendors(pagination.page, searchQuery, statusFilter);
        fetchSummary();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResend = async (id: string) => {
    setActionLoading(id);
    try {
      await adminApi.resendVendorInvitation(id);
      showNotification("success", "Invitation resent");
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveDriver = async (vendorId: string, driverId: string) => {
    setActionLoading(driverId);
    try {
      const res = await adminApi.approveVendorDriver(vendorId, driverId);
      if (res.success) {
        showNotification("success", "Driver approved");
        fetchDrivers(vendorId);
        fetchSummary();
        fetchPendingFleetVendors();
        setSelectedDriver(null);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolveAllDriverComments = async () => {
    if (!selectedDriver || !selectedVendor) return;
    setActionLoading("resolve-all-driver");
    try {
      const allUnresolved: { id: string }[] = [];
      Object.values(selectedDriver.comments || {}).forEach(
        (fieldComments: any) => {
          (fieldComments as any[])
            .filter((c) => !c.isResolved)
            .forEach((c) => allUnresolved.push(c));
        },
      );
      for (const c of allUnresolved) {
        await adminApi.resolveDriverReviewComment(
          selectedVendor.id,
          selectedDriver.id,
          c.id,
        );
      }
      showNotification(
        "success",
        `${allUnresolved.length} comment(s) resolved`,
      );
      fetchDriverDetail(selectedVendor.id, selectedDriver.id);
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequestDriverChanges = async () => {
    if (!selectedDriver || !selectedVendor) return;
    if ((selectedDriver.unresolvedCommentCount || 0) === 0) {
      showNotification(
        "error",
        "Please flag at least one field or document before requesting changes",
      );
      return;
    }
    const commentsObj: Record<string, any[]> = selectedDriver.comments || {};
    const itemSet = new Set<string>();
    const messageParts: string[] = [];
    Object.entries(commentsObj).forEach(
      ([fieldName, fieldComments]: [string, any]) => {
        // Only the admin's active rejections in THIS review session
        // count toward the new Request Changes. Stale "Change requested
        // by vendor: …" comments from prior approved vendor-initiated
        // change requests linger as unresolved until the next approve
        // cycle — including them here would dump every historical flag
        // back onto the vendor each time admin clicks Request Changes.
        const rejections = (fieldComments as any[]).filter(
          (c) => !c.isResolved && c.comment?.startsWith?.("❌ Rejected:"),
        );
        if (rejections.length === 0) return;
        itemSet.add(fieldName);
        rejections.forEach((c) =>
          messageParts.push(`${fieldName}: ${c.comment}`),
        );
      },
    );
    const fields = Array.from(itemSet);
    if (fields.length === 0) {
      showNotification(
        "error",
        "No rejected fields to send. Reject the fields you want changed first.",
      );
      return;
    }
    setActionLoading(selectedDriver.id);
    try {
      const res = await adminApi.requestDriverChanges(
        selectedVendor.id,
        selectedDriver.id,
        {
          fields,
          message: messageParts.join(" | "),
        },
      );
      if (res.success) {
        showNotification("info", "Changes requested from vendor");
        setSelectedDriver(null);
        fetchDrivers(selectedVendor.id);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveVehicle = async (vendorId: string, vehicleId: string) => {
    setActionLoading(vehicleId);
    try {
      const res = await adminApi.approveVendorVehicle(vendorId, vehicleId);
      if (res.success) {
        showNotification("success", "Vehicle approved");
        fetchVehicles(vendorId);
        fetchSummary();
        fetchPendingFleetVendors();
        setSelectedVehicle(null);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolveAllVehicleComments = async () => {
    if (!selectedVehicle || !selectedVendor) return;
    setActionLoading("resolve-all-vehicle");
    try {
      const allUnresolved: { id: string }[] = [];
      Object.values(selectedVehicle.comments || {}).forEach(
        (fieldComments: any) => {
          (fieldComments as any[])
            .filter((c) => !c.isResolved)
            .forEach((c) => allUnresolved.push(c));
        },
      );
      for (const c of allUnresolved) {
        await adminApi.resolveVehicleReviewComment(
          selectedVendor.id,
          selectedVehicle.id,
          c.id,
        );
      }
      showNotification(
        "success",
        `${allUnresolved.length} comment(s) resolved`,
      );
      fetchVehicleDetail(selectedVendor.id, selectedVehicle.id);
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequestVehicleChanges = async () => {
    if (!selectedVehicle || !selectedVendor) return;
    if ((selectedVehicle.unresolvedCommentCount || 0) === 0) {
      showNotification(
        "error",
        "Please flag at least one field or document before requesting changes",
      );
      return;
    }
    const commentsObj: Record<string, any[]> = selectedVehicle.comments || {};
    const itemSet = new Set<string>();
    const messageParts: string[] = [];
    Object.entries(commentsObj).forEach(
      ([fieldName, fieldComments]: [string, any]) => {
        // Only the admin's active rejections in THIS review session
        // count toward the new Request Changes. Stale "Change requested
        // by vendor: …" comments from prior approved vendor-initiated
        // change requests linger as unresolved until the next approve
        // cycle — including them here would dump every historical flag
        // back onto the vendor each time admin clicks Request Changes.
        const rejections = (fieldComments as any[]).filter(
          (c) => !c.isResolved && c.comment?.startsWith?.("❌ Rejected:"),
        );
        if (rejections.length === 0) return;
        itemSet.add(fieldName);
        rejections.forEach((c) =>
          messageParts.push(`${fieldName}: ${c.comment}`),
        );
      },
    );
    const documents = Array.from(itemSet);
    if (documents.length === 0) {
      showNotification(
        "error",
        "No rejected items to send. Reject the photos or docs you want changed first.",
      );
      return;
    }
    setActionLoading(selectedVehicle.id);
    try {
      const res = await adminApi.requestVehicleChanges(
        selectedVendor.id,
        selectedVehicle.id,
        {
          documents,
          message: messageParts.join(" | "),
        },
      );
      if (res.success) {
        showNotification("info", "Changes requested from vendor");
        setSelectedVehicle(null);
        fetchVehicles(selectedVendor.id);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  // Bank requests
  const handleOpenBankRequests = async () => {
    setShowBankRequests(true);
    setIsLoadingBankReqs(true);
    try {
      const res = await adminApi.getBankUpdateRequests({ status: "PENDING" });
      if (res.success) setBankRequests(res.data?.requests || []);
    } catch {
      /* */
    } finally {
      setIsLoadingBankReqs(false);
    }
  };
  const handleApproveBankReq = async (id: string) => {
    setActionLoading(id);
    try {
      await adminApi.approveBankUpdateRequest(id);
      showNotification("success", "Bank update approved");
      handleOpenBankRequests();
      fetchSummary();
      if (selectedVendor) handleViewVendor(selectedVendor.id);
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };
  const handleRejectBankReq = async (id: string) => {
    setActionLoading(id);
    try {
      await adminApi.rejectBankUpdateRequest(id, {
        adminNote: "Rejected by admin",
      });
      showNotification("info", "Rejected");
      handleOpenBankRequests();
      fetchSummary();
      if (selectedVendor) handleViewVendor(selectedVendor.id);
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  // Profile reviews (vendor itself)
  const handleOpenReviews = async () => {
    setShowReviewModal(true);
    setReviewProfile(null);
    setIsLoadingReview(true);
    try {
      const res = await adminApi.getVendorPendingReviews();
      if (res.success) setPendingReviews(res.data?.pending || []);
    } catch {
      /* */
    } finally {
      setIsLoadingReview(false);
    }
  };
  const handleOpenReviewProfile = async (id: string) => {
    setIsLoadingReview(true);
    try {
      const res = await adminApi.getVendorProfileForReview(id);
      if (res.success) setReviewProfile(res.data);
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setIsLoadingReview(false);
    }
  };
  const handleResolveVendorComment = async (
    commentId: string,
    vendorId: string,
  ) => {
    setActionLoading(commentId);
    try {
      await adminApi.resolveVendorReviewComment(vendorId, commentId);
      showNotification("success", "Comment resolved");
      handleOpenReviewProfile(vendorId);
    } catch (err: any) {
      showNotification("error", err.message || "Failed to resolve");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolveAllVendorComments = async (vendorId: string) => {
    if (!reviewProfile) return;
    setActionLoading("resolve-all");
    try {
      const allComments: { id: string }[] = [];
      Object.values(reviewProfile.comments).forEach((fieldComments: any) => {
        (fieldComments as any[])
          .filter((c) => !c.isResolved)
          .forEach((c) => allComments.push(c));
      });
      for (const c of allComments) {
        await adminApi.resolveVendorReviewComment(vendorId, c.id);
      }
      showNotification("success", `${allComments.length} comment(s) resolved`);
      handleOpenReviewProfile(vendorId);
    } catch (err: any) {
      showNotification("error", err.message || "Failed to resolve comments");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectVendorField = async (
    fieldName: string,
    vendorId: string,
  ) => {
    if (!rejectFieldComment.trim()) {
      showNotification("error", "Please provide a reason for rejection");
      return;
    }
    setActionLoading("reject-" + fieldName);
    try {
      const existing =
        reviewProfile?.comments[fieldName]?.filter((c: any) => !c.isResolved) ||
        [];
      for (const c of existing) {
        await adminApi.resolveVendorReviewComment(vendorId, c.id);
      }
      await adminApi.addVendorReviewComment(vendorId, {
        fieldName,
        comment: `❌ Rejected: ${rejectFieldComment.trim()}`,
      });
      showNotification("info", "Field rejected — vendor will be notified");
      setRejectingField(null);
      setRejectFieldComment("");
      handleOpenReviewProfile(vendorId);
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const getVendorApprovalBlockReasons = (profile: any): string[] => {
    const reasons: string[] = [];
    if (profile.unresolvedCommentCount > 0)
      reasons.push(`${profile.unresolvedCommentCount} unresolved comment(s)`);
    if (
      !profile.allDocumentsUploaded &&
      profile.missingDocuments &&
      profile.missingDocuments.length > 0
    )
      reasons.push(`${profile.missingDocuments.length} missing document(s)`);
    return reasons;
  };

  const handleApproveVendor = async (id: string) => {
    setActionLoading(id);
    try {
      await adminApi.approveVendor(id);
      showNotification("success", "Vendor approved");
      setReviewProfile(null);
      handleOpenReviews();
      fetchVendors(pagination.page, searchQuery, statusFilter);
      fetchSummary();
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };
  const handleRequestVendorChanges = async (id: string) => {
    setActionLoading(id);
    try {
      await adminApi.requestVendorChanges(id);
      showNotification("info", "Changes requested");
      setReviewProfile(null);
      handleOpenReviews();
      fetchVendors(pagination.page, searchQuery, statusFilter);
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const openViewer = (
    items: Array<{
      label: string;
      url: string | null;
      type: "photo" | "document";
      fileName?: string | null;
    }>,
    index: number,
    title: string,
  ) => {
    setViewerItems(items);
    setViewerIndex(index);
    setViewerTitle(title);
    setViewerOpen(true);
  };

  const computeFieldState = (
    fieldName: string,
    comments: Record<string, any[]>,
    snapshot: any,
    currentValue: any,
  ) => {
    const unresolved = (comments[fieldName] || []).filter(
      (c: any) => !c.isResolved,
    );
    const hasComments = unresolved.length > 0;
    const isRejected = unresolved.some((c: any) =>
      c.comment?.startsWith?.("❌ Rejected:"),
    );
    const prev = snapshot?.[fieldName];
    // Snapshot must be a real populated object with this specific field
    // present. Empty-object snapshot ({} — set by approveProfile flow)
    // and null snapshot (first-ever submission) both fall through here
    // and produce hasChanged=false, which is correct — no real previous
    // value to diff against.
    const snapshotIsPopulated =
      snapshot !== null &&
      snapshot !== undefined &&
      typeof snapshot === "object" &&
      Object.keys(snapshot).length > 0;
    const hasChanged =
      snapshotIsPopulated && prev !== undefined && prev !== currentValue;
    const isAddressed = isRejected && hasChanged;
    return {
      unresolved,
      hasComments,
      isRejected,
      isAddressed,
      hasChanged,
      prev,
      current: currentValue,
    };
  };

  // ============ RENDER ============

  return (
    <div className="space-y-6">
      {/* ============ HEADER ============ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-white">
            Vendor Management
          </h2>
          <p className="text-xs sm:text-sm text-gray-500">
            Manage vendor registrations, fleet, and drivers
          </p>
        </div>
        <button
          onClick={() => setShowOnboardModal(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-luxury-gold text-black font-semibold rounded-lg hover:bg-luxury-gold/90 w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" /> Add Vendor
        </button>
      </div>

      {/* ============ NOTIFICATION BADGES ============ */}
      {notifications.total > 0 && (
        <div className="flex flex-wrap gap-2 -mt-2">
          {notifications.pendingReview > 0 && (
            <button
              onClick={handleOpenReviews}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-500/10 text-purple-400 text-xs rounded-full border border-purple-500/20 hover:bg-purple-500/20"
            >
              <Users className="w-3 h-3" />
              {notifications.pendingReview} profile review
              {notifications.pendingReview > 1 ? "s" : ""}
            </button>
          )}
          {notifications.pendingBankRequests > 0 && (
            <button
              onClick={handleOpenBankRequests}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-500/10 text-orange-400 text-xs rounded-full border border-orange-500/20 hover:bg-orange-500/20"
            >
              <CreditCard className="w-3 h-3" />
              {notifications.pendingBankRequests} bank request
              {notifications.pendingBankRequests > 1 ? "s" : ""}
            </button>
          )}
          {notifications.pendingDriverChangeRequests > 0 && (
            <button
              onClick={() => {
                document
                  .getElementById("driver-cr-banner")
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 text-amber-400 text-xs rounded-full border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
            >
              <Edit2 className="w-3 h-3" />
              {notifications.pendingDriverChangeRequests} driver change request
              {notifications.pendingDriverChangeRequests > 1 ? "s" : ""}
            </button>
          )}
          {notifications.pendingVehicleChangeRequests > 0 && (
            <button
              onClick={() => {
                document
                  .getElementById("vehicle-cr-banner")
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 text-amber-400 text-xs rounded-full border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
            >
              <Edit2 className="w-3 h-3" />
              {notifications.pendingVehicleChangeRequests} vehicle change
              request
              {notifications.pendingVehicleChangeRequests > 1 ? "s" : ""}
            </button>
          )}
          {/* NEW: vendor-profile change request badge — mirrors driver/vehicle */}
          {notifications.pendingVendorProfileChangeRequests > 0 && (
            <button
              onClick={() => {
                document
                  .getElementById("vendor-profile-cr-banner")
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 text-amber-400 text-xs rounded-full border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
            >
              <Building2 className="w-3 h-3" />
              {notifications.pendingVendorProfileChangeRequests} vendor profile
              change request
              {notifications.pendingVendorProfileChangeRequests > 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      {/* ============ SUMMARY CARDS ============ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-luxury-gold/10 flex items-center justify-center">
              <Truck className="w-5 h-5 text-luxury-gold" />
            </div>
            <span className="text-sm text-gray-400">Total Vendors</span>
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
            <span className="text-sm text-gray-400">Pending Approval</span>
          </div>
          <p className="text-2xl font-bold text-yellow-400">
            {summary.pending}
          </p>
        </div>
        <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Car className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-sm text-gray-400">Total Fleet</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {summary.vehicles}{" "}
            <span className="text-sm font-normal text-gray-500">vehicles</span>{" "}
            / {summary.drivers}{" "}
            <span className="text-sm font-normal text-gray-500">drivers</span>
          </p>
        </div>
      </div>

      {/* ============ PENDING VENDOR REVIEW ALERT ============ */}
      {summary.pending > 0 && (
        <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-white font-medium">
                {summary.pending} vendor{summary.pending > 1 ? "s" : ""} pending
                review
              </p>
              <p className="text-sm text-purple-400/70">
                New vendors need profile review before activation
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

      {/* ============ DRIVER REVIEWS NEEDED BANNER ============ */}
      {(() => {
        const vendorsWithDrivers = pendingFleetVendors.filter(
          (v) => v.pendingDrivers > 0,
        );
        if (vendorsWithDrivers.length === 0) return null;
        const totalDrivers = vendorsWithDrivers.reduce(
          (sum, v) => sum + v.pendingDrivers,
          0,
        );
        return (
          <div
            id="driver-review-banner"
            className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl scroll-mt-20"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <User className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-white font-medium">
                  {totalDrivers} driver{totalDrivers > 1 ? "s" : ""} need
                  approval
                </p>
                <p className="text-sm text-blue-400/70">
                  Drivers awaiting initial review across{" "}
                  {vendorsWithDrivers.length} vendor
                  {vendorsWithDrivers.length > 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {vendorsWithDrivers.map((v) => (
                <button
                  key={v.id}
                  onClick={async () => {
                    await handleViewVendor(v.id);
                    setDetailTab("drivers");
                  }}
                  className="w-full flex items-center justify-between p-3 bg-neutral-900 border border-neutral-800 hover:border-blue-500/30 rounded-lg transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Truck className="w-4 h-4 text-luxury-gold flex-shrink-0" />
                    <p className="text-white text-sm font-medium truncate">
                      {v.companyName}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-xs rounded-full font-medium border border-blue-500/20">
                      {v.pendingDrivers} pending
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ============ VEHICLE REVIEWS NEEDED BANNER ============ */}
      {(() => {
        const vendorsWithVehicles = pendingFleetVendors.filter(
          (v) => v.pendingVehicles > 0,
        );
        if (vendorsWithVehicles.length === 0) return null;
        const totalVehicles = vendorsWithVehicles.reduce(
          (sum, v) => sum + v.pendingVehicles,
          0,
        );
        return (
          <div
            id="vehicle-review-banner"
            className="p-4 bg-green-500/5 border border-green-500/20 rounded-xl scroll-mt-20"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                <Car className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-white font-medium">
                  {totalVehicles} vehicle{totalVehicles > 1 ? "s" : ""} need
                  approval
                </p>
                <p className="text-sm text-green-400/70">
                  Vehicles awaiting initial review across{" "}
                  {vendorsWithVehicles.length} vendor
                  {vendorsWithVehicles.length > 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {vendorsWithVehicles.map((v) => (
                <button
                  key={v.id}
                  onClick={async () => {
                    await handleViewVendor(v.id);
                    setDetailTab("vehicles");
                  }}
                  className="w-full flex items-center justify-between p-3 bg-neutral-900 border border-neutral-800 hover:border-green-500/30 rounded-lg transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Truck className="w-4 h-4 text-luxury-gold flex-shrink-0" />
                    <p className="text-white text-sm font-medium truncate">
                      {v.companyName}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="px-2 py-0.5 bg-green-500/10 text-green-400 text-xs rounded-full font-medium border border-green-500/20">
                      {v.pendingVehicles} pending
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ============ VENDOR PROFILE CHANGE REQUESTS BANNER ============
          NEW: mirrors partner's "Profile Change Requests" panel.
          Vendor-initiated requests from APPROVED vendors asking for permission
          to edit their profile / re-upload documents. Admin can approve (flips
          vendor to CHANGES_REQUESTED + unlocks the requested fields) or reject
          (sends back with a note). */}
      {vendorProfileChangeRequests.length > 0 && (
        <div
          id="vendor-profile-cr-banner"
          className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl scroll-mt-20"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-white font-medium">
                  {vendorProfileChangeRequests.length} Vendor Profile Change
                  Request
                  {vendorProfileChangeRequests.length > 1 ? "s" : ""}
                </p>
                <p className="text-sm text-amber-400/70">
                  Approved vendors requesting permission to edit their profile
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {vendorProfileChangeRequests.map((req) => {
              // Group by section (Profile / Bank / Documents / MOU) using
              // VENDOR_PROFILE_FIELD_LABELS so the badges match partner UX.
              const grouped: Record<string, string[]> = {};
              (req.fields as string[]).forEach((field: string) => {
                const info = VENDOR_PROFILE_FIELD_LABELS[field];
                const group = info?.group || "Other";
                if (!grouped[group]) grouped[group] = [];
                grouped[group].push(field);
              });
              return (
                <div
                  key={req.id}
                  className="bg-neutral-900 border border-neutral-800 rounded-xl p-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-white font-medium">
                          {req.vendor.companyName}
                        </p>
                        {req.vendor.contactPerson && (
                          <>
                            <span className="text-xs text-gray-500">·</span>
                            <p className="text-xs text-gray-400">
                              {req.vendor.contactPerson}
                            </p>
                          </>
                        )}
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded-full font-medium">
                          {req.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mb-2">
                        Reason: {req.reason}
                      </p>
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
                                {VENDOR_PROFILE_FIELD_LABELS[field]?.label ||
                                  field}
                              </span>
                            ))}
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-600 mt-2">
                        Submitted: {formatDate(req.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleApproveVendorProfileCR(req)}
                        disabled={actionLoading === req.id}
                        className="px-3 py-2 bg-green-500/20 text-green-400 text-xs font-medium rounded-lg hover:bg-green-500/30 border border-green-500/30 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {actionLoading === req.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3" />
                        )}
                        Approve
                      </button>
                      <button
                        onClick={() =>
                          setShowRejectCrModal({
                            id: req.id,
                            kind: "vendor-profile",
                            name: req.vendor.companyName,
                          })
                        }
                        disabled={actionLoading === req.id}
                        className="px-3 py-2 bg-red-500/20 text-red-400 text-xs font-medium rounded-lg hover:bg-red-500/30 border border-red-500/30 transition-colors disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============ DRIVER CHANGE REQUESTS BANNER ============ */}
      {driverChangeRequests.length > 0 && (
        <div
          id="driver-cr-banner"
          className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl scroll-mt-20"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                <User className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-white font-medium">
                  {driverChangeRequests.length} Driver Change Request
                  {driverChangeRequests.length > 1 ? "s" : ""}
                </p>
                <p className="text-sm text-amber-400/70">
                  Approved vendors requesting to edit driver details
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {driverChangeRequests.map((req) => {
              const grouped: Record<string, string[]> = {};
              (req.fields as string[]).forEach((field: string) => {
                const group = DRIVER_FIELD_GROUPS[field] || "Other";
                if (!grouped[group]) grouped[group] = [];
                grouped[group].push(field);
              });
              return (
                <div
                  key={req.id}
                  className="bg-neutral-900 border border-neutral-800 rounded-xl p-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-white font-medium">
                          {req.driver.name}
                        </p>
                        <span className="text-xs text-gray-500">·</span>
                        <p className="text-xs text-gray-400">
                          {req.vendor.companyName}
                        </p>
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded-full font-medium">
                          {req.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mb-2">
                        Reason: {req.reason}
                      </p>
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
                                {DRIVER_FIELD_LABELS[field] || field}
                              </span>
                            ))}
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-600 mt-2">
                        Submitted: {formatDate(req.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleApproveDriverCR(req)}
                        disabled={actionLoading === req.id}
                        className="px-3 py-2 bg-green-500/20 text-green-400 text-xs font-medium rounded-lg hover:bg-green-500/30 border border-green-500/30 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {actionLoading === req.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3" />
                        )}
                        Approve
                      </button>
                      <button
                        onClick={() =>
                          setShowRejectCrModal({
                            id: req.id,
                            kind: "driver",
                            name: req.driver.name,
                          })
                        }
                        disabled={actionLoading === req.id}
                        className="px-3 py-2 bg-red-500/20 text-red-400 text-xs font-medium rounded-lg hover:bg-red-500/30 border border-red-500/30 transition-colors disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============ VEHICLE CHANGE REQUESTS BANNER ============ */}
      {vehicleChangeRequests.length > 0 && (
        <div
          id="vehicle-cr-banner"
          className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl scroll-mt-20"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                <Car className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-white font-medium">
                  {vehicleChangeRequests.length} Vehicle Change Request
                  {vehicleChangeRequests.length > 1 ? "s" : ""}
                </p>
                <p className="text-sm text-amber-400/70">
                  Approved vendors requesting to edit vehicle details
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {vehicleChangeRequests.map((req) => {
              const grouped: Record<string, string[]> = {};
              (req.fields as string[]).forEach((field: string) => {
                const group = VEHICLE_FIELD_GROUPS[field] || "Other";
                if (!grouped[group]) grouped[group] = [];
                grouped[group].push(field);
              });
              return (
                <div
                  key={req.id}
                  className="bg-neutral-900 border border-neutral-800 rounded-xl p-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-white font-medium">
                          {req.vehicle.name}
                        </p>
                        <span className="text-xs text-gray-400 font-mono">
                          {req.vehicle.plateNumber}
                        </span>
                        <span className="text-xs text-gray-500">·</span>
                        <p className="text-xs text-gray-400">
                          {req.vendor.companyName}
                        </p>
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded-full font-medium">
                          {req.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mb-2">
                        Reason: {req.reason}
                      </p>
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
                                {VEHICLE_FIELD_LABELS[field] || field}
                              </span>
                            ))}
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-600 mt-2">
                        Submitted: {formatDate(req.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleApproveVehicleCR(req)}
                        disabled={actionLoading === req.id}
                        className="px-3 py-2 bg-green-500/20 text-green-400 text-xs font-medium rounded-lg hover:bg-green-500/30 border border-green-500/30 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {actionLoading === req.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3" />
                        )}
                        Approve
                      </button>
                      <button
                        onClick={() =>
                          setShowRejectCrModal({
                            id: req.id,
                            kind: "vehicle",
                            name: `${req.vehicle.name} (${req.vehicle.plateNumber})`,
                          })
                        }
                        disabled={actionLoading === req.id}
                        className="px-3 py-2 bg-red-500/20 text-red-400 text-xs font-medium rounded-lg hover:bg-red-500/30 border border-red-500/30 transition-colors disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============ FILTERS ============ */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search company, CR, contact..."
            className="w-full pl-9 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-luxury-gold/50"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { key: "all", label: "All" },
            { key: "APPROVED", label: "Active" },
            { key: "PENDING_REVIEW", label: "Pending" },
            { key: "INVITED", label: "Invited" },
            { key: "ONBOARDING", label: "Onboarding" },
            { key: "CHANGES_REQUESTED", label: "Changes Req." },
            { key: "SUSPENDED", label: "Suspended" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                statusFilter === f.key
                  ? "bg-luxury-gold text-black font-semibold"
                  : "bg-neutral-800 text-gray-400 hover:text-white"
              }`}
            >
              {f.label}{" "}
              {f.key !== "all" && statusCounts[f.key]
                ? `(${statusCounts[f.key]})`
                : ""}
            </button>
          ))}
        </div>
      </div>

      {/* ============ VENDORS TABLE ============ */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
          </div>
        ) : vendors.length === 0 ? (
          <div className="text-center py-16">
            <Truck className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-white font-medium">No vendors found</p>
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
                      Fleet
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Earnings
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
                  {vendors.map((v) => {
                    const needsAttention =
                      v.status === "PENDING_REVIEW" ||
                      v.status === "CHANGES_REQUESTED" ||
                      (v.pendingDrivers && v.pendingDrivers > 0) ||
                      (v.pendingVehicles && v.pendingVehicles > 0) ||
                      v.hasPendingBankRequest;
                    return (
                      <tr
                        key={v.id}
                        className={`hover:bg-neutral-800/30 ${needsAttention ? "border-l-2 border-l-yellow-500" : ""}`}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <ProfileImage
                              src={(v as any).logoUrl}
                              alt={v.companyName || "Vendor logo"}
                              size="sm"
                              variant="vendor"
                              fallbackText={v.companyName}
                              fallbackIcon={
                                <Truck
                                  className={`w-5 h-5 ${needsAttention ? "text-yellow-400" : "text-luxury-gold"}`}
                                />
                              }
                            />
                            <div>
                              <p className="text-white font-medium">
                                {v.companyName}
                              </p>
                              <p className="text-xs text-gray-500">
                                CR: {v.crNumber || "—"}
                              </p>
                              {(v.pendingDrivers > 0 ||
                                v.pendingVehicles > 0 ||
                                v.hasPendingBankRequest ||
                                (v.docHealth &&
                                  (v.docHealth.expiredCount > 0 ||
                                    v.docHealth.expiringSoonCount > 0))) && (
                                <div className="flex gap-1 mt-1 flex-wrap">
                                  {v.pendingDrivers > 0 && (
                                    <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] rounded border border-blue-500/20">
                                      {v.pendingDrivers} driver
                                      {v.pendingDrivers > 1 ? "s" : ""}
                                    </span>
                                  )}
                                  {v.pendingVehicles > 0 && (
                                    <span className="px-1.5 py-0.5 bg-green-500/10 text-green-400 text-[10px] rounded border border-green-500/20">
                                      {v.pendingVehicles} vehicle
                                      {v.pendingVehicles > 1 ? "s" : ""}
                                    </span>
                                  )}
                                  {v.hasPendingBankRequest && (
                                    <span className="px-1.5 py-0.5 bg-orange-500/10 text-orange-400 text-[10px] rounded border border-orange-500/20">
                                      bank request
                                    </span>
                                  )}
                                  <DocHealthChip docHealth={v.docHealth} />
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-white text-sm">
                            {v.contactPerson || "—"}
                          </p>
                          <p className="text-xs text-gray-500">
                            {v.email || "—"}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-4">
                            <div className="text-center">
                              <p className="text-white font-semibold">
                                {v.fleet?.vehicles || 0}
                              </p>
                              <p className="text-xs text-gray-500">Vehicles</p>
                            </div>
                            <div className="text-center">
                              <p className="text-white font-semibold">
                                {v.fleet?.drivers || 0}
                              </p>
                              <p className="text-xs text-gray-500">Drivers</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-luxury-gold font-semibold">
                            SAR {Number(v.totalEarnings || 0).toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-500">
                            {v.totalBookings || 0} bookings
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusColors[v.status] || "bg-neutral-800 text-gray-400"}`}
                          >
                            {statusLabels[v.status] || v.status}
                          </span>
                          {v.rating && (
                            <p className="text-xs text-luxury-gold mt-1">
                              ★ {Number(v.rating).toFixed(1)}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleViewVendor(v.id)}
                              className="p-1.5 text-gray-400 hover:text-white hover:bg-neutral-700 rounded"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {v.status === "INVITED" && (
                              <button
                                onClick={() => handleResend(v.id)}
                                disabled={actionLoading === v.id}
                                className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded hover:bg-blue-500/30 disabled:opacity-50"
                              >
                                Resend
                              </button>
                            )}
                            {v.status === "PENDING_REVIEW" && (
                              <button
                                onClick={() => {
                                  handleOpenReviews();
                                  setTimeout(
                                    () => handleOpenReviewProfile(v.id),
                                    500,
                                  );
                                }}
                                className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded hover:bg-yellow-500/30"
                              >
                                Review
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile vendor cards */}
            <div className="md:hidden space-y-3 p-4">
              {vendors.map((v) => {
                const needsAttention =
                  v.status === "PENDING_REVIEW" ||
                  v.status === "CHANGES_REQUESTED" ||
                  (v.pendingDrivers && v.pendingDrivers > 0) ||
                  (v.pendingVehicles && v.pendingVehicles > 0) ||
                  v.hasPendingBankRequest;
                return (
                  <div
                    key={v.id}
                    onClick={() => handleViewVendor(v.id)}
                    className={`bg-neutral-800 rounded-xl p-4 cursor-pointer border transition-colors ${needsAttention ? "border-yellow-500/30 hover:border-yellow-500/50" : "border-neutral-700 hover:border-luxury-gold/50"}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <ProfileImage
                          src={(v as any).logoUrl}
                          alt={v.companyName || "Vendor logo"}
                          size="sm"
                          variant="vendor"
                          fallbackText={v.companyName}
                          fallbackIcon={
                            <Truck
                              className={`w-5 h-5 ${needsAttention ? "text-yellow-400" : "text-luxury-gold"}`}
                            />
                          }
                        />
                        <div className="min-w-0">
                          <p className="text-white font-medium text-sm truncate">
                            {v.companyName}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {v.contactPerson || v.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium border ${statusColors[v.status] || ""}`}
                        >
                          {statusLabels[v.status] || v.status}
                        </span>
                        <DocHealthChip docHealth={v.docHealth} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center py-3 border-t border-b border-neutral-700">
                      <div>
                        <p className="text-white font-semibold">
                          {v.fleet?.vehicles || 0}
                        </p>
                        <p className="text-[10px] text-gray-500">Vehicles</p>
                      </div>
                      <div>
                        <p className="text-white font-semibold">
                          {v.fleet?.drivers || 0}
                        </p>
                        <p className="text-[10px] text-gray-500">Drivers</p>
                      </div>
                      <div>
                        <p className="text-white font-semibold">
                          {v.totalBookings || 0}
                        </p>
                        <p className="text-[10px] text-gray-500">Bookings</p>
                      </div>
                    </div>
                  </div>
                );
              })}
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
                    fetchVendors(pagination.page - 1, searchQuery, statusFilter)
                  }
                  disabled={pagination.page === 1}
                  className="px-3 py-1.5 bg-neutral-800 text-white text-sm rounded-lg disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() =>
                    fetchVendors(pagination.page + 1, searchQuery, statusFilter)
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

      {/* ============ VENDOR DETAIL PANEL ============ */}
      {(selectedVendor || isLoadingDetail) &&
        !selectedDriver &&
        !selectedVehicle && (
          <>
            <div
              className="fixed inset-0 bg-black/60 z-40"
              onClick={() => setSelectedVendor(null)}
            />
            <div className="fixed inset-y-0 right-0 w-full sm:w-[560px] bg-neutral-900 border-l border-neutral-800 z-50 overflow-y-auto">
              {isLoadingDetail ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
                </div>
              ) : (
                selectedVendor && (
                  <div className="p-4 sm:p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Logo avatar — visual anchor for the
                            detail drawer. Cast because selectedVendor
                            is loosely typed (`any`) in this panel. */}
                        <ProfileImage
                          src={selectedVendor.logoUrl}
                          alt={selectedVendor.companyName || "Vendor logo"}
                          size="md"
                          variant="vendor"
                          fallbackText={selectedVendor.companyName}
                          fallbackIcon={
                            <Truck className="w-6 h-6 text-luxury-gold" />
                          }
                          priority
                        />
                        <div className="min-w-0">
                          <h2 className="text-xl font-bold text-white truncate">
                            {selectedVendor.companyName}
                          </h2>
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className={`px-2 py-0.5 text-xs rounded-full border ${statusColors[selectedVendor.status] || ""}`}
                            >
                              {statusLabels[selectedVendor.status] ||
                                selectedVendor.status}
                            </span>
                            {selectedVendor.rating && (
                              <span className="text-xs text-luxury-gold">
                                ★ {Number(selectedVendor.rating).toFixed(1)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedVendor(null)}
                        className="p-2 hover:bg-neutral-800 rounded-lg flex-shrink-0"
                      >
                        <X className="w-5 h-5 text-gray-400" />
                      </button>
                    </div>

                    {selectedVendor.mou?.expiryWarning?.isExpiring && (
                      <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                        <p className="text-sm text-yellow-400">
                          MOU{" "}
                          {selectedVendor.mou.expiryWarning.isExpired
                            ? "expired"
                            : `expiring in ${selectedVendor.mou.expiryWarning.daysLeft} days`}
                          {selectedVendor.mou.expiryDate &&
                            ` (${formatDate(selectedVendor.mou.expiryDate)})`}
                        </p>
                      </div>
                    )}

                    {/* Tabs */}
                    <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-6 px-6">
                      {(["overview", "drivers", "vehicles"] as const).map(
                        (tab) => (
                          <button
                            key={tab}
                            onClick={() => setDetailTab(tab)}
                            className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm capitalize whitespace-nowrap flex-shrink-0 ${
                              detailTab === tab
                                ? "bg-luxury-gold text-black font-semibold"
                                : "bg-neutral-800 text-gray-400 hover:text-white"
                            }`}
                          >
                            {tab}{" "}
                            {tab === "drivers"
                              ? `(${selectedVendor.fleet?.totalDrivers || 0})`
                              : tab === "vehicles"
                                ? `(${selectedVendor.fleet?.totalVehicles || 0})`
                                : ""}
                          </button>
                        ),
                      )}
                    </div>

                    {/* OVERVIEW */}
                    {detailTab === "overview" && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="bg-neutral-800 rounded-lg p-3">
                            <p className="text-xs text-gray-500">
                              Monthly Earnings
                            </p>
                            <p className="text-lg font-bold text-luxury-gold">
                              SAR{" "}
                              {Number(
                                selectedVendor.earnings?.total || 0,
                              ).toLocaleString()}
                            </p>
                          </div>
                          <div className="bg-neutral-800 rounded-lg p-3">
                            <p className="text-xs text-gray-500">
                              Completed Trips
                            </p>
                            <p className="text-lg font-bold text-white">
                              {selectedVendor.earnings?.completedTrips || 0}
                            </p>
                          </div>
                          <div className="bg-neutral-800 rounded-lg p-3">
                            <p className="text-xs text-gray-500">Fleet</p>
                            <p className="text-lg font-bold text-white">
                              {selectedVendor.fleet?.activeVehicles || 0}/
                              {selectedVendor.fleet?.totalVehicles || 0} veh ·{" "}
                              {selectedVendor.fleet?.activeDrivers || 0}/
                              {selectedVendor.fleet?.totalDrivers || 0} drv
                            </p>
                          </div>
                        </div>

                        <div className="bg-neutral-800 rounded-xl p-4">
                          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-luxury-gold" />{" "}
                            Company Info
                          </h3>
                          <div className="space-y-2 text-sm">
                            {[
                              [
                                "CR Number",
                                selectedVendor.companyInfo?.crNumber,
                              ],
                              ["VAT", selectedVendor.companyInfo?.vatNumber],
                              [
                                "Contact",
                                selectedVendor.companyInfo?.contactPerson,
                              ],
                              [
                                "Phone",
                                selectedVendor.companyInfo?.contactPhone,
                              ],
                              ["Email", selectedVendor.companyInfo?.email],
                              ["Address", selectedVendor.companyInfo?.address],
                            ].map(([k, v]) => (
                              <div
                                key={k as string}
                                className="flex justify-between"
                              >
                                <span className="text-gray-500">{k}</span>
                                <span className="text-white text-right max-w-[60%]">
                                  {(v as string) || "—"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* MOU card — always rendered so admin can
                            see at a glance whether the vendor has
                            uploaded one yet. Previously this was
                            gated on `mou?.fileUrl` which silently
                            hid the entire section when no MOU
                            existed, leaving admin unable to tell
                            "MOU is missing" from "MOU card is broken". */}
                        <div className="bg-neutral-800 rounded-xl p-4">
                          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-luxury-gold" />{" "}
                            MOU Document
                          </h3>
                          {selectedVendor.mou?.fileUrl ? (
                            <div className="flex items-center justify-between">
                              <div>
                                {selectedVendor.mou.expiryDate && (
                                  <p className="text-xs text-gray-500">
                                    Expires:{" "}
                                    {formatDate(selectedVendor.mou.expiryDate)}
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() =>
                                  openViewer(
                                    [
                                      {
                                        label: "MOU Document",
                                        url: selectedVendor.mou.fileUrl,
                                        type: "document",
                                      },
                                    ],
                                    0,
                                    "MOU Document",
                                  )
                                }
                                className="px-3 py-1.5 bg-neutral-700 text-gray-300 text-xs rounded hover:bg-neutral-600"
                              >
                                View
                              </button>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500">
                              Not uploaded yet — the vendor needs to upload
                              their signed MOU through the vendor portal.
                            </p>
                          )}
                        </div>

                        {/* Bank Details with pending request */}
                        <div className="bg-neutral-800 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                              <CreditCard className="w-4 h-4 text-luxury-gold" />{" "}
                              Bank Details
                            </h3>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Bank</span>
                              <span className="text-white">
                                {selectedVendor.bankDetails?.bankName || "—"}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">IBAN</span>
                              <span className="text-white font-mono text-xs">
                                {selectedVendor.bankDetails?.bankIban || "—"}
                              </span>
                            </div>
                          </div>
                          {selectedVendor.pendingBankRequest && (
                            <div className="mt-4 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                              <p className="text-sm text-orange-400 font-medium mb-2">
                                Pending Bank Change Request
                              </p>
                              <div className="grid grid-cols-2 gap-2 mb-3">
                                <div className="bg-neutral-900 rounded p-2">
                                  <p className="text-[10px] text-gray-500 mb-1">
                                    CURRENT
                                  </p>
                                  <p className="text-xs text-white">
                                    {selectedVendor.bankDetails?.bankName ||
                                      "—"}
                                  </p>
                                  <p className="text-[10px] text-gray-400 font-mono">
                                    {selectedVendor.bankDetails?.bankIban ||
                                      "—"}
                                  </p>
                                </div>
                                <div className="bg-neutral-900 rounded p-2 border border-orange-500/20">
                                  <p className="text-[10px] text-orange-400 mb-1">
                                    REQUESTED
                                  </p>
                                  <p className="text-xs text-white">
                                    {selectedVendor.pendingBankRequest
                                      .requestedBankName || "—"}
                                  </p>
                                  <p className="text-[10px] text-gray-400 font-mono">
                                    {selectedVendor.pendingBankRequest
                                      .requestedBankIban || "—"}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() =>
                                    handleApproveBankReq(
                                      selectedVendor.pendingBankRequest.id,
                                    )
                                  }
                                  disabled={
                                    actionLoading ===
                                    selectedVendor.pendingBankRequest.id
                                  }
                                  className="flex-1 py-1.5 bg-green-500 text-white text-xs font-semibold rounded hover:bg-green-400 disabled:opacity-50"
                                >
                                  Approve & Update
                                </button>
                                <button
                                  onClick={() =>
                                    handleRejectBankReq(
                                      selectedVendor.pendingBankRequest.id,
                                    )
                                  }
                                  disabled={
                                    actionLoading ===
                                    selectedVendor.pendingBankRequest.id
                                  }
                                  className="flex-1 py-1.5 bg-neutral-700 text-white text-xs rounded hover:bg-neutral-600 disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="space-y-3">
                          {selectedVendor.status === "APPROVED" && (
                            <button
                              onClick={() => handleSuspend(selectedVendor.id)}
                              disabled={actionLoading === selectedVendor.id}
                              className="w-full py-3 bg-red-500/20 text-red-400 font-medium rounded-lg hover:bg-red-500/30 border border-red-500/30 disabled:opacity-50"
                            >
                              Suspend Vendor
                            </button>
                          )}
                          {selectedVendor.status === "SUSPENDED" && (
                            <button
                              onClick={() =>
                                handleReactivate(selectedVendor.id)
                              }
                              disabled={actionLoading === selectedVendor.id}
                              className="w-full py-3 bg-green-500 text-white font-medium rounded-lg hover:bg-green-400 disabled:opacity-50"
                            >
                              Reactivate
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* DRIVERS TAB */}
                    {detailTab === "drivers" && (
                      <div className="space-y-3">
                        {/* Active/Deleted/All filter pills. Defaults to
                            Active so admin sees the same list the vendor
                            sees; can switch to Deleted or All for audit
                            history. Pill style matches the existing tab
                            buttons elsewhere in this panel for visual
                            consistency. */}
                        <div className="flex items-center gap-1.5 bg-neutral-800 rounded-lg p-1 w-fit">
                          {(["active", "deleted", "all"] as const).map(
                            (opt) => (
                              <button
                                key={opt}
                                onClick={() => setDriversActiveStatus(opt)}
                                className={`px-3 py-1 rounded-md text-xs capitalize transition-colors ${
                                  driversActiveStatus === opt
                                    ? "bg-luxury-gold text-black font-semibold"
                                    : "text-gray-400 hover:text-white"
                                }`}
                              >
                                {opt}
                              </button>
                            ),
                          )}
                        </div>

                        {isLoadingDrivers ? (
                          <div className="flex justify-center py-8">
                            <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
                          </div>
                        ) : drivers.length === 0 ? (
                          <p className="text-center py-8 text-gray-500">
                            {driversActiveStatus === "deleted"
                              ? "No deleted drivers"
                              : driversActiveStatus === "all"
                                ? "No drivers registered"
                                : "No active drivers"}
                          </p>
                        ) : (
                          drivers.map((d) => {
                            const validThumbs = (
                              Array.isArray(d.thumbnails) ? d.thumbnails : []
                            ).filter((t: any) => !!t.fileUrl);
                            const ds = d.documents || {};
                            const docPills: Array<{
                              label: string;
                              ok: boolean;
                            }> = [
                              { label: "Photo", ok: !!ds.hasProfilePhoto },
                              { label: "ID", ok: !!ds.hasIqamaOrNationalId },
                              { label: "License", ok: !!ds.hasDrivingLicense },
                            ];
                            return (
                              <div
                                key={d.id}
                                className="bg-neutral-800 rounded-lg p-4 border border-neutral-700 hover:border-luxury-gold/40 transition-colors cursor-pointer"
                                onClick={() =>
                                  fetchDriverDetail(selectedVendor.id, d.id)
                                }
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden bg-neutral-700 relative flex-shrink-0">
                                      {d.photoUrl ? (
                                        <ProfileImage
                                          fill
                                          src={d.photoUrl}
                                          alt={d.name}
                                          variant="document"
                                        />
                                      ) : (
                                        <User className="w-5 h-5 text-gray-400" />
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <p className="text-white text-sm font-medium truncate">
                                          {d.name}
                                        </p>
                                        {d.isActive === false && (
                                          <span className="px-1.5 py-0.5 bg-red-500/15 text-red-400 border border-red-500/30 text-[10px] rounded font-medium uppercase tracking-wide">
                                            Deleted
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs text-gray-500 truncate">
                                        {d.phone}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {d.unresolvedCommentCount > 0 && (
                                      <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded font-medium">
                                        <AlertTriangle className="w-2.5 h-2.5" />
                                        {d.unresolvedCommentCount}
                                      </span>
                                    )}
                                    <span
                                      className={`px-2 py-0.5 text-xs rounded-full border ${statusColors[d.status] || "bg-neutral-800 text-gray-400"}`}
                                    >
                                      {statusLabels[d.status] || d.status}
                                    </span>
                                  </div>
                                </div>
                                {validThumbs.length > 0 ? (
                                  <div className="flex gap-1.5 mb-2">
                                    {validThumbs
                                      .slice(0, 3)
                                      .map((t: any, i: number) => (
                                        <div
                                          key={i}
                                          className="relative w-16 h-12 bg-neutral-900 rounded overflow-hidden flex-shrink-0"
                                        >
                                          <ProfileImage
                                            fill
                                            src={t.fileUrl}
                                            alt={t.type}
                                            variant="document"
                                          />
                                        </div>
                                      ))}
                                    <div className="flex flex-col justify-center ml-1">
                                      <p className="text-[10px] text-gray-500 leading-tight">
                                        {ds.uploadedCount || 0}/
                                        {ds.requiredCount || 3} docs
                                      </p>
                                      <p className="text-[10px] text-luxury-gold leading-tight">
                                        Tap to review
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5 mb-2">
                                    {docPills.map((p) => (
                                      <span
                                        key={p.label}
                                        className={`px-2 py-0.5 text-[10px] rounded border ${
                                          p.ok
                                            ? "bg-green-500/10 text-green-400 border-green-500/20"
                                            : "bg-red-500/10 text-red-400 border-red-500/20"
                                        }`}
                                      >
                                        {p.ok ? "✓" : "✗"} {p.label}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {d.assignedVehicle && (
                                  <p className="text-xs text-gray-500">
                                    Vehicle: {d.assignedVehicle.make}{" "}
                                    {d.assignedVehicle.model} (
                                    {d.assignedVehicle.plateNumber})
                                  </p>
                                )}
                              </div>
                            );
                          })
                        )}
                        {driversPag.totalPages > 1 && (
                          <div className="flex items-center justify-between pt-2">
                            <span className="text-xs text-gray-500">
                              Page {driversPag.page}/{driversPag.totalPages}
                            </span>
                            <div className="flex gap-2">
                              <button
                                onClick={() =>
                                  fetchDrivers(
                                    selectedVendor.id,
                                    driversPag.page - 1,
                                  )
                                }
                                disabled={driversPag.page === 1}
                                className="px-2 py-1 text-xs bg-neutral-800 text-gray-400 rounded disabled:opacity-50"
                              >
                                Prev
                              </button>
                              <button
                                onClick={() =>
                                  fetchDrivers(
                                    selectedVendor.id,
                                    driversPag.page + 1,
                                  )
                                }
                                disabled={
                                  driversPag.page >= driversPag.totalPages
                                }
                                className="px-2 py-1 text-xs bg-neutral-800 text-gray-400 rounded disabled:opacity-50"
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* VEHICLES TAB */}
                    {detailTab === "vehicles" && (
                      <div className="space-y-3">
                        {isLoadingVehicles ? (
                          <div className="flex justify-center py-8">
                            <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
                          </div>
                        ) : vehicles.length === 0 ? (
                          <p className="text-center py-8 text-gray-500">
                            No vehicles registered
                          </p>
                        ) : (
                          vehicles.map((v) => {
                            const validThumbs = (
                              Array.isArray(v.thumbnails) ? v.thumbnails : []
                            ).filter((t: any) => !!t.fileUrl);
                            const ds = v.documentStatus || {};
                            const docPills: Array<{
                              label: string;
                              ok: boolean;
                            }> = [
                              { label: "Photos", ok: !!ds.VP },
                              { label: "Plates", ok: !!ds.NP },
                              { label: "Odometer", ok: !!ds.OR },
                              { label: "Insurance/Istimara", ok: !!ds.LD },
                            ];
                            return (
                              <div
                                key={v.id}
                                className="bg-neutral-800 rounded-lg p-4 border border-neutral-700 hover:border-luxury-gold/40 transition-colors cursor-pointer"
                                onClick={() =>
                                  fetchVehicleDetail(selectedVendor.id, v.id)
                                }
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-lg bg-luxury-gold/10 flex items-center justify-center overflow-hidden relative flex-shrink-0">
                                      {validThumbs[0]?.fileUrl ? (
                                        <ProfileImage
                                          fill
                                          src={validThumbs[0].fileUrl}
                                          alt={v.name}
                                          variant="document"
                                        />
                                      ) : (
                                        <Car className="w-5 h-5 text-luxury-gold" />
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-white text-sm font-medium truncate">
                                        {v.name} ({v.year})
                                      </p>
                                      <p className="text-xs text-gray-500 truncate">
                                        {v.plateNumber} · {v.category || "—"}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {v.unresolvedCommentCount > 0 && (
                                      <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded font-medium">
                                        <AlertTriangle className="w-2.5 h-2.5" />
                                        {v.unresolvedCommentCount}
                                      </span>
                                    )}
                                    <span
                                      className={`px-2 py-0.5 text-xs rounded-full border ${statusColors[v.status] || "bg-neutral-800 text-gray-400"}`}
                                    >
                                      {statusLabels[v.status] || v.status}
                                    </span>
                                  </div>
                                </div>
                                {validThumbs.length > 0 ? (
                                  <div className="flex gap-1.5 mb-2">
                                    {validThumbs
                                      .slice(0, 3)
                                      .map((t: any, i: number) => (
                                        <div
                                          key={i}
                                          className="relative w-16 h-12 bg-neutral-900 rounded overflow-hidden flex-shrink-0"
                                        >
                                          <ProfileImage
                                            fill
                                            src={t.fileUrl}
                                            alt={t.type}
                                            variant="document"
                                          />
                                        </div>
                                      ))}
                                    <div className="flex flex-col justify-center ml-1">
                                      <p className="text-[10px] text-gray-500 leading-tight">
                                        {v.documentCount || 0} docs
                                      </p>
                                      <p className="text-[10px] text-luxury-gold leading-tight">
                                        Tap to review
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5 mb-2">
                                    {docPills.map((p) => (
                                      <span
                                        key={p.label}
                                        className={`px-2 py-0.5 text-[10px] rounded border ${
                                          p.ok
                                            ? "bg-green-500/10 text-green-400 border-green-500/20"
                                            : "bg-red-500/10 text-red-400 border-red-500/20"
                                        }`}
                                      >
                                        {p.ok ? "✓" : "✗"} {p.label}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {v.assignedDriver && (
                                  <p className="text-xs text-gray-500">
                                    Driver: {v.assignedDriver.name}
                                  </p>
                                )}
                              </div>
                            );
                          })
                        )}
                        {vehiclesPag.totalPages > 1 && (
                          <div className="flex items-center justify-between pt-2">
                            <span className="text-xs text-gray-500">
                              Page {vehiclesPag.page}/{vehiclesPag.totalPages}
                            </span>
                            <div className="flex gap-2">
                              <button
                                onClick={() =>
                                  fetchVehicles(
                                    selectedVendor.id,
                                    vehiclesPag.page - 1,
                                  )
                                }
                                disabled={vehiclesPag.page === 1}
                                className="px-2 py-1 text-xs bg-neutral-800 text-gray-400 rounded disabled:opacity-50"
                              >
                                Prev
                              </button>
                              <button
                                onClick={() =>
                                  fetchVehicles(
                                    selectedVendor.id,
                                    vehiclesPag.page + 1,
                                  )
                                }
                                disabled={
                                  vehiclesPag.page >= vehiclesPag.totalPages
                                }
                                className="px-2 py-1 text-xs bg-neutral-800 text-gray-400 rounded disabled:opacity-50"
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </>
        )}
      {/* ============ DRIVER DETAIL MODAL (partner-style review) ============ */}
      {selectedDriver &&
        (() => {
          const driver = selectedDriver;
          const docs: any[] = Array.isArray(driver.documents)
            ? driver.documents
            : [];
          const findDoc = (type: string) =>
            docs.find((d: any) => d.type === type);
          const comments: Record<string, any[]> = driver.comments || {};
          const snapshot = driver.editSnapshot || null;
          const unresolvedCommentCount = driver.unresolvedCommentCount || 0;

          const profileFields: Array<{
            key: string;
            label: string;
            value: any;
          }> = [
            { key: "firstName", label: "First Name", value: driver.firstName },
            { key: "lastName", label: "Last Name", value: driver.lastName },
            { key: "phone", label: "Phone", value: driver.phone },
            {
              key: "nationalId",
              label: "National ID",
              value: driver.nationalId,
            },
            {
              key: "licenseNumber",
              label: "License Number",
              value: driver.licenseNumber,
            },
          ];

          const idDoc = findDoc("IQAMA_NATIONAL_ID");
          const idArr = idDoc?.fileUrl ? [idDoc] : [];
          const idType = "Iqama / National ID";
          const idFieldKey = "IQAMA_NATIONAL_ID";
          const hasId = !!idDoc?.fileUrl;

          const licDoc = findDoc("DRIVING_LICENSE");
          const licArr = licDoc?.fileUrl ? [licDoc] : [];
          const hasLic = !!licDoc?.fileUrl;

          const profilePhotoDoc = findDoc("PROFILE_PHOTO");
          const hasPhoto = !!driver.photoUrl || !!profilePhotoDoc?.fileUrl;
          const driverPhotoSrc =
            driver.photoUrl || profilePhotoDoc?.fileUrl || null;

          const blockReasons: string[] = [];
          if (unresolvedCommentCount > 0)
            blockReasons.push(
              `${unresolvedCommentCount} unresolved comment(s)`,
            );
          const missing: string[] = driver.missingDocuments || [];
          if (missing.length > 0)
            blockReasons.push(`${missing.length} missing document(s)`);
          const canApprove =
            blockReasons.length === 0 && driver.status === "PENDING_REVIEW";

          return (
            <>
              <div
                className="fixed inset-0 bg-black/70 z-[60]"
                onClick={() => setSelectedDriver(null)}
              />
              <div className="fixed inset-y-0 right-0 w-full sm:w-[600px] bg-neutral-900 border-l border-neutral-800 z-[61] overflow-y-auto">
                {isLoadingDriverDetail ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
                  </div>
                ) : (
                  <div className="p-4 sm:p-6">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-neutral-800 flex items-center justify-center relative flex-shrink-0">
                          {hasPhoto ? (
                            <ProfileImage
                              fill
                              src={driverPhotoSrc}
                              alt={driver.name}
                              variant="document"
                            />
                          ) : (
                            <User className="w-6 h-6 text-gray-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-xl font-bold text-white truncate">
                            {driver.name}
                          </h2>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span
                              className={`px-2 py-0.5 text-xs rounded-full border ${statusColors[driver.status] || ""}`}
                            >
                              {statusLabels[driver.status] || driver.status}
                            </span>
                            {unresolvedCommentCount > 0 && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                {unresolvedCommentCount} comment
                                {unresolvedCommentCount > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedDriver(null)}
                        className="p-2 hover:bg-neutral-800 rounded-lg flex-shrink-0"
                      >
                        <X className="w-5 h-5 text-gray-400" />
                      </button>
                    </div>

                    {missing.length > 0 && (
                      <div className="mb-5 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm text-red-400 font-medium">
                            {missing.length} required document
                            {missing.length > 1 ? "s" : ""} missing
                          </p>
                          <p className="text-xs text-red-400/60 mt-1">
                            {missing.join(", ")}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* PROFILE FIELDS GRID */}
                    <div className="mb-6">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <User className="w-3.5 h-3.5" /> Profile Information
                        {snapshot && (
                          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] rounded-full border border-blue-500/20 font-medium">
                            Showing changes
                          </span>
                        )}
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {profileFields.map((f) => {
                          const state = computeFieldState(
                            f.key,
                            comments,
                            snapshot,
                            f.value,
                          );
                          const showActions =
                            driver.status === "PENDING_REVIEW";
                          return (
                            <div
                              key={f.key}
                              className={`p-3 rounded-xl border transition-colors ${
                                state.isAddressed
                                  ? "bg-emerald-500/5 border-emerald-500/20"
                                  : state.hasChanged
                                    ? "bg-blue-500/5 border-blue-500/20"
                                    : state.hasComments
                                      ? state.isRejected
                                        ? "bg-red-500/5 border-red-500/20"
                                        : "bg-amber-500/5 border-amber-500/20"
                                      : "bg-neutral-800/50 border-neutral-800"
                              }`}
                            >
                              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5 flex items-center gap-1 flex-wrap">
                                {f.label}
                                {state.isAddressed && (
                                  <span className="ml-1.5 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[9px] font-medium">
                                    ADDRESSED
                                  </span>
                                )}
                                {state.hasChanged && !state.isAddressed && (
                                  <span className="ml-1.5 px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[9px] font-medium">
                                    CHANGED
                                  </span>
                                )}
                                {state.isRejected && !state.isAddressed && (
                                  <span className="ml-1.5 px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[9px] font-medium">
                                    REJECTED
                                  </span>
                                )}
                              </p>
                              {state.hasChanged ? (
                                <div className="space-y-1">
                                  <p className="text-xs text-red-400/70 line-through">
                                    {state.prev || "Empty"}
                                  </p>
                                  <p
                                    className={`text-sm font-medium ${state.isAddressed ? "text-emerald-400" : "text-green-400"}`}
                                  >
                                    {state.current || "Empty"}
                                  </p>
                                </div>
                              ) : (
                                <p
                                  className={`text-sm font-medium ${state.current ? "text-white" : "text-gray-600 italic"}`}
                                >
                                  {state.current || "Not provided"}
                                </p>
                              )}
                              {state.hasComments && (
                                <div className="mt-2">
                                  {state.unresolved.map((c: any) => (
                                    <p
                                      key={c.id}
                                      className={`text-[10px] flex items-start gap-1 mb-1 ${c.comment.startsWith("❌ Rejected:") ? "text-red-400" : "text-amber-400"}`}
                                    >
                                      {c.comment.startsWith("❌ Rejected:") ? (
                                        <XCircle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                      ) : (
                                        <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                      )}
                                      {c.comment}
                                    </p>
                                  ))}
                                </div>
                              )}
                              {showActions && (
                                <div className="mt-2">
                                  {rejectingField === f.key ? (
                                    <div className="flex gap-1.5">
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
                                              "driver",
                                              f.key,
                                              state.unresolved.map(
                                                (c: any) => c.id,
                                              ),
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
                                            "driver",
                                            f.key,
                                            state.unresolved.map(
                                              (c: any) => c.id,
                                            ),
                                          )
                                        }
                                        disabled={
                                          !rejectFieldComment.trim() ||
                                          actionLoading === "reject-" + f.key
                                        }
                                        className="px-2 py-1 bg-red-500 text-white text-[10px] font-medium rounded hover:bg-red-400 disabled:opacity-50"
                                      >
                                        {actionLoading === "reject-" + f.key ? (
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
                                  ) : state.isAddressed ? (
                                    // Field was rejected and the vendor has
                                    // submitted a new value. Mirror the
                                    // doc-card pattern: offer Accept (which
                                    // resolves all unresolved comments on
                                    // this field) and Reject (which reopens
                                    // the rejection form to add a new
                                    // comment). Without Accept here, admin
                                    // had no way to clear the addressed
                                    // state on info fields — only the
                                    // global "Accept All" widget at the
                                    // bottom of the modal could resolve
                                    // them, which is unintuitive.
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={async () => {
                                          for (const c of state.unresolved) {
                                            await handleResolveDriverComment(
                                              c.id,
                                            );
                                          }
                                        }}
                                        disabled={actionLoading !== null}
                                        className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded hover:bg-green-500/30 disabled:opacity-30 flex items-center gap-1"
                                      >
                                        <CheckCircle2 className="w-2.5 h-2.5" />{" "}
                                        Accept
                                      </button>
                                      <button
                                        onClick={() => {
                                          setRejectingField(f.key);
                                          setRejectFieldComment("");
                                        }}
                                        className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded hover:bg-red-500/30 flex items-center gap-1"
                                      >
                                        <XCircle className="w-2.5 h-2.5" />{" "}
                                        Reject
                                      </button>
                                    </div>
                                  ) : !state.hasComments ? (
                                    <button
                                      onClick={() => {
                                        setRejectingField(f.key);
                                        setRejectFieldComment("");
                                      }}
                                      className="px-2.5 py-1 bg-red-500/20 text-red-400 text-[10px] font-medium rounded-md hover:bg-red-500/30 border border-red-500/20 flex items-center gap-1"
                                    >
                                      <XCircle className="w-3 h-3" /> Reject
                                    </button>
                                  ) : null}
                                </div>
                              )}
                              {state.isAddressed && (
                                <div className="mt-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-400 font-medium flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Vendor has addressed this
                                </div>
                              )}
                              {state.isRejected && !state.isAddressed && (
                                <div className="mt-1.5 px-2 py-1 bg-red-500/10 border border-red-500/20 rounded text-[10px] text-red-400 font-medium">
                                  Field rejected — vendor will be notified
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* PHOTO + DOCUMENT THUMBNAILS */}
                    <div className="mb-6">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Camera className="w-3.5 h-3.5" /> Photo & Documents
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        {/* Driver Photo */}
                        {(() => {
                          const photoComments = (
                            comments["photo"] || []
                          ).filter((c: any) => !c.isResolved);
                          const hasPhotoComments = photoComments.length > 0;
                          const photoRejected = photoComments.some((c: any) =>
                            c.comment?.startsWith?.("❌ Rejected:"),
                          );
                          // "Addressed" mirrors the input-field pattern
                          // (computeFieldState above): admin rejected
                          // the photo and the vendor has since uploaded
                          // a new one. Snapshot stores both photoUrl
                          // (the driver row column) and PROFILE_PHOTO
                          // (the doc fileUrl) — either differing from
                          // its current value means the photo was
                          // replaced.
                          const snapshotIsPopulated =
                            snapshot !== null &&
                            snapshot !== undefined &&
                            typeof snapshot === "object" &&
                            Object.keys(snapshot).length > 0;
                          const prevPhotoUrl = snapshotIsPopulated
                            ? snapshot.photoUrl
                            : undefined;
                          const prevProfilePhotoDocUrl = snapshotIsPopulated
                            ? snapshot.PROFILE_PHOTO
                            : undefined;
                          const photoReplaced =
                            snapshotIsPopulated &&
                            ((prevPhotoUrl !== undefined &&
                              prevPhotoUrl !== driver.photoPath) ||
                              (prevProfilePhotoDocUrl !== undefined &&
                                prevProfilePhotoDocUrl !==
                                  profilePhotoDoc?.filePath));
                          const photoAddressed = photoRejected && photoReplaced;
                          return (
                            <div
                              className={`p-3 rounded-xl border ${
                                !hasPhoto
                                  ? "bg-red-500/5 border-red-500/15"
                                  : photoAddressed
                                    ? "bg-emerald-500/5 border-emerald-500/20"
                                    : hasPhotoComments
                                      ? photoRejected
                                        ? "bg-red-500/5 border-red-500/20"
                                        : "bg-amber-500/5 border-amber-500/20"
                                      : "bg-neutral-800/50 border-neutral-800"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-medium text-white flex items-center gap-1.5 flex-wrap">
                                  Driver Photo
                                  {photoReplaced && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[9px] rounded font-medium uppercase tracking-wider">
                                      <RefreshCw className="w-2 h-2" />
                                      Replaced
                                    </span>
                                  )}
                                </p>
                                {hasPhoto ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-red-400" />
                                )}
                              </div>
                              {hasPhoto ? (
                                <div
                                  className="relative aspect-square bg-neutral-900 rounded-lg overflow-hidden cursor-pointer group"
                                  onClick={() =>
                                    openViewer(
                                      [
                                        {
                                          label: "Driver Photo",
                                          url: driverPhotoSrc,
                                          type: "photo",
                                        },
                                      ],
                                      0,
                                      "Driver Photo",
                                    )
                                  }
                                >
                                  <ProfileImage
                                    fill
                                    src={driverPhotoSrc}
                                    alt="Driver"
                                    variant="driver"
                                  />
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20">
                                    <Eye className="w-5 h-5 text-white" />
                                  </div>
                                </div>
                              ) : (
                                <div className="aspect-square bg-neutral-900 rounded-lg flex items-center justify-center">
                                  <User className="w-8 h-8 text-gray-600" />
                                </div>
                              )}
                              {hasPhotoComments && (
                                <div className="mt-2">
                                  {photoComments.map((c: any) => (
                                    <p
                                      key={c.id}
                                      className={`text-[10px] flex items-start gap-1 mb-1 ${c.comment.startsWith("❌ Rejected:") ? "text-red-400" : "text-amber-400"}`}
                                    >
                                      {c.comment.startsWith("❌ Rejected:") ? (
                                        <XCircle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                      ) : (
                                        <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                      )}
                                      {c.comment}
                                    </p>
                                  ))}
                                </div>
                              )}
                              {driver.status === "PENDING_REVIEW" &&
                                (!photoRejected || photoAddressed) && (
                                  <div className="mt-2">
                                    {rejectingField === "photo" ? (
                                      <div className="flex gap-1.5">
                                        <input
                                          type="text"
                                          value={rejectFieldComment}
                                          onChange={(e) =>
                                            setRejectFieldComment(
                                              e.target.value,
                                            )
                                          }
                                          placeholder="Reason for rejection..."
                                          className="flex-1 px-2 py-1 bg-neutral-900 border border-red-500/30 rounded text-white text-[10px] focus:outline-none"
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (
                                              e.key === "Enter" &&
                                              rejectFieldComment.trim()
                                            )
                                              handleRejectField(
                                                "driver",
                                                "photo",
                                                photoComments.map(
                                                  (c: any) => c.id,
                                                ),
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
                                              "driver",
                                              "photo",
                                              photoComments.map(
                                                (c: any) => c.id,
                                              ),
                                            )
                                          }
                                          disabled={!rejectFieldComment.trim()}
                                          className="px-2 py-1 bg-red-500 text-white text-[10px] rounded disabled:opacity-50"
                                        >
                                          Send
                                        </button>
                                        <button
                                          onClick={() => {
                                            setRejectingField(null);
                                            setRejectFieldComment("");
                                          }}
                                          className="px-1.5 py-1 text-gray-500 text-[10px]"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        {photoAddressed && (
                                          <button
                                            onClick={async () => {
                                              for (const c of photoComments) {
                                                await handleResolveDriverComment(
                                                  c.id,
                                                );
                                              }
                                            }}
                                            disabled={actionLoading !== null}
                                            className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded hover:bg-green-500/30 disabled:opacity-30 flex items-center gap-1"
                                          >
                                            <CheckCircle2 className="w-2.5 h-2.5" />{" "}
                                            Accept
                                          </button>
                                        )}
                                        {!hasPhoto ? (
                                          <span className="text-[10px] text-red-400">
                                            Missing
                                          </span>
                                        ) : null}
                                        <button
                                          onClick={() =>
                                            setRejectingField("photo")
                                          }
                                          disabled={!hasPhoto}
                                          className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded hover:bg-red-500/30 disabled:opacity-30 flex items-center gap-1"
                                        >
                                          <XCircle className="w-2.5 h-2.5" />{" "}
                                          Reject
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              {photoAddressed ? (
                                <div className="mt-2 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-400 font-medium flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Vendor uploaded a new photo — review the
                                  replacement above
                                </div>
                              ) : photoRejected ? (
                                <div className="mt-2 px-2 py-1 bg-red-500/10 border border-red-500/20 rounded text-[10px] text-red-400 font-medium">
                                  Rejected — vendor will be notified
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}

                        {/* ID Document */}
                        {(() => {
                          const idComments = (
                            comments[idFieldKey] || []
                          ).filter((c: any) => !c.isResolved);
                          const hasIdComments = idComments.length > 0;
                          const idRejected = idComments.some((c: any) =>
                            c.comment?.startsWith?.("❌ Rejected:"),
                          );
                          const idDocLocal = hasId ? idArr[0] : null;
                          // "Addressed" via snapshot diff on doc.type
                          // (IQAMA_NATIONAL_ID). See vehicle docs IIFE
                          // for the parallel comment.
                          const idSnapshotIsPopulated =
                            snapshot !== null &&
                            snapshot !== undefined &&
                            typeof snapshot === "object" &&
                            Object.keys(snapshot).length > 0;
                          const prevIdFileUrl = idSnapshotIsPopulated
                            ? snapshot[idFieldKey]
                            : undefined;
                          const idReplaced =
                            idSnapshotIsPopulated &&
                            prevIdFileUrl !== undefined &&
                            prevIdFileUrl !== idDocLocal?.filePath;
                          const idAddressed = idRejected && idReplaced;
                          return (
                            <div
                              className={`p-3 rounded-xl border ${
                                !hasId
                                  ? "bg-red-500/5 border-red-500/15"
                                  : idAddressed
                                    ? "bg-emerald-500/5 border-emerald-500/20"
                                    : hasIdComments
                                      ? idRejected
                                        ? "bg-red-500/5 border-red-500/20"
                                        : "bg-amber-500/5 border-amber-500/20"
                                      : "bg-neutral-800/50 border-neutral-800"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-medium text-white flex items-center gap-1.5 flex-wrap">
                                  {idType}
                                  {idReplaced && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[9px] rounded font-medium uppercase tracking-wider">
                                      <RefreshCw className="w-2 h-2" />
                                      Replaced
                                    </span>
                                  )}
                                </p>
                                {hasId ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-red-400" />
                                )}
                              </div>
                              {hasId && idDocLocal?.fileUrl ? (
                                isPdf(
                                  idDocLocal.fileUrl,
                                  idDocLocal.fileName,
                                ) ? (
                                  <div
                                    className="relative aspect-square bg-neutral-900 rounded-lg flex items-center justify-center cursor-pointer hover:bg-neutral-800 transition-colors"
                                    onClick={() =>
                                      openViewer(
                                        [
                                          {
                                            label: idType,
                                            url: idDocLocal.fileUrl,
                                            type: "document",
                                            fileName: idDocLocal.fileName,
                                          },
                                        ],
                                        0,
                                        idType,
                                      )
                                    }
                                  >
                                    <FileText className="w-12 h-12 text-gray-500" />
                                  </div>
                                ) : (
                                  <div
                                    className="relative aspect-square bg-neutral-900 rounded-lg overflow-hidden cursor-pointer group"
                                    onClick={() =>
                                      openViewer(
                                        [
                                          {
                                            label: idType,
                                            url: idDocLocal.fileUrl,
                                            type: "document",
                                            fileName: idDocLocal.fileName,
                                          },
                                        ],
                                        0,
                                        idType,
                                      )
                                    }
                                  >
                                    <ProfileImage
                                      fill
                                      src={idDocLocal.fileUrl}
                                      alt={idType}
                                      variant="document"
                                    />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20">
                                      <Eye className="w-5 h-5 text-white" />
                                    </div>
                                  </div>
                                )
                              ) : (
                                <div className="aspect-square bg-neutral-900 rounded-lg flex items-center justify-center">
                                  <CreditCard className="w-8 h-8 text-gray-600" />
                                </div>
                              )}
                              {idDocLocal?.expiryDate && (
                                <p className="text-[10px] text-gray-500 mt-1.5">
                                  Expires: {formatDate(idDocLocal.expiryDate)}
                                </p>
                              )}
                              {hasIdComments && (
                                <div className="mt-2">
                                  {idComments.map((c: any) => (
                                    <p
                                      key={c.id}
                                      className={`text-[10px] flex items-start gap-1 mb-1 ${c.comment.startsWith("❌ Rejected:") ? "text-red-400" : "text-amber-400"}`}
                                    >
                                      {c.comment.startsWith("❌ Rejected:") ? (
                                        <XCircle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                      ) : (
                                        <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                      )}
                                      {c.comment}
                                    </p>
                                  ))}
                                </div>
                              )}
                              {driver.status === "PENDING_REVIEW" &&
                                (!idRejected || idAddressed) && (
                                  <div className="mt-2">
                                    {rejectingField === idFieldKey ? (
                                      <div className="flex gap-1.5">
                                        <input
                                          type="text"
                                          value={rejectFieldComment}
                                          onChange={(e) =>
                                            setRejectFieldComment(
                                              e.target.value,
                                            )
                                          }
                                          placeholder="Reason for rejection..."
                                          className="flex-1 px-2 py-1 bg-neutral-900 border border-red-500/30 rounded text-white text-[10px] focus:outline-none"
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (
                                              e.key === "Enter" &&
                                              rejectFieldComment.trim()
                                            )
                                              handleRejectField(
                                                "driver",
                                                idFieldKey,
                                                idComments.map(
                                                  (c: any) => c.id,
                                                ),
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
                                              "driver",
                                              idFieldKey,
                                              idComments.map((c: any) => c.id),
                                            )
                                          }
                                          disabled={!rejectFieldComment.trim()}
                                          className="px-2 py-1 bg-red-500 text-white text-[10px] rounded disabled:opacity-50"
                                        >
                                          Send
                                        </button>
                                        <button
                                          onClick={() => {
                                            setRejectingField(null);
                                            setRejectFieldComment("");
                                          }}
                                          className="px-1.5 py-1 text-gray-500 text-[10px]"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        {idAddressed && (
                                          <button
                                            onClick={async () => {
                                              for (const c of idComments) {
                                                await handleResolveDriverComment(
                                                  c.id,
                                                );
                                              }
                                            }}
                                            disabled={actionLoading !== null}
                                            className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded hover:bg-green-500/30 disabled:opacity-30 flex items-center gap-1"
                                          >
                                            <CheckCircle2 className="w-2.5 h-2.5" />{" "}
                                            Accept
                                          </button>
                                        )}
                                        {!hasId ? (
                                          <span className="text-[10px] text-red-400">
                                            Missing
                                          </span>
                                        ) : null}
                                        <button
                                          onClick={() =>
                                            setRejectingField(idFieldKey)
                                          }
                                          disabled={!hasId}
                                          className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded hover:bg-red-500/30 disabled:opacity-30 flex items-center gap-1"
                                        >
                                          <XCircle className="w-2.5 h-2.5" />{" "}
                                          Reject
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              {idAddressed ? (
                                <div className="mt-2 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-400 font-medium flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Vendor uploaded a new document — review the
                                  replacement above
                                </div>
                              ) : idRejected ? (
                                <div className="mt-2 px-2 py-1 bg-red-500/10 border border-red-500/20 rounded text-[10px] text-red-400 font-medium">
                                  Rejected — vendor will be notified
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}

                        {/* Driving License */}
                        {(() => {
                          const licComments = (
                            comments["licenseDocument"] || []
                          ).filter((c: any) => !c.isResolved);
                          const hasLicComments = licComments.length > 0;
                          const licRejected = licComments.some((c: any) =>
                            c.comment?.startsWith?.("❌ Rejected:"),
                          );
                          const licDocLocal = hasLic ? licArr[0] : null;
                          // "Addressed" via snapshot diff on doc.type
                          // (DRIVING_LICENSE). See vehicle docs IIFE
                          // for the parallel comment.
                          const licSnapshotIsPopulated =
                            snapshot !== null &&
                            snapshot !== undefined &&
                            typeof snapshot === "object" &&
                            Object.keys(snapshot).length > 0;
                          const prevLicFileUrl = licSnapshotIsPopulated
                            ? snapshot.DRIVING_LICENSE
                            : undefined;
                          const licReplaced =
                            licSnapshotIsPopulated &&
                            prevLicFileUrl !== undefined &&
                            prevLicFileUrl !== licDocLocal?.filePath;
                          const licAddressed = licRejected && licReplaced;
                          return (
                            <div
                              className={`p-3 rounded-xl border col-span-2 sm:col-span-1 ${
                                !hasLic
                                  ? "bg-red-500/5 border-red-500/15"
                                  : licAddressed
                                    ? "bg-emerald-500/5 border-emerald-500/20"
                                    : hasLicComments
                                      ? licRejected
                                        ? "bg-red-500/5 border-red-500/20"
                                        : "bg-amber-500/5 border-amber-500/20"
                                      : "bg-neutral-800/50 border-neutral-800"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-medium text-white flex items-center gap-1.5 flex-wrap">
                                  Driving License
                                  {licReplaced && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[9px] rounded font-medium uppercase tracking-wider">
                                      <RefreshCw className="w-2 h-2" />
                                      Replaced
                                    </span>
                                  )}
                                </p>
                                {hasLic ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-red-400" />
                                )}
                              </div>
                              {hasLic && licDocLocal?.fileUrl ? (
                                isPdf(
                                  licDocLocal.fileUrl,
                                  licDocLocal.fileName,
                                ) ? (
                                  <div
                                    className="relative aspect-square bg-neutral-900 rounded-lg flex items-center justify-center cursor-pointer hover:bg-neutral-800 transition-colors"
                                    onClick={() =>
                                      openViewer(
                                        [
                                          {
                                            label: "Driving License",
                                            url: licDocLocal.fileUrl,
                                            type: "document",
                                            fileName: licDocLocal.fileName,
                                          },
                                        ],
                                        0,
                                        "Driving License",
                                      )
                                    }
                                  >
                                    <FileText className="w-12 h-12 text-gray-500" />
                                  </div>
                                ) : (
                                  <div
                                    className="relative aspect-square bg-neutral-900 rounded-lg overflow-hidden cursor-pointer group"
                                    onClick={() =>
                                      openViewer(
                                        [
                                          {
                                            label: "Driving License",
                                            url: licDocLocal.fileUrl,
                                            type: "document",
                                            fileName: licDocLocal.fileName,
                                          },
                                        ],
                                        0,
                                        "Driving License",
                                      )
                                    }
                                  >
                                    <ProfileImage
                                      fill
                                      src={licDocLocal.fileUrl}
                                      alt="License"
                                      variant="document"
                                    />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20">
                                      <Eye className="w-5 h-5 text-white" />
                                    </div>
                                  </div>
                                )
                              ) : (
                                <div className="aspect-square bg-neutral-900 rounded-lg flex items-center justify-center">
                                  <Car className="w-8 h-8 text-gray-600" />
                                </div>
                              )}
                              {(licDocLocal?.expiryDate ||
                                driver.licenseExpiry) && (
                                <p className="text-[10px] text-gray-500 mt-1.5">
                                  Expires:{" "}
                                  {formatDate(
                                    licDocLocal?.expiryDate ||
                                      driver.licenseExpiry,
                                  )}
                                </p>
                              )}
                              {hasLicComments && (
                                <div className="mt-2">
                                  {licComments.map((c: any) => (
                                    <p
                                      key={c.id}
                                      className={`text-[10px] flex items-start gap-1 mb-1 ${c.comment.startsWith("❌ Rejected:") ? "text-red-400" : "text-amber-400"}`}
                                    >
                                      {c.comment.startsWith("❌ Rejected:") ? (
                                        <XCircle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                      ) : (
                                        <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                      )}
                                      {c.comment}
                                    </p>
                                  ))}
                                </div>
                              )}
                              {driver.status === "PENDING_REVIEW" &&
                                (!licRejected || licAddressed) && (
                                  <div className="mt-2">
                                    {rejectingField === "licenseDocument" ? (
                                      <div className="flex gap-1.5">
                                        <input
                                          type="text"
                                          value={rejectFieldComment}
                                          onChange={(e) =>
                                            setRejectFieldComment(
                                              e.target.value,
                                            )
                                          }
                                          placeholder="Reason for rejection..."
                                          className="flex-1 px-2 py-1 bg-neutral-900 border border-red-500/30 rounded text-white text-[10px] focus:outline-none"
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (
                                              e.key === "Enter" &&
                                              rejectFieldComment.trim()
                                            )
                                              handleRejectField(
                                                "driver",
                                                "licenseDocument",
                                                licComments.map(
                                                  (c: any) => c.id,
                                                ),
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
                                              "driver",
                                              "licenseDocument",
                                              licComments.map((c: any) => c.id),
                                            )
                                          }
                                          disabled={!rejectFieldComment.trim()}
                                          className="px-2 py-1 bg-red-500 text-white text-[10px] rounded disabled:opacity-50"
                                        >
                                          Send
                                        </button>
                                        <button
                                          onClick={() => {
                                            setRejectingField(null);
                                            setRejectFieldComment("");
                                          }}
                                          className="px-1.5 py-1 text-gray-500 text-[10px]"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        {licAddressed && (
                                          <button
                                            onClick={async () => {
                                              for (const c of licComments) {
                                                await handleResolveDriverComment(
                                                  c.id,
                                                );
                                              }
                                            }}
                                            disabled={actionLoading !== null}
                                            className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded hover:bg-green-500/30 disabled:opacity-30 flex items-center gap-1"
                                          >
                                            <CheckCircle2 className="w-2.5 h-2.5" />{" "}
                                            Accept
                                          </button>
                                        )}
                                        {!hasLic ? (
                                          <span className="text-[10px] text-red-400">
                                            Missing
                                          </span>
                                        ) : null}
                                        <button
                                          onClick={() =>
                                            setRejectingField("licenseDocument")
                                          }
                                          disabled={!hasLic}
                                          className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded hover:bg-red-500/30 disabled:opacity-30 flex items-center gap-1"
                                        >
                                          <XCircle className="w-2.5 h-2.5" />{" "}
                                          Reject
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              {licAddressed ? (
                                <div className="mt-2 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-400 font-medium flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Vendor uploaded a new document — review the
                                  replacement above
                                </div>
                              ) : licRejected ? (
                                <div className="mt-2 px-2 py-1 bg-red-500/10 border border-red-500/20 rounded text-[10px] text-red-400 font-medium">
                                  Rejected — vendor will be notified
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* ACTIONS */}
                    {(() => {
                      // For each snapshot key, decide whether the vendor
                      // has actually changed its value. Three lookup
                      // shapes are in play:
                      //   - Direct properties on driver (firstName,
                      //     lastName, phone, nationalId, licenseNumber)
                      //   - photoUrl special-case — compare against
                      //     driver.photoPath (raw GCS path) NOT
                      //     driver.photoUrl (signed and rotates per
                      //     request, would always read as changed).
                      //   - Doc-type keys (PROFILE_PHOTO,
                      //     IQAMA_NATIONAL_ID, DRIVING_LICENSE) — look
                      //     up the doc in driver.documents[] and use
                      //     its filePath (also raw, stable).
                      const docMap = new Map<string, string | null>();
                      ((driver as any).documents ?? []).forEach((d: any) => {
                        docMap.set(d.type, d.filePath ?? null);
                      });
                      const addressedCount = snapshot
                        ? Object.keys(snapshot).filter((k) => {
                            const prev = (snapshot as any)[k];
                            let curr: any;
                            if (k === "photoUrl") {
                              curr = (driver as any).photoPath;
                            } else if (docMap.has(k)) {
                              curr = docMap.get(k);
                            } else {
                              curr = (driver as any)[k];
                            }
                            return prev !== curr && curr != null;
                          }).length
                        : 0;
                      const vendorHasResponded = addressedCount > 0;
                      return (
                        <div className="space-y-3">
                          {vendorHasResponded && unresolvedCommentCount > 0 && (
                            <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex-1">
                                  <p className="text-sm text-white font-medium">
                                    Vendor has addressed {addressedCount} field
                                    {addressedCount > 1 ? "s" : ""}
                                  </p>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    Accept individually above, or accept all at
                                    once
                                  </p>
                                </div>
                                <button
                                  onClick={handleResolveAllDriverComments}
                                  disabled={
                                    actionLoading === "resolve-all-driver"
                                  }
                                  className="px-4 py-2.5 bg-blue-500 text-white text-sm font-semibold rounded-lg hover:bg-blue-400 disabled:opacity-50 flex items-center gap-2 transition-colors whitespace-nowrap"
                                >
                                  {actionLoading === "resolve-all-driver" ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-4 h-4" />
                                  )}
                                  Accept All
                                </button>
                              </div>
                            </div>
                          )}
                          {!vendorHasResponded &&
                            unresolvedCommentCount > 0 && (
                              <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                                <div className="flex items-start gap-3">
                                  <MessageSquare className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                                  <div className="flex-1">
                                    <p className="text-sm text-white font-medium">
                                      {unresolvedCommentCount} field
                                      {unresolvedCommentCount > 1
                                        ? "s"
                                        : ""}{" "}
                                      flagged for changes
                                    </p>
                                    <p className="text-xs text-amber-400/70 mt-0.5">
                                      Click{" "}
                                      <span className="font-semibold">
                                        Request Changes
                                      </span>{" "}
                                      below to send your notes to the vendor
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                          {!canApprove &&
                            driver.status === "PENDING_REVIEW" &&
                            unresolvedCommentCount === 0 && (
                              <div className="p-3 bg-red-500/5 border border-red-500/15 rounded-xl">
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                                  Approval blocked
                                </p>
                                {blockReasons.map((r, i) => (
                                  <p
                                    key={i}
                                    className="text-xs text-red-400 flex items-center gap-1.5 mb-1"
                                  >
                                    <XCircle className="w-3 h-3 flex-shrink-0" />{" "}
                                    {r}
                                  </p>
                                ))}
                              </div>
                            )}
                          {driver.status === "PENDING_REVIEW" ? (
                            <div className="flex gap-3">
                              <button
                                onClick={() =>
                                  handleApproveDriver(
                                    selectedVendor?.id,
                                    driver.id,
                                  )
                                }
                                disabled={
                                  !canApprove || actionLoading === driver.id
                                }
                                className="flex-1 py-2.5 bg-green-500 text-white text-sm font-semibold rounded-xl hover:bg-green-400 disabled:opacity-40 flex items-center justify-center gap-2"
                              >
                                <CheckCircle2 className="w-4 h-4" /> Approve
                                Driver
                              </button>
                              <button
                                onClick={handleRequestDriverChanges}
                                disabled={actionLoading === driver.id}
                                className="flex-1 py-2.5 bg-amber-500 text-black text-sm font-semibold rounded-xl hover:bg-amber-400 disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                <MessageSquare className="w-4 h-4" /> Request
                                Changes
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setSelectedDriver(null)}
                              className="w-full py-2.5 bg-neutral-800 text-white text-sm font-medium rounded-xl hover:bg-neutral-700"
                            >
                              Close
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </>
          );
        })()}
      {/* ============ VEHICLE DETAIL MODAL (partner-style review) ============ */}
      {selectedVehicle &&
        (() => {
          const veh = selectedVehicle;
          const docs: any[] = Array.isArray(veh.documents) ? veh.documents : [];
          const comments: Record<string, any[]> = veh.comments || {};
          const snapshot = veh.editSnapshot || null;
          const unresolvedCommentCount = veh.unresolvedCommentCount || 0;

          const vehFields: Array<{ key: string; label: string; value: any }> = [
            { key: "make", label: "Make", value: veh.make },
            { key: "model", label: "Model", value: veh.model },
            { key: "year", label: "Year", value: veh.year },
            {
              key: "plateNumber",
              label: "Plate Number",
              value: veh.plateNumber,
            },
            { key: "color", label: "Color", value: veh.color },
            { key: "category", label: "Category", value: veh.category },
            { key: "mileage", label: "Mileage", value: veh.mileage },
          ];

          const blockReasons: string[] = [];
          if (unresolvedCommentCount > 0)
            blockReasons.push(
              `${unresolvedCommentCount} unresolved comment(s)`,
            );
          const missing: string[] = veh.missingDocuments || [];
          if (missing.length > 0)
            blockReasons.push(`${missing.length} missing document(s)`);
          const canApprove =
            blockReasons.length === 0 && veh.status === "PENDING_REVIEW";

          return (
            <>
              <div
                className="fixed inset-0 bg-black/70 z-[60]"
                onClick={() => setSelectedVehicle(null)}
              />
              <div className="fixed inset-y-0 right-0 w-full sm:w-[640px] bg-neutral-900 border-l border-neutral-800 z-[61] overflow-y-auto">
                {isLoadingVehicleDetail ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
                  </div>
                ) : (
                  <div className="p-4 sm:p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-luxury-gold/10 flex items-center justify-center flex-shrink-0">
                          <Car className="w-6 h-6 text-luxury-gold" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-xl font-bold text-white truncate">
                            {veh.name || `${veh.make} ${veh.model}`}
                          </h2>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-xs text-gray-400 font-mono">
                              {veh.plateNumber}
                            </span>
                            <span
                              className={`px-2 py-0.5 text-xs rounded-full border ${statusColors[veh.status] || ""}`}
                            >
                              {statusLabels[veh.status] || veh.status}
                            </span>
                            {unresolvedCommentCount > 0 && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                {unresolvedCommentCount} comment
                                {unresolvedCommentCount > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedVehicle(null)}
                        className="p-2 hover:bg-neutral-800 rounded-lg flex-shrink-0"
                      >
                        <X className="w-5 h-5 text-gray-400" />
                      </button>
                    </div>

                    {missing.length > 0 && (
                      <div className="mb-5 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm text-red-400 font-medium">
                            {missing.length} required document
                            {missing.length > 1 ? "s" : ""} missing
                          </p>
                          <p className="text-xs text-red-400/60 mt-1">
                            {missing.join(", ")}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Info Fields Grid */}
                    <div className="mb-6">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Car className="w-3.5 h-3.5" /> Vehicle Information
                        {snapshot && (
                          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] rounded-full border border-blue-500/20 font-medium">
                            Showing changes
                          </span>
                        )}
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {vehFields.map((f) => {
                          const state = computeFieldState(
                            f.key,
                            comments,
                            snapshot,
                            f.value,
                          );
                          const showActions = veh.status === "PENDING_REVIEW";
                          return (
                            <div
                              key={f.key}
                              className={`p-3 rounded-xl border ${
                                state.isAddressed
                                  ? "bg-emerald-500/5 border-emerald-500/20"
                                  : state.hasChanged
                                    ? "bg-blue-500/5 border-blue-500/20"
                                    : state.hasComments
                                      ? state.isRejected
                                        ? "bg-red-500/5 border-red-500/20"
                                        : "bg-amber-500/5 border-amber-500/20"
                                      : "bg-neutral-800/50 border-neutral-800"
                              }`}
                            >
                              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5 flex items-center gap-1 flex-wrap">
                                {f.label}
                                {state.isAddressed && (
                                  <span className="ml-1.5 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[9px] font-medium">
                                    ADDRESSED
                                  </span>
                                )}
                                {state.hasChanged && !state.isAddressed && (
                                  <span className="ml-1.5 px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[9px] font-medium">
                                    CHANGED
                                  </span>
                                )}
                                {state.isRejected && !state.isAddressed && (
                                  <span className="ml-1.5 px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[9px] font-medium">
                                    REJECTED
                                  </span>
                                )}
                              </p>
                              {state.hasChanged ? (
                                <div className="space-y-1">
                                  <p className="text-xs text-red-400/70 line-through">
                                    {state.prev != null
                                      ? String(state.prev)
                                      : "Empty"}
                                  </p>
                                  <p
                                    className={`text-sm font-medium ${state.isAddressed ? "text-emerald-400" : "text-green-400"}`}
                                  >
                                    {state.current != null
                                      ? String(state.current)
                                      : "Empty"}
                                  </p>
                                </div>
                              ) : (
                                <p
                                  className={`text-sm font-medium ${state.current != null && state.current !== "" ? "text-white" : "text-gray-600 italic"}`}
                                >
                                  {state.current != null && state.current !== ""
                                    ? String(state.current)
                                    : "Not provided"}
                                </p>
                              )}
                              {state.hasComments && (
                                <div className="mt-2">
                                  {state.unresolved.map((c: any) => (
                                    <p
                                      key={c.id}
                                      className={`text-[10px] flex items-start gap-1 mb-1 ${c.comment.startsWith("❌ Rejected:") ? "text-red-400" : "text-amber-400"}`}
                                    >
                                      {c.comment.startsWith("❌ Rejected:") ? (
                                        <XCircle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                      ) : (
                                        <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                      )}
                                      {c.comment}
                                    </p>
                                  ))}
                                </div>
                              )}
                              {showActions && (
                                <div className="mt-2">
                                  {rejectingField === f.key ? (
                                    <div className="flex gap-1.5">
                                      <input
                                        type="text"
                                        value={rejectFieldComment}
                                        onChange={(e) =>
                                          setRejectFieldComment(e.target.value)
                                        }
                                        placeholder="Reason..."
                                        className="flex-1 px-2 py-1 bg-neutral-900 border border-red-500/30 rounded text-white text-[10px] focus:outline-none"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (
                                            e.key === "Enter" &&
                                            rejectFieldComment.trim()
                                          )
                                            handleRejectField(
                                              "vehicle",
                                              f.key,
                                              state.unresolved.map(
                                                (c: any) => c.id,
                                              ),
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
                                            "vehicle",
                                            f.key,
                                            state.unresolved.map(
                                              (c: any) => c.id,
                                            ),
                                          )
                                        }
                                        disabled={
                                          !rejectFieldComment.trim() ||
                                          actionLoading === "reject-" + f.key
                                        }
                                        className="px-2 py-1 bg-red-500 text-white text-[10px] rounded disabled:opacity-50"
                                      >
                                        {actionLoading === "reject-" + f.key ? (
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
                                        className="px-1.5 py-1 text-gray-500 text-[10px]"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ) : state.isAddressed ? (
                                    // Mirrors the driver-side fix and the
                                    // existing vehicle-doc pattern: when
                                    // the vendor has updated a previously-
                                    // rejected field, admin needs Accept
                                    // (resolves all unresolved comments)
                                    // and Reject (reopens the form to add
                                    // a new rejection comment) right next
                                    // to the field — not just the global
                                    // "Accept All" widget at the bottom.
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={async () => {
                                          for (const c of state.unresolved) {
                                            await handleResolveVehicleComment(
                                              c.id,
                                            );
                                          }
                                        }}
                                        disabled={actionLoading !== null}
                                        className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded hover:bg-green-500/30 disabled:opacity-30 flex items-center gap-1"
                                      >
                                        <CheckCircle2 className="w-2.5 h-2.5" />{" "}
                                        Accept
                                      </button>
                                      <button
                                        onClick={() => {
                                          setRejectingField(f.key);
                                          setRejectFieldComment("");
                                        }}
                                        className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded hover:bg-red-500/30 flex items-center gap-1"
                                      >
                                        <XCircle className="w-2.5 h-2.5" />{" "}
                                        Reject
                                      </button>
                                    </div>
                                  ) : !state.hasComments ? (
                                    <button
                                      onClick={() => {
                                        setRejectingField(f.key);
                                        setRejectFieldComment("");
                                      }}
                                      className="px-2.5 py-1 bg-red-500/20 text-red-400 text-[10px] font-medium rounded-md hover:bg-red-500/30 border border-red-500/20 flex items-center gap-1"
                                    >
                                      <XCircle className="w-3 h-3" /> Reject
                                    </button>
                                  ) : null}
                                </div>
                              )}
                              {state.isAddressed && (
                                <div className="mt-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-400 font-medium flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Vendor has addressed this
                                </div>
                              )}
                              {state.isRejected && !state.isAddressed && (
                                <div className="mt-1.5 px-2 py-1 bg-red-500/10 border border-red-500/20 rounded text-[10px] text-red-400 font-medium">
                                  Rejected — vendor will be notified
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Photos & Documents — flat docs iteration with TYPE_META */}
                    <div className="mb-6">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Camera className="w-3.5 h-3.5" /> Photos & Documents
                      </h4>
                      {(() => {
                        const TYPE_META: Record<
                          string,
                          { icon: any; bucket: string }
                        > = {
                          PHOTO_FRONT: {
                            icon: Camera,
                            bucket: "vehiclePhotos",
                          },
                          PHOTO_BACK: { icon: Camera, bucket: "vehiclePhotos" },
                          PHOTO_LEFT: { icon: Camera, bucket: "vehiclePhotos" },
                          PHOTO_RIGHT: {
                            icon: Camera,
                            bucket: "vehiclePhotos",
                          },
                          PHOTO_INTERIOR_FRONT: {
                            icon: Camera,
                            bucket: "vehiclePhotos",
                          },
                          PHOTO_INTERIOR_BACK: {
                            icon: Camera,
                            bucket: "vehiclePhotos",
                          },
                          NUMBER_PLATE_FRONT: {
                            icon: CreditCard,
                            bucket: "numberPlates",
                          },
                          NUMBER_PLATE_BACK: {
                            icon: CreditCard,
                            bucket: "numberPlates",
                          },
                          ODOMETER: { icon: Gauge, bucket: "odometer" },
                          INSURANCE: { icon: Shield, bucket: "insurance" },
                          ISTIMARA: { icon: FileText, bucket: "istimara" },
                        };
                        return (
                          <div className="grid grid-cols-2 gap-3">
                            {docs.map((doc: any) => {
                              const meta = TYPE_META[doc.type] || {
                                icon: FileText,
                                bucket: doc.type,
                              };
                              const Icon = meta.icon;
                              const hasIt = !!doc.fileUrl;
                              const typeComments = (
                                comments[doc.type] || []
                              ).filter((c: any) => !c.isResolved);
                              const bucketComments = (
                                comments[meta.bucket] || []
                              ).filter((c: any) => !c.isResolved);
                              const seen = new Set<string>();
                              const allComments = [
                                ...typeComments,
                                ...bucketComments,
                              ].filter((c: any) => {
                                if (seen.has(c.id)) return false;
                                seen.add(c.id);
                                return true;
                              });
                              const hasDocComments = allComments.length > 0;
                              const docRejected = allComments.some((c: any) =>
                                c.comment?.startsWith?.("❌ Rejected:"),
                              );
                              // "Addressed" mirrors the input-field
                              // pattern (computeFieldState above): admin
                              // rejected this doc, and the vendor has
                              // since replaced the underlying file —
                              // i.e. the snapshot's fileUrl for this
                              // doc.type differs from the current
                              // doc.fileUrl. The backend snapshots doc
                              // fileUrls keyed by doc.type at the
                              // moment Request Changes is sent, so this
                              // comparison "just works" for any doc.
                              const snapshotIsPopulated =
                                snapshot !== null &&
                                snapshot !== undefined &&
                                typeof snapshot === "object" &&
                                Object.keys(snapshot).length > 0;
                              const prevFileUrl = snapshotIsPopulated
                                ? snapshot[doc.type]
                                : undefined;
                              const fileReplaced =
                                snapshotIsPopulated &&
                                prevFileUrl !== undefined &&
                                prevFileUrl !== doc.filePath;
                              const isAddressed = docRejected && fileReplaced;
                              return (
                                <div
                                  key={doc.type}
                                  className={`p-3 rounded-xl border ${
                                    !hasIt
                                      ? "bg-red-500/5 border-red-500/15"
                                      : isAddressed
                                        ? "bg-emerald-500/5 border-emerald-500/20"
                                        : hasDocComments
                                          ? docRejected
                                            ? "bg-red-500/5 border-red-500/20"
                                            : "bg-amber-500/5 border-amber-500/20"
                                          : "bg-neutral-800/50 border-neutral-800"
                                  }`}
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-medium text-white flex items-center gap-1.5 flex-wrap">
                                      <Icon className="w-3.5 h-3.5 text-luxury-gold" />{" "}
                                      {doc.label}
                                      {/* REPLACED badge — vendor uploaded a new file since admin's last review */}
                                      {fileReplaced && (
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[9px] rounded font-medium uppercase tracking-wider">
                                          <RefreshCw className="w-2 h-2" />
                                          Replaced
                                        </span>
                                      )}
                                    </p>
                                    {hasIt ? (
                                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                                    ) : (
                                      <XCircle className="w-4 h-4 text-red-400" />
                                    )}
                                  </div>
                                  {hasIt && doc.fileUrl ? (
                                    isPdf(doc.fileUrl, doc.fileName) ? (
                                      <div
                                        className="relative aspect-video bg-neutral-900 rounded flex items-center justify-center cursor-pointer hover:bg-neutral-800"
                                        onClick={() =>
                                          openViewer(
                                            [
                                              {
                                                label: doc.label,
                                                url: doc.fileUrl,
                                                type: "document" as const,
                                                fileName: doc.fileName,
                                              },
                                            ],
                                            0,
                                            doc.label,
                                          )
                                        }
                                      >
                                        <FileText className="w-8 h-8 text-gray-500" />
                                        <span className="absolute bottom-1 right-1 px-1 py-0.5 bg-black/70 rounded text-[9px] text-gray-300">
                                          PDF
                                        </span>
                                      </div>
                                    ) : (
                                      <div
                                        className="relative aspect-video bg-neutral-900 rounded overflow-hidden cursor-pointer group"
                                        onClick={() =>
                                          openViewer(
                                            [
                                              {
                                                label: doc.label,
                                                url: doc.fileUrl,
                                                type: "photo" as const,
                                                fileName: doc.fileName,
                                              },
                                            ],
                                            0,
                                            doc.label,
                                          )
                                        }
                                      >
                                        <ProfileImage
                                          fill
                                          src={doc.fileUrl}
                                          alt={doc.label}
                                          variant="document"
                                        />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20">
                                          <Eye className="w-4 h-4 text-white" />
                                        </div>
                                      </div>
                                    )
                                  ) : (
                                    <div className="aspect-video bg-neutral-900 rounded flex items-center justify-center">
                                      <Icon className="w-8 h-8 text-gray-600" />
                                    </div>
                                  )}
                                  {doc?.expiryDate && (
                                    <p className="text-[10px] text-gray-500 mt-1.5">
                                      Expires: {formatDate(doc.expiryDate)}
                                    </p>
                                  )}
                                  {hasDocComments && (
                                    <div className="mt-2">
                                      {allComments.map((c: any) => (
                                        <p
                                          key={c.id}
                                          className={`text-[10px] flex items-start gap-1 mb-1 ${c.comment.startsWith("❌ Rejected:") ? "text-red-400" : "text-amber-400"}`}
                                        >
                                          {c.comment.startsWith(
                                            "❌ Rejected:",
                                          ) ? (
                                            <XCircle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                          ) : (
                                            <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                          )}
                                          {c.comment}
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                  {/* Reject UI — visible when there's no rejection, OR when the
          vendor has addressed an existing rejection (so admin can
          re-reject the replacement if it's still wrong). Same gating
          pattern as the vendor profile review modal. */}
                                  {veh.status === "PENDING_REVIEW" &&
                                    (!docRejected || isAddressed) && (
                                      <div className="mt-2">
                                        {rejectingField === doc.type ? (
                                          <div className="flex gap-1.5">
                                            <input
                                              type="text"
                                              value={rejectFieldComment}
                                              onChange={(e) =>
                                                setRejectFieldComment(
                                                  e.target.value,
                                                )
                                              }
                                              placeholder="Reason for rejection..."
                                              className="flex-1 px-2 py-1 bg-neutral-900 border border-red-500/30 rounded text-white text-[10px] focus:outline-none"
                                              autoFocus
                                              onKeyDown={(e) => {
                                                if (
                                                  e.key === "Enter" &&
                                                  rejectFieldComment.trim()
                                                )
                                                  handleRejectField(
                                                    "vehicle",
                                                    doc.type,
                                                    allComments.map(
                                                      (c: any) => c.id,
                                                    ),
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
                                                  "vehicle",
                                                  doc.type,
                                                  allComments.map(
                                                    (c: any) => c.id,
                                                  ),
                                                )
                                              }
                                              disabled={
                                                !rejectFieldComment.trim() ||
                                                actionLoading ===
                                                  "reject-" + doc.type
                                              }
                                              className="px-2 py-1 bg-red-500 text-white text-[10px] rounded disabled:opacity-50"
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
                                              className="px-1.5 py-1 text-gray-500 text-[10px]"
                                            >
                                              ✕
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-2">
                                            {/* Accept = resolve the unresolved rejection
                    comments. Only meaningful when admin needs to
                    confirm the replacement is good. */}
                                            {isAddressed && (
                                              <button
                                                onClick={async () => {
                                                  for (const c of allComments) {
                                                    await handleResolveVehicleComment(
                                                      c.id,
                                                    );
                                                  }
                                                }}
                                                disabled={
                                                  actionLoading !== null
                                                }
                                                className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded hover:bg-green-500/30 disabled:opacity-30 flex items-center gap-1"
                                              >
                                                <CheckCircle2 className="w-2.5 h-2.5" />{" "}
                                                Accept
                                              </button>
                                            )}
                                            {!hasIt ? (
                                              <span className="text-[10px] text-red-400">
                                                Missing
                                              </span>
                                            ) : null}
                                            <button
                                              onClick={() =>
                                                setRejectingField(doc.type)
                                              }
                                              disabled={!hasIt}
                                              className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded hover:bg-red-500/30 disabled:opacity-30 flex items-center gap-1"
                                            >
                                              <XCircle className="w-2.5 h-2.5" />{" "}
                                              Reject
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  {/* Trailing banner — flips between "still rejected" (red)
          and "vendor uploaded a replacement, please review"
          (emerald) based on whether the doc was replaced since
          the rejection. */}
                                  {isAddressed ? (
                                    <div className="mt-2 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-400 font-medium flex items-center gap-1.5">
                                      <CheckCircle2 className="w-3 h-3" />
                                      Vendor uploaded a new file — review the
                                      replacement above
                                    </div>
                                  ) : docRejected ? (
                                    <div className="mt-2 px-2 py-1 bg-red-500/10 border border-red-500/20 rounded text-[10px] text-red-400 font-medium">
                                      Rejected — vendor will be notified
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Actions */}
                    {(() => {
                      // Walk snapshot keys correctly: doc keys (PHOTO_*,
                      // NUMBER_PLATE_*, ODOMETER, INSURANCE, ISTIMARA)
                      // live in veh.documents[].filePath; input fields
                      // (make, model, plateNumber, color, category,
                      // mileage, etc.) are direct properties. Same
                      // signed-URL fix we applied on the driver side.
                      const vehDocMap = new Map<string, string | null>();
                      ((veh as any).documents ?? []).forEach((d: any) => {
                        vehDocMap.set(d.type, d.filePath ?? null);
                      });
                      const addressedCount = snapshot
                        ? Object.keys(snapshot).filter((k) => {
                            const prev = (snapshot as any)[k];
                            const curr = vehDocMap.has(k)
                              ? vehDocMap.get(k)
                              : (veh as any)[k];
                            return prev !== curr && curr != null;
                          }).length
                        : 0;
                      const vendorHasResponded = addressedCount > 0;
                      return (
                        <div className="space-y-3">
                          {vendorHasResponded && unresolvedCommentCount > 0 && (
                            <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex-1">
                                  <p className="text-sm text-white font-medium">
                                    Vendor has addressed {addressedCount} field
                                    {addressedCount > 1 ? "s" : ""}
                                  </p>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    Accept individually above, or accept all at
                                    once
                                  </p>
                                </div>
                                <button
                                  onClick={handleResolveAllVehicleComments}
                                  disabled={
                                    actionLoading === "resolve-all-vehicle"
                                  }
                                  className="px-4 py-2.5 bg-blue-500 text-white text-sm font-semibold rounded-lg hover:bg-blue-400 disabled:opacity-50 flex items-center gap-2 transition-colors whitespace-nowrap"
                                >
                                  {actionLoading === "resolve-all-vehicle" ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-4 h-4" />
                                  )}
                                  Accept All
                                </button>
                              </div>
                            </div>
                          )}
                          {!vendorHasResponded &&
                            unresolvedCommentCount > 0 && (
                              <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                                <div className="flex items-start gap-3">
                                  <MessageSquare className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                                  <div className="flex-1">
                                    <p className="text-sm text-white font-medium">
                                      {unresolvedCommentCount} field
                                      {unresolvedCommentCount > 1
                                        ? "s"
                                        : ""}{" "}
                                      flagged for changes
                                    </p>
                                    <p className="text-xs text-amber-400/70 mt-0.5">
                                      Click{" "}
                                      <span className="font-semibold">
                                        Request Changes
                                      </span>{" "}
                                      below to send your notes to the vendor
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                          {!canApprove &&
                            veh.status === "PENDING_REVIEW" &&
                            unresolvedCommentCount === 0 && (
                              <div className="p-3 bg-red-500/5 border border-red-500/15 rounded-xl">
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                                  Approval blocked
                                </p>
                                {blockReasons.map((r, i) => (
                                  <p
                                    key={i}
                                    className="text-xs text-red-400 flex items-center gap-1.5 mb-1"
                                  >
                                    <XCircle className="w-3 h-3 flex-shrink-0" />{" "}
                                    {r}
                                  </p>
                                ))}
                              </div>
                            )}
                          {veh.status === "PENDING_REVIEW" ? (
                            <div className="flex gap-3">
                              <button
                                onClick={() =>
                                  handleApproveVehicle(
                                    selectedVendor?.id,
                                    veh.id,
                                  )
                                }
                                disabled={
                                  !canApprove || actionLoading === veh.id
                                }
                                className="flex-1 py-2.5 bg-luxury-gold text-black text-sm font-semibold rounded-xl hover:bg-luxury-gold/90 disabled:opacity-40 flex items-center justify-center gap-2"
                              >
                                <CheckCircle2 className="w-4 h-4" /> Approve
                                Vehicle
                              </button>
                              <button
                                onClick={handleRequestVehicleChanges}
                                disabled={actionLoading === veh.id}
                                className="flex-1 py-2.5 bg-amber-500 text-black text-sm font-semibold rounded-xl hover:bg-amber-400 disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                <MessageSquare className="w-4 h-4" /> Request
                                Changes
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setSelectedVehicle(null)}
                              className="w-full py-2.5 bg-neutral-800 text-white text-sm font-medium rounded-xl hover:bg-neutral-700"
                            >
                              Close
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </>
          );
        })()}
      {/* ============ DOCUMENT VIEWER (legacy inline overlay) ============ */}
      {viewerOpen &&
        viewerItems.length > 0 &&
        viewerItems[viewerIndex]?.url && (
          <>
            <DocumentViewer
              url={viewerItems[viewerIndex].url!}
              fileName={viewerItems[viewerIndex].fileName || undefined}
              title={`${viewerTitle} — ${viewerItems[viewerIndex].label}${viewerItems.length > 1 ? ` (${viewerIndex + 1}/${viewerItems.length})` : ""}`}
              onClose={() => setViewerOpen(false)}
            />
            {viewerItems.length > 1 && (
              <>
                <button
                  onClick={() =>
                    setViewerIndex(
                      (i) => (i - 1 + viewerItems.length) % viewerItems.length,
                    )
                  }
                  className="fixed left-3 top-1/2 -translate-y-1/2 z-[71] p-3 bg-neutral-800/90 rounded-full hover:bg-neutral-700 shadow-lg"
                >
                  <ChevronLeft className="w-6 h-6 text-white" />
                </button>
                <button
                  onClick={() =>
                    setViewerIndex((i) => (i + 1) % viewerItems.length)
                  }
                  className="fixed right-3 top-1/2 -translate-y-1/2 z-[71] p-3 bg-neutral-800/90 rounded-full hover:bg-neutral-700 shadow-lg"
                >
                  <ChevronRight className="w-6 h-6 text-white" />
                </button>
              </>
            )}
          </>
        )}

      {/* ============ REJECT CHANGE REQUEST MODAL ============ */}
      {showRejectCrModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => {
              setShowRejectCrModal(null);
              setRejectCrNote("");
            }}
          />
          <div className="relative w-full max-w-md mx-3 sm:mx-4 bg-neutral-900 border border-red-500/30 rounded-xl shadow-2xl">
            <div className="p-5 border-b border-neutral-800">
              <h3 className="text-lg font-semibold text-white">
                Reject{" "}
                {showRejectCrModal.kind === "driver"
                  ? "Driver"
                  : showRejectCrModal.kind === "vehicle"
                    ? "Vehicle"
                    : "Vendor Profile"}{" "}
                Change Request
              </h3>
              <p className="text-sm text-red-400 mt-1">
                {showRejectCrModal.name}
              </p>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-400">
                The vendor will see this reason and the change request will be
                marked as REJECTED.
              </p>
              <textarea
                value={rejectCrNote}
                onChange={(e) => setRejectCrNote(e.target.value)}
                rows={3}
                placeholder="e.g. The requested changes are not applicable at this time..."
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-red-500/50 resize-none"
              />
            </div>
            <div className="flex gap-3 p-5 border-t border-neutral-800">
              <button
                onClick={() => {
                  setShowRejectCrModal(null);
                  setRejectCrNote("");
                }}
                className="flex-1 px-4 py-2.5 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectChangeRequest}
                disabled={
                  !rejectCrNote.trim() || actionLoading === showRejectCrModal.id
                }
                className="flex-1 px-4 py-2.5 bg-red-500 text-white font-medium rounded-lg hover:bg-red-400 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading === showRejectCrModal.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ ONBOARD MODAL ============ */}
      {showOnboardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowOnboardModal(false)}
          />
          <div className="relative w-full max-w-lg mx-3 sm:mx-4 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-neutral-800">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Onboard New Vendor
                </h3>
                <p className="text-sm text-gray-400">
                  Company name & email — vendor adds the rest
                </p>
              </div>
              <button
                onClick={() => setShowOnboardModal(false)}
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
                  value={onboardForm.companyName}
                  onChange={(e) =>
                    setOnboardForm((f) => ({
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
                  Email *
                </label>
                <EmailInput
                  value={onboardForm.email}
                  onChange={(email) => setOnboardForm((f) => ({ ...f, email }))}
                  label=""
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-neutral-800">
              <button
                onClick={() => setShowOnboardModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleOnboard}
                disabled={
                  !onboardForm.companyName || !onboardForm.email || isOnboarding
                }
                className="flex items-center gap-2 px-4 py-2 bg-luxury-gold text-black font-semibold rounded-lg hover:bg-luxury-gold/90 disabled:opacity-50"
              >
                {isOnboarding ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Onboard Vendor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ BANK REQUESTS MODAL ============ */}
      {showBankRequests && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowBankRequests(false)}
          />
          <div className="relative w-full max-w-2xl mx-3 sm:mx-4 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="p-5 border-b border-neutral-800 flex items-center justify-between sticky top-0 bg-neutral-900 z-10">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Bank Update Requests
                </h3>
                <p className="text-sm text-gray-400">
                  {bankRequests.length} pending
                </p>
              </div>
              <button
                onClick={() => setShowBankRequests(false)}
                className="p-1 hover:bg-neutral-800 rounded"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {isLoadingBankReqs ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
                </div>
              ) : bankRequests.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                  <p className="text-white">No pending requests</p>
                </div>
              ) : (
                bankRequests.map((r) => (
                  <div
                    key={r.id}
                    className="bg-neutral-800 border border-neutral-700 rounded-xl p-5"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h4 className="text-white font-medium">
                        {r.vendor?.companyName}
                      </h4>
                      <span className="px-2 py-1 bg-orange-500/20 text-orange-400 text-xs rounded-full">
                        Pending
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="bg-neutral-900 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">Current</p>
                        <p className="text-sm text-white">
                          {r.previousBankName || r.vendor?.bankName || "—"}
                        </p>
                        <p className="text-xs text-gray-400 font-mono">
                          {r.previousBankIban || r.vendor?.bankIban || "—"}
                        </p>
                      </div>
                      <div className="bg-neutral-900 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">Requested</p>
                        <p className="text-sm text-white">
                          {r.requestedBankName || "—"}
                        </p>
                        <p className="text-xs text-gray-400 font-mono">
                          {r.requestedBankIban || "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleApproveBankReq(r.id)}
                        disabled={actionLoading === r.id}
                        className="flex-1 py-2 bg-green-500 text-white text-sm font-semibold rounded-lg hover:bg-green-400 disabled:opacity-50"
                      >
                        Approve & Update
                      </button>
                      <button
                        onClick={() => handleRejectBankReq(r.id)}
                        disabled={actionLoading === r.id}
                        className="flex-1 py-2 bg-neutral-700 text-white text-sm rounded-lg hover:bg-neutral-600 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {/* ============ VENDOR PROFILE REVIEW MODAL ============ */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => {
              setShowReviewModal(false);
              setReviewProfile(null);
            }}
          />
          <div className="relative w-full max-w-2xl mx-3 sm:mx-4 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="p-5 border-b border-neutral-800 flex items-center justify-between sticky top-0 bg-neutral-900 z-10">
              <div className="flex items-center gap-3 min-w-0">
                {/* Logo avatar — shown only when reviewing a specific
                    vendor (reviewProfile populated). Falls back to the
                    Truck icon for vendors without a logo yet. */}
                {reviewProfile && (
                  <ProfileImage
                    src={reviewProfile.logoUrl}
                    alt={reviewProfile.companyName || "Vendor logo"}
                    size="sm"
                    variant="vendor"
                    fallbackText={reviewProfile.companyName}
                    fallbackIcon={
                      <Truck className="w-5 h-5 text-luxury-gold" />
                    }
                  />
                )}
                <h3 className="text-lg font-semibold text-white truncate">
                  {reviewProfile
                    ? reviewProfile.companyName
                    : "Profile Reviews"}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowReviewModal(false);
                  setReviewProfile(null);
                }}
                className="p-1 hover:bg-neutral-800 rounded flex-shrink-0"
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

                  {/* PROFILE INFORMATION */}
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
                      {Object.entries(reviewProfile.profile || {}).map(
                        ([key, value]: [string, any]) => {
                          const unresolvedComments =
                            reviewProfile.comments?.[key]?.filter(
                              (c: any) => !c.isResolved,
                            ) || [];
                          const hasComments = unresolvedComments.length > 0;
                          const prev = reviewProfile.previousProfile?.[key];
                          const hasChanged =
                            reviewProfile.previousProfile != null &&
                            prev !== value &&
                            prev !== undefined;
                          const isRejected = unresolvedComments.some((c: any) =>
                            c.comment?.startsWith?.("❌ Rejected:"),
                          );
                          // "Addressed" = admin rejected this field AND the
                          // vendor has resubmitted the profile SINCE that
                          // rejection. Without the submission-vs-rejection
                          // time check, the flag fires immediately after
                          // admin clicks Reject (because hasChanged stays
                          // true from the vendor's earlier edit). We need to
                          // see a fresh resubmission after the latest
                          // rejection to call it addressed.
                          const mostRecentRejectionAt: number =
                            unresolvedComments
                              .filter((c: any) =>
                                c.comment?.startsWith?.("❌ Rejected:"),
                              )
                              .reduce((acc: number, c: any) => {
                                const t = new Date(c.createdAt).getTime();
                                return t > acc ? t : acc;
                              }, 0);
                          const submittedAfterRejection =
                            !!reviewProfile.submittedAt &&
                            new Date(reviewProfile.submittedAt).getTime() >
                              mostRecentRejectionAt;
                          const isAddressed =
                            isRejected && hasChanged && submittedAfterRejection;
                          return (
                            <div
                              key={key}
                              className={`p-3 rounded-xl border transition-colors ${
                                isAddressed
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
                                {hasChanged && !isAddressed && (
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
                              {hasComments && (
                                <div className="mt-2">
                                  {unresolvedComments.map((c: any) => (
                                    <p
                                      key={c.id}
                                      className={`text-[10px] flex items-start gap-1 mb-1 ${c.comment.startsWith("❌ Rejected:") ? "text-red-400" : "text-amber-400"}`}
                                    >
                                      {c.comment.startsWith("❌ Rejected:") ? (
                                        <XCircle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                      ) : (
                                        <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                      )}
                                      {c.comment}
                                    </p>
                                  ))}
                                  {isAddressed ? (
                                    <div className="mt-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-400 font-medium flex items-center gap-1.5">
                                      <CheckCircle2 className="w-3 h-3" />
                                      Vendor has addressed this — review the
                                      updated value above
                                    </div>
                                  ) : isRejected ? (
                                    <p className="mt-1 text-[10px] text-red-400/60 italic">
                                      Will be sent back when you click Request
                                      Changes
                                    </p>
                                  ) : null}
                                  {/* Accept/Reject controls — hidden when
                                      the field is rejected but not yet
                                      addressed (rejection is locked in until
                                      vendor updates the value); shown when
                                      isAddressed so admin can confirm or
                                      re-reject the new value. */}
                                  {(!isRejected || isAddressed) &&
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
                                              handleRejectVendorField(
                                                key,
                                                reviewProfile.id,
                                              );
                                            if (e.key === "Escape") {
                                              setRejectingField(null);
                                              setRejectFieldComment("");
                                            }
                                          }}
                                        />
                                        <button
                                          onClick={() =>
                                            handleRejectVendorField(
                                              key,
                                              reviewProfile.id,
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
                                      <div className="flex items-center gap-2 mt-2">
                                        <button
                                          onClick={() => {
                                            unresolvedComments.forEach(
                                              (c: any) =>
                                                handleResolveVendorComment(
                                                  c.id,
                                                  reviewProfile.id,
                                                ),
                                            );
                                          }}
                                          disabled={actionLoading !== null}
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
                                          <XCircle className="w-3 h-3" /> Reject
                                        </button>
                                      </div>
                                    ))}
                                </div>
                              )}
                              {/* No-comments-yet path: surface a small Reject
                                  button (plus its inline input when active)
                                  so the admin can flag this field directly
                                  without going through a generic dropdown.
                                  Skipped when the field is already in a
                                  rejected/addressed state above. */}
                              {!hasComments &&
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
                                          handleRejectVendorField(
                                            key,
                                            reviewProfile.id,
                                          );
                                        if (e.key === "Escape") {
                                          setRejectingField(null);
                                          setRejectFieldComment("");
                                        }
                                      }}
                                    />
                                    <button
                                      onClick={() =>
                                        handleRejectVendorField(
                                          key,
                                          reviewProfile.id,
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
                                  <button
                                    onClick={() => {
                                      setRejectingField(key);
                                      setRejectFieldComment("");
                                    }}
                                    className="mt-2 px-2 py-0.5 bg-red-500/10 text-red-400/80 text-[10px] font-medium rounded hover:bg-red-500/20 hover:text-red-400 border border-red-500/15 transition-colors flex items-center gap-1"
                                  >
                                    <XCircle className="w-2.5 h-2.5" /> Reject
                                  </button>
                                ))}
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>

                  {/* DOCUMENTS */}
                  {reviewProfile.documents &&
                    reviewProfile.documents.length > 0 && (
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
                            const docCommentCount = allDocTypes.reduce(
                              (count, t) =>
                                count +
                                (reviewProfile.comments?.[t]?.filter(
                                  (c: any) => !c.isResolved,
                                ).length || 0),
                              0,
                            );
                            if (docCommentCount > 0) {
                              return (
                                <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[10px] rounded-full font-medium border border-amber-500/20">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  {docCommentCount} need
                                  {docCommentCount === 1 ? "s" : ""} attention
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
                          {reviewProfile.documents.map((doc: any) => {
                            const docComments =
                              reviewProfile.comments?.[doc.type]?.filter(
                                (c: any) => !c.isResolved,
                              ) || [];
                            const isRejected = docComments.some((c: any) =>
                              c.comment?.startsWith?.("❌ Rejected:"),
                            );
                            // "Addressed" means: admin previously rejected
                            // the doc and the vendor has since uploaded a
                            // new file. We pivot the messaging from
                            // "rejected — will be sent back" to "vendor has
                            // addressed this — review the new file" and put
                            // Accept/Reject controls back in play so the
                            // admin can decide whether the replacement
                            // resolves the rejection.
                            //
                            // Mirrors the input-field pattern earlier in
                            // this file: isAddressed = isRejected + change.
                            const isAddressed =
                              isRejected && !!doc.replacedSinceLastReview;
                            return (
                              <div
                                key={doc.type}
                                className={`p-3 rounded-xl border transition-all ${
                                  !doc.uploaded
                                    ? "bg-red-500/5 border-red-500/15"
                                    : isAddressed
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
                                        {/* "Replaced" badge — flagged when the
                                            vendor uploaded or swapped this doc
                                            after admin's last review. Lets the
                                            admin know what's new without
                                            opening every file. */}
                                        {doc.replacedSinceLastReview && (
                                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[9px] rounded font-medium uppercase tracking-wider">
                                            <RefreshCw className="w-2 h-2" />
                                            Replaced
                                          </span>
                                        )}
                                        {/* Expiry chip — shows urgency when
                                            the doc is expired or expiring
                                            within 30 days. Renders nothing
                                            for comfortably-future dates. */}
                                        <ExpiryChip
                                          expiryDate={doc.expiryDate}
                                        />
                                      </p>
                                      <p className="text-[10px] text-gray-500 truncate">
                                        {doc.uploaded
                                          ? doc.fileName || "Uploaded"
                                          : "Missing"}
                                        {/* Always show expiry date inline when
                                            present, even if it's far in the
                                            future. The chip above only
                                            highlights urgency; this gives the
                                            actual calendar date. */}
                                        {doc.uploaded && doc.expiryDate && (
                                          <span className="text-gray-600">
                                            {" "}
                                            · exp {formatDate(doc.expiryDate)}
                                          </span>
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                  {doc.uploaded && doc.fileUrl && (
                                    <button
                                      onClick={() =>
                                        setViewerDoc({
                                          url: doc.fileUrl,
                                          title: doc.label,
                                        })
                                      }
                                      className="p-1 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors flex-shrink-0"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                                {docComments.length > 0 && (
                                  <div className="mt-2">
                                    {docComments.map((c: any) => (
                                      <p
                                        key={c.id}
                                        className={`text-[10px] flex items-start gap-1 mb-1 ${c.comment.startsWith("❌ Rejected:") ? "text-red-400" : "text-amber-400"}`}
                                      >
                                        {c.comment.startsWith(
                                          "❌ Rejected:",
                                        ) ? (
                                          <XCircle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                        ) : (
                                          <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                        )}
                                        {c.comment}
                                      </p>
                                    ))}
                                    {isAddressed ? (
                                      <div className="mt-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-400 font-medium flex items-center gap-1.5">
                                        <CheckCircle2 className="w-3 h-3" />
                                        Vendor uploaded a new file — please
                                        review the replacement above
                                      </div>
                                    ) : isRejected ? (
                                      <p className="mt-1 text-[10px] text-red-400/60 italic">
                                        Will be sent back when you click Request
                                        Changes
                                      </p>
                                    ) : null}
                                    {/* Accept/Reject controls.
                                        - Hidden when the doc is in the
                                          "rejected but no replacement yet"
                                          state (admin already decided; the
                                          rejection is locked in until vendor
                                          replaces the file).
                                        - Shown when isAddressed so admin can
                                          decide if the replacement resolves
                                          the original rejection.
                                        - Shown for any open / new-comment
                                          state. */}
                                    {(!isRejected || isAddressed) &&
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
                                            placeholder="Reason..."
                                            className="flex-1 px-2 py-1 bg-neutral-900 border border-red-500/30 rounded text-white text-[10px] focus:outline-none"
                                            autoFocus
                                          />
                                          <button
                                            onClick={() =>
                                              handleRejectVendorField(
                                                doc.type,
                                                reviewProfile.id,
                                              )
                                            }
                                            disabled={
                                              !rejectFieldComment.trim() ||
                                              actionLoading ===
                                                "reject-" + doc.type
                                            }
                                            className="px-2 py-1 bg-red-500 text-white text-[10px] font-medium rounded hover:bg-red-400 disabled:opacity-50"
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
                                            className="px-1.5 py-1 text-gray-500 text-[10px]"
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2 mt-2">
                                          <button
                                            onClick={() => {
                                              docComments.forEach((c: any) =>
                                                handleResolveVendorComment(
                                                  c.id,
                                                  reviewProfile.id,
                                                ),
                                              );
                                            }}
                                            disabled={actionLoading !== null}
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
                                  </div>
                                )}
                                {/* No-comments-yet path for documents:
                                    surface a Reject button so the admin can
                                    flag this doc directly. Mirrors the input
                                    field pattern above. */}
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
                                            handleRejectVendorField(
                                              doc.type,
                                              reviewProfile.id,
                                            );
                                          if (e.key === "Escape") {
                                            setRejectingField(null);
                                            setRejectFieldComment("");
                                          }
                                        }}
                                      />
                                      <button
                                        onClick={() =>
                                          handleRejectVendorField(
                                            doc.type,
                                            reviewProfile.id,
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
                      <div
                        className={`p-3 rounded-xl border flex items-center justify-between ${
                          reviewProfile.comments?.["mou"]?.some(
                            (c: any) => !c.isResolved,
                          )
                            ? "bg-amber-500/5 border-amber-500/20"
                            : "bg-neutral-800/50 border-neutral-800"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              reviewProfile.comments?.["mou"]?.some(
                                (c: any) => !c.isResolved,
                              )
                                ? "bg-amber-500/20"
                                : "bg-green-500/20"
                            }`}
                          >
                            {reviewProfile.comments?.["mou"]?.some(
                              (c: any) => !c.isResolved,
                            ) ? (
                              <AlertTriangle className="w-4 h-4 text-amber-400" />
                            ) : (
                              <FileText className="w-4 h-4 text-green-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-white font-medium flex items-center gap-1.5 flex-wrap">
                              MOU
                              {/* REPLACED badge — mirrors the documents
                                  pattern. Surfaces when the vendor uploaded
                                  a new MOU file after admin's last review. */}
                              {reviewProfile.mou.replacedSinceLastReview && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[9px] rounded font-medium uppercase tracking-wider">
                                  <RefreshCw className="w-2 h-2" />
                                  Replaced
                                </span>
                              )}
                            </p>
                            {reviewProfile.mou.expiryDate && (
                              <p className="text-xs text-gray-500">
                                Expires:{" "}
                                {formatDate(reviewProfile.mou.expiryDate)}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            setViewerDoc({
                              url: reviewProfile.mou.fileUrl,
                              title: "MOU",
                            })
                          }
                          className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                      {(reviewProfile.comments?.["mou"]?.filter(
                        (c: any) => !c.isResolved,
                      ).length || 0) > 0 && (
                        <div className="mt-2 pl-1">
                          {(() => {
                            const mouComments = reviewProfile.comments[
                              "mou"
                            ].filter((c: any) => !c.isResolved);
                            const isRejected = mouComments.some((c: any) =>
                              c.comment?.startsWith?.("❌ Rejected:"),
                            );
                            // Mirror the documents pattern: when the MOU was
                            // re-uploaded after admin's last review, the
                            // rejection is "addressed" and the buttons come
                            // back so admin can accept or re-reject the
                            // replacement.
                            const isAddressed =
                              isRejected &&
                              !!reviewProfile.mou?.replacedSinceLastReview;
                            return (
                              <>
                                {mouComments.map((c: any) => (
                                  <p
                                    key={c.id}
                                    className={`text-[10px] flex items-start gap-1 mb-1 ${c.comment.startsWith("❌ Rejected:") ? "text-red-400" : "text-amber-400"}`}
                                  >
                                    {c.comment.startsWith("❌ Rejected:") ? (
                                      <XCircle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                    ) : (
                                      <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                                    )}
                                    {c.comment}
                                  </p>
                                ))}
                                {isAddressed ? (
                                  <div className="mt-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-400 font-medium flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Vendor uploaded a new MOU — please review
                                    the replacement above
                                  </div>
                                ) : isRejected ? (
                                  <p className="mt-1 text-[10px] text-red-400/60 italic">
                                    Will be sent back when you click Request
                                    Changes
                                  </p>
                                ) : null}
                                {/* Buttons hidden while rejected-without-
                                    replacement; shown once the vendor has
                                    uploaded a fresh MOU so admin can
                                    Accept or re-reject. */}
                                {(!isRejected || isAddressed) &&
                                  (rejectingField === "mou" ? (
                                    <div className="mt-2 flex gap-1.5">
                                      <input
                                        type="text"
                                        value={rejectFieldComment}
                                        onChange={(e) =>
                                          setRejectFieldComment(e.target.value)
                                        }
                                        placeholder="Reason..."
                                        className="flex-1 px-2 py-1 bg-neutral-900 border border-red-500/30 rounded text-white text-[10px] focus:outline-none"
                                        autoFocus
                                      />
                                      <button
                                        onClick={() =>
                                          handleRejectVendorField(
                                            "mou",
                                            reviewProfile.id,
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
                                        className="px-1.5 py-1 text-gray-500 text-[10px]"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 mt-2">
                                      <button
                                        onClick={() => {
                                          mouComments.forEach((c: any) =>
                                            handleResolveVendorComment(
                                              c.id,
                                              reviewProfile.id,
                                            ),
                                          );
                                        }}
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
                              </>
                            );
                          })()}
                        </div>
                      )}
                      {/* No-comments-yet path for MOU: surface a Reject
                          button so the admin can flag the MOU directly
                          without a generic dropdown. */}
                      {!reviewProfile.comments?.["mou"]?.filter(
                        (c: any) => !c.isResolved,
                      ).length &&
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
                                  handleRejectVendorField(
                                    "mou",
                                    reviewProfile.id,
                                  );
                                if (e.key === "Escape") {
                                  setRejectingField(null);
                                  setRejectFieldComment("");
                                }
                              }}
                            />
                            <button
                              onClick={() =>
                                handleRejectVendorField("mou", reviewProfile.id)
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
                    </div>
                  )}

                  {/* ACTIONS */}
                  {(() => {
                    const blockReasons =
                      getVendorApprovalBlockReasons(reviewProfile);
                    const canApprove = blockReasons.length === 0;
                    const hasUnresolved =
                      (reviewProfile.unresolvedCommentCount || 0) > 0;
                    return (
                      <div className="space-y-3 pt-2">
                        {hasUnresolved && (
                          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex-1">
                                <p className="text-sm text-white font-medium">
                                  {reviewProfile.unresolvedCommentCount}{" "}
                                  unresolved comment
                                  {reviewProfile.unresolvedCommentCount > 1
                                    ? "s"
                                    : ""}
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  Accept individual changes above, or resolve
                                  all at once
                                </p>
                              </div>
                              <button
                                onClick={() =>
                                  handleResolveAllVendorComments(
                                    reviewProfile.id,
                                  )
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
                        {!canApprove && !hasUnresolved && (
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
                            onClick={() =>
                              handleApproveVendor(reviewProfile.id)
                            }
                            disabled={
                              !canApprove || actionLoading === reviewProfile.id
                            }
                            className="flex-1 py-2.5 bg-green-500 text-white text-sm font-semibold rounded-xl hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Approve
                          </button>
                          <button
                            onClick={() => {
                              if (
                                (reviewProfile.unresolvedCommentCount || 0) ===
                                0
                              ) {
                                showNotification(
                                  "error",
                                  "Please add at least one comment before requesting changes — the vendor needs to know what to fix",
                                );
                                return;
                              }
                              handleRequestVendorChanges(reviewProfile.id);
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
                        className="w-full text-left bg-neutral-800 border border-neutral-700 rounded-xl p-4 hover:border-purple-500/50"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {/* Logo with Truck-icon fallback. Cast
                                because pendingReviews items don't have
                                a formal type in this file — backend
                                now returns logoUrl on every vendor row. */}
                            <ProfileImage
                              src={(p as any).logoUrl}
                              alt={p.companyName || "Vendor logo"}
                              size="sm"
                              variant="vendor"
                              shape="circle"
                              fallbackText={p.companyName}
                              fallbackIcon={
                                <Truck className="w-5 h-5 text-luxury-gold" />
                              }
                            />
                            <div>
                              <p className="text-white font-medium">
                                {p.companyName}
                              </p>
                              <p className="text-xs text-gray-500">
                                {p.contactPerson || "—"} ·{" "}
                                {p.fleet?.vehicles || 0} veh ·{" "}
                                {p.fleet?.drivers || 0} drv
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

      {/* ============ DOCUMENT VIEWER (shared component for profile review modal) ============ */}
      {viewerDoc && (
        <DocumentViewer
          url={viewerDoc.url}
          title={viewerDoc.title}
          onClose={() => setViewerDoc(null)}
        />
      )}
    </div>
  );
}
