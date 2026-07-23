// ============================================
// apps/server/src/controller/admin/vendor.controller.ts
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { getReadUrl } from "../../lib/gcs";
import { Prisma } from "../../../generated/prisma/client";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";
import { sendInvitationEmail } from "../../lib/email";
import crypto from "crypto";

// ============== VENDOR DOCUMENT TYPES ==============

const REQUIRED_VENDOR_DOCUMENTS = [
  "CR",
  "VAT",
  "CHAMBER_OF_COMMERCE",
  "BALADY",
  "NATIONAL_ADDRESS",
  "IBAN_LETTER",
] as const;

const VENDOR_DOCUMENT_LABELS: Record<string, string> = {
  CR: "Commercial Registration (CR#)",
  VAT: "VAT Certificate",
  CHAMBER_OF_COMMERCE: "Chamber of Commerce",
  BALADY: "Balady License",
  NATIONAL_ADDRESS: "National Address",
  IBAN_LETTER: "IBAN Letter",
};

// ============== VEHICLE DOCUMENT TYPES ==============
// These must match the vendor portal's REQUIRED_VEHICLE_DOCUMENTS exactly
const REQUIRED_VEHICLE_DOCUMENTS = [
  "PHOTO_FRONT",
  "PHOTO_BACK",
  "PHOTO_LEFT",
  "PHOTO_RIGHT",
  "PHOTO_INTERIOR_FRONT",
  "PHOTO_INTERIOR_BACK",
  "NUMBER_PLATE_FRONT",
  "NUMBER_PLATE_BACK",
  "ODOMETER",
  "INSURANCE",
  "ISTIMARA",
] as const;

const VEHICLE_DOCUMENT_LABELS: Record<string, string> = {
  PHOTO_FRONT: "Vehicle Photo (Front)",
  PHOTO_BACK: "Vehicle Photo (Back)",
  PHOTO_LEFT: "Vehicle Photo (Left)",
  PHOTO_RIGHT: "Vehicle Photo (Right)",
  PHOTO_INTERIOR_FRONT: "Interior (Front)",
  PHOTO_INTERIOR_BACK: "Interior (Back)",
  NUMBER_PLATE_FRONT: "Number Plate (Front)",
  NUMBER_PLATE_BACK: "Number Plate (Back)",
  ODOMETER: "Odometer Reading",
  INSURANCE: "Car Insurance",
  ISTIMARA: "Istimara (Registration)",
};

// ============== DRIVER DOCUMENT TYPES ==============
const REQUIRED_DRIVER_DOCUMENTS = [
  "PROFILE_PHOTO",
  "IQAMA_NATIONAL_ID",
  "DRIVING_LICENSE",
] as const;

const DRIVER_DOCUMENT_LABELS: Record<string, string> = {
  PROFILE_PHOTO: "Driver Photo",
  IQAMA_NATIONAL_ID: "Iqama / National ID",
  DRIVING_LICENSE: "Driving License",
};

// ============== SUMMARY & STATS ==============

/**
 * Get vendor summary cards
 * Cards: Total Vendors, Active Vendors, Pending Approvals, Total Fleet & Drivers
 */
export const getVendorSummary = asyncWrapper(
  async (req: Request, res: Response) => {
    const [
      totalVendors,
      activeVendors,
      pendingApproval,
      fleetStats,
      pendingBankRequests,
    ] = await Promise.all([
      // Total vendors (exclude SUSPENDED)
      prisma.vendor.count({
        where: { status: { not: "SUSPENDED" } },
      }),
      // Active vendors
      prisma.vendor.count({ where: { status: "APPROVED" } }),
      // Pending approval (PENDING_REVIEW)
      prisma.vendor.count({ where: { status: "PENDING_REVIEW" } }),
      // Total fleet and drivers from APPROVED vendors
      prisma.vendor.findMany({
        where: { status: "APPROVED" },
        select: {
          _count: {
            select: { vehicles: true, drivers: { where: { isActive: true } } },
          },
        },
      }),
      // Pending bank update requests
      prisma.vendorBankUpdateRequest.count({ where: { status: "PENDING" } }),
    ]);

    const totalVehicles = fleetStats.reduce(
      (sum, v) => sum + v._count.vehicles,
      0,
    );
    const totalDrivers = fleetStats.reduce(
      (sum, v) => sum + v._count.drivers,
      0,
    );

    res.json({
      success: true,
      data: {
        cards: {
          totalVendors,
          activeVendors,
          pendingApproval,
          fleet: {
            totalVehicles,
            totalDrivers,
          },
        },
        notifications: {
          pendingReview: pendingApproval,
          pendingBankRequests,
        },
      },
    });
  },
);

/**
 * Get notification count for sidebar badge
 * Accumulative: profile reviews + bank update requests + driver reviews + vehicle reviews
 */
export const getVendorNotifications = asyncWrapper(
  async (req: Request, res: Response) => {
    const [
      pendingReviewCount,
      pendingBankRequests,
      pendingDriverReviews,
      pendingVehicleReviews,
      pendingDriverChangeRequests,
      pendingVehicleChangeRequests,
      pendingVendorProfileChangeRequests,
    ] = await Promise.all([
      prisma.vendor.count({ where: { status: "PENDING_REVIEW" } }),
      prisma.vendorBankUpdateRequest.count({ where: { status: "PENDING" } }),
      prisma.driver.count({ where: { status: "PENDING_REVIEW" } }),
      prisma.vehicle.count({ where: { status: "PENDING_REVIEW" } }),
      prisma.driverReviewRequest.count({
        where: { status: "PENDING", requestType: "VENDOR_INITIATED" },
      }),
      prisma.vehicleReviewRequest.count({
        where: { status: "PENDING", requestType: "VENDOR_INITIATED" },
      }),
      // Vendor-initiated profile change requests awaiting admin approval —
      // mirrors the driver/vehicle counts above so the admin UI gets a badge.
      prisma.vendorProfileReviewRequest.count({
        where: { status: "PENDING", requestType: "VENDOR_INITIATED" },
      }),
    ]);

    res.json({
      success: true,
      data: {
        pendingReview: pendingReviewCount,
        pendingBankRequests,
        pendingDriverReviews,
        pendingVehicleReviews,
        pendingDriverChangeRequests,
        pendingVehicleChangeRequests,
        pendingVendorProfileChangeRequests,
        total:
          pendingReviewCount +
          pendingBankRequests +
          pendingDriverReviews +
          pendingVehicleReviews +
          pendingDriverChangeRequests +
          pendingVehicleChangeRequests +
          pendingVendorProfileChangeRequests,
      },
    });
  },
);

// ============== PENDING FLEET REVIEWS (banner data) ==============

/**
 * Get vendors that have pending drivers OR vehicles awaiting initial approval.
 * Powers the "X drivers need approval" / "Y vehicles need approval" banner on the
 * vendor management page. Returns one entry per vendor with their pending counts.
 */
export const getVendorsWithPendingFleetReviews = asyncWrapper(
  async (_req: Request, res: Response) => {
    const [driverGroups, vehicleGroups] = await Promise.all([
      prisma.driver.groupBy({
        by: ["vendorId"],
        where: { status: "PENDING_REVIEW" },
        _count: { id: true },
      }),
      prisma.vehicle.groupBy({
        by: ["vendorId"],
        where: { status: "PENDING_REVIEW" },
        _count: { id: true },
      }),
    ]);

    const vendorIds = Array.from(
      new Set([
        ...driverGroups.map((g) => g.vendorId),
        ...vehicleGroups.map((g) => g.vendorId),
      ]),
    );

    if (vendorIds.length === 0) {
      res.json({ success: true, data: { vendors: [] } });
      return;
    }

    const vendors = await prisma.vendor.findMany({
      where: { id: { in: vendorIds } },
      select: { id: true, companyName: true },
    });

    const driverCountMap = new Map(
      driverGroups.map((g) => [g.vendorId, g._count.id]),
    );
    const vehicleCountMap = new Map(
      vehicleGroups.map((g) => [g.vendorId, g._count.id]),
    );

    const data = vendors
      .map((v) => ({
        id: v.id,
        companyName: v.companyName,
        pendingDrivers: driverCountMap.get(v.id) || 0,
        pendingVehicles: vehicleCountMap.get(v.id) || 0,
      }))
      .sort(
        (a, b) =>
          b.pendingDrivers +
          b.pendingVehicles -
          (a.pendingDrivers + a.pendingVehicles),
      );

    res.json({ success: true, data: { vendors: data } });
  },
);

// ============== LIST VENDORS ==============

/**
 * Get all vendors with filters, search, pagination
 * Columns: Company Name & CR#, Contact Person, Fleet Size (vehicles/drivers),
 *          Total Earnings, Status, Actions
 */
export const getVendors = asyncWrapper(async (req: Request, res: Response) => {
  const { status, search, page = "1", limit = "10" } = req.query;

  const where: any = {};

  // Status filter
  if (status && status !== "all") {
    where.status = status;
  }

  // Search filter
  if (search) {
    const searchStr = search as string;
    where.OR = [
      { companyName: { contains: searchStr, mode: "insensitive" } },
      { crNumber: { contains: searchStr, mode: "insensitive" } },
      { contactPerson: { contains: searchStr, mode: "insensitive" } },
      { user: { email: { contains: searchStr, mode: "insensitive" } } },
      { user: { name: { contains: searchStr, mode: "insensitive" } } },
    ];
  }

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const [vendors, total, statusCounts] = await Promise.all([
    prisma.vendor.findMany({
      where,
      skip,
      take: parseInt(limit as string),
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            firstName: true,
            lastName: true,
          },
        },
        _count: {
          select: {
            vehicles: true,
            drivers: { where: { isActive: true } },
            bookings: true,
          },
        },
        // Doc-health for the admin list chip. See partner controller
        // for the equivalent treatment and rationale.
        vendorDocuments: {
          select: { type: true, expiryDate: true },
        },
      },
    }),
    prisma.vendor.count({ where }),
    // Get counts per status for filter badges
    prisma.vendor.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
  ]);

  // Get total earnings per vendor (sum of completed booking totalPrice)
  const vendorIds = vendors.map((v) => v.id);
  const earningsData = await prisma.booking.groupBy({
    by: ["vendorId"],
    where: {
      vendorId: { in: vendorIds },
      status: "COMPLETED",
    },
    _sum: { totalPrice: true },
  });
  const earningsMap = new Map(
    earningsData.map((e) => [e.vendorId, e._sum.totalPrice]),
  );

  // Get pending driver/vehicle review counts per vendor
  const pendingDriverCounts = await prisma.driver.groupBy({
    by: ["vendorId"],
    where: {
      vendorId: { in: vendorIds },
      status: "PENDING_REVIEW",
    },
    _count: { id: true },
  });
  const pendingDriverMap = new Map(
    pendingDriverCounts.map((d) => [d.vendorId, d._count.id]),
  );

  const pendingVehicleCounts = await prisma.vehicle.groupBy({
    by: ["vendorId"],
    where: {
      vendorId: { in: vendorIds },
      status: "PENDING_REVIEW",
    },
    _count: { id: true },
  });
  const pendingVehicleMap = new Map(
    pendingVehicleCounts.map((v) => [v.vendorId, v._count.id]),
  );

  // Get pending bank request counts per vendor
  const pendingBankReqCounts = await prisma.vendorBankUpdateRequest.groupBy({
    by: ["vendorId"],
    where: {
      vendorId: { in: vendorIds },
      status: "PENDING",
    },
    _count: { id: true },
  });
  const pendingBankReqMap = new Map(
    pendingBankReqCounts.map((r) => [r.vendorId, r._count.id]),
  );

  // Build the per-vendor response shape, signing the logo URL where
  // present. Promise.all so signing fans out concurrently rather than
  // sequentially. Same pattern used in getPartners and elsewhere.
  //
  // Each row also carries `docHealth` — counts of expired vs
  // expiring-soon (≤30d) documents including the MOU. The admin list
  // chip uses this to flag rows that need attention. MOU expiry
  // additionally triggers auto-suspension (see lib/cron.ts); the
  // chip just makes the situation visible at a glance.
  const nowMs = Date.now();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const computeDocHealth = (
    docs: Array<{ type: string; expiryDate: Date | null }>,
    mouExpiry: Date | null,
  ) => {
    let expiredCount = 0;
    let expiringSoonCount = 0;
    const expiredTypes: string[] = [];
    const expiringSoonTypes: string[] = [];
    const check = (label: string, expiry: Date | null) => {
      if (!expiry) return;
      const diff = expiry.getTime() - nowMs;
      if (diff < 0) {
        expiredCount++;
        expiredTypes.push(label);
      } else if (diff <= THIRTY_DAYS_MS) {
        expiringSoonCount++;
        expiringSoonTypes.push(label);
      }
    };
    docs.forEach((d) => check(d.type, d.expiryDate));
    check("MOU", mouExpiry);
    return {
      expiredCount,
      expiringSoonCount,
      expiredTypes,
      expiringSoonTypes,
    };
  };

  const formattedVendors = await Promise.all(
    vendors.map(async (vendor) => ({
      id: vendor.id,
      companyName: vendor.companyName,
      logoUrl: await getReadUrl((vendor as any).logoUrl ?? null),
      crNumber: vendor.crNumber,
      contactPerson:
        vendor.contactPerson ||
        vendor.user?.name ||
        `${vendor.user?.firstName || ""} ${vendor.user?.lastName || ""}`.trim(),
      email: vendor.user?.email,
      phone: vendor.contactPhone || vendor.user?.phone,
      fleet: {
        vehicles: vendor._count.vehicles,
        drivers: vendor._count.drivers,
      },
      totalEarnings: earningsMap.get(vendor.id) || 0,
      totalBookings: vendor._count.bookings,
      status: vendor.status,
      rating: vendor.rating,
      createdAt: vendor.createdAt,
      invitationSentAt: vendor.invitationSentAt,
      profileSubmittedAt: vendor.profileSubmittedAt,
      pendingDrivers: pendingDriverMap.get(vendor.id) || 0,
      pendingVehicles: pendingVehicleMap.get(vendor.id) || 0,
      hasPendingBankRequest: (pendingBankReqMap.get(vendor.id) || 0) > 0,
      docHealth: computeDocHealth(
        vendor.vendorDocuments,
        (vendor as any).mouExpiryDate ?? null,
      ),
    })),
  );

  // Build status counts object
  const statusCountsObj: Record<string, number> = {
    all: 0,
    INVITED: 0,
    PENDING_REVIEW: 0,
    CHANGES_REQUESTED: 0,
    APPROVED: 0,
    SUSPENDED: 0,
  };
  statusCounts.forEach((sc) => {
    statusCountsObj[sc.status] = sc._count.id;
  });
  // Recalculate "all" from the sum (not from filtered total)
  statusCountsObj.all = Object.entries(statusCountsObj)
    .filter(([key]) => key !== "all")
    .reduce((sum, [, count]) => sum + count, 0);

  res.json({
    success: true,
    data: {
      vendors: formattedVendors,
      statusCounts: statusCountsObj,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    },
  });
});

// ============== VENDOR DETAILS ==============

/**
 * Get single vendor details
 * Shows: fleet overview, MOU & expiry, recent bookings, alerts, company info, bank details
 */
export const getVendorDetails = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            firstName: true,
            lastName: true,
            createdAt: true,
          },
        },
        reviewComments: {
          where: { isResolved: false },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            vehicles: true,
            drivers: { where: { isActive: true } },
            bookings: true,
          },
        },
      },
    });

    if (!vendor) {
      throw new NotFoundError("Vendor");
    }
    const pendingBankRequest = await prisma.vendorBankUpdateRequest.findFirst({
      where: {
        vendorId: id,
        status: "PENDING",
      },
      select: {
        id: true,
        requestedBankName: true,
        requestedBankAccountNumber: true,
        requestedBankIban: true,
        reason: true,
        createdAt: true,
      },
    });

    // Get fleet overview (active vs total)
    const [activeVehicles, activeDrivers] = await Promise.all([
      prisma.vehicle.count({
        where: { vendorId: id, isActive: true, status: "APPROVED" },
      }),
      prisma.driver.count({
        where: { vendorId: id, isActive: true, status: "APPROVED" },
      }),
    ]);

    // Get recent 3 bookings
    const recentBookings = await prisma.booking.findMany({
      where: { vendorId: id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        bookingRef: true,
        guestName: true,
        tripDate: true,
        tripTime: true,
        pickupAddress: true,
        dropoffAddress: true,
        vehicleClass: true,
        totalPrice: true,
        status: true,
        createdAt: true,
      },
    });

    // Get total earnings
    const earningsResult = await prisma.booking.aggregate({
      where: { vendorId: id, status: "COMPLETED" },
      _sum: { totalPrice: true },
      _count: { id: true },
    });

    // Get document expiry alerts
    const now = new Date();
    const twoMonthsFromNow = new Date();
    twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);

    const [expiringDriverDocs, expiringVehicleDocs] = await Promise.all([
      prisma.driverDocument.findMany({
        where: {
          driver: { vendorId: id },
          expiryDate: { lte: twoMonthsFromNow, gte: now },
        },
        include: { driver: { select: { firstName: true, lastName: true } } },
        orderBy: { expiryDate: "asc" },
      }),
      prisma.vehicleDocument.findMany({
        where: {
          vehicle: { vendorId: id },
          expiryDate: { lte: twoMonthsFromNow, gte: now },
        },
        include: {
          vehicle: { select: { make: true, model: true, plateNumber: true } },
        },
        orderBy: { expiryDate: "asc" },
      }),
    ]);

    // Get expired documents
    const [expiredDriverDocs, expiredVehicleDocs] = await Promise.all([
      prisma.driverDocument.findMany({
        where: {
          driver: { vendorId: id },
          expiryDate: { lt: now },
        },
        include: { driver: { select: { firstName: true, lastName: true } } },
      }),
      prisma.vehicleDocument.findMany({
        where: {
          vehicle: { vendorId: id },
          expiryDate: { lt: now },
        },
        include: {
          vehicle: { select: { make: true, model: true, plateNumber: true } },
        },
      }),
    ]);

    const alerts = {
      expiringDocuments: [
        ...expiringDriverDocs.map((d) => ({
          type: "DRIVER_DOCUMENT",
          documentType: d.type,
          entityName: `${d.driver.firstName} ${d.driver.lastName}`,
          expiryDate: d.expiryDate,
          daysUntilExpiry: Math.ceil(
            (d.expiryDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          ),
        })),
        ...expiringVehicleDocs.map((d) => ({
          type: "VEHICLE_DOCUMENT",
          documentType: d.type,
          entityName: `${d.vehicle.make} ${d.vehicle.model} (${d.vehicle.plateNumber})`,
          expiryDate: d.expiryDate,
          daysUntilExpiry: Math.ceil(
            (d.expiryDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          ),
        })),
      ],
      expiredDocuments: [
        ...expiredDriverDocs.map((d) => ({
          type: "DRIVER_DOCUMENT",
          documentType: d.type,
          entityName: `${d.driver.firstName} ${d.driver.lastName}`,
          expiryDate: d.expiryDate,
        })),
        ...expiredVehicleDocs.map((d) => ({
          type: "VEHICLE_DOCUMENT",
          documentType: d.type,
          entityName: `${d.vehicle.make} ${d.vehicle.model} (${d.vehicle.plateNumber})`,
          expiryDate: d.expiryDate,
        })),
      ],
      mouExpiry: vendor.mouExpiryDate
        ? isMouExpiringSoon(vendor.mouExpiryDate)
        : null,
    };

    // Logo URL — signed so admin's vendor detail drawer can render the
    // company branding alongside profile data.
    const logoReadUrl = await getReadUrl((vendor as any).logoUrl ?? null);
    // MOU file URL: convert the raw GCS path stored in mouFileUrl into
    // a signed read URL the admin's document viewer can actually open.
    // Without this the View button receives a `gs://...` string and
    // fails silently. Mirror of how the review-detail endpoint
    // (getVendorForReview) already does this.
    const mouReadUrl = await getReadUrl(vendor.mouFileUrl);

    res.json({
      success: true,
      data: {
        id: vendor.id,
        companyName: vendor.companyName,
        logoUrl: logoReadUrl,
        status: vendor.status,
        rating: vendor.rating,
        createdAt: vendor.createdAt,
        user: vendor.user,
        pendingBankRequest: pendingBankRequest || null,
        companyInfo: {
          companyName: vendor.companyName,
          crNumber: vendor.crNumber,
          vatNumber: vendor.vatNumber,
          chamberOfCommerceNumber:
            (vendor as any).chamberOfCommerceNumber ?? null,
          baladyNumber: (vendor as any).baladyNumber ?? null,
          nationalAddress: (vendor as any).nationalAddress ?? null,
          contactPerson: vendor.contactPerson,
          contactPhone: vendor.contactPhone,
          email: vendor.user?.email,
          address: vendor.address,
        },
        bankDetails: {
          bankName: vendor.bankName,
          bankAccountNumber: vendor.bankAccountNumber,
          bankIban: vendor.bankIban,
        },
        fleet: {
          totalVehicles: vendor._count.vehicles,
          activeVehicles,
          totalDrivers: vendor._count.drivers,
          activeDrivers,
        },
        mou: {
          // Signed URL for the viewer + an `isUploaded` boolean so
          // the admin UI can render an unambiguous "not uploaded yet"
          // state instead of just hiding the section silently when
          // mouFileUrl is null.
          fileUrl: mouReadUrl,
          isUploaded: !!vendor.mouFileUrl,
          expiryDate: vendor.mouExpiryDate,
          uploadedAt: vendor.mouUploadedAt,
          expiryWarning: vendor.mouExpiryDate
            ? isMouExpiringSoon(vendor.mouExpiryDate)
            : null,
        },
        earnings: {
          total: earningsResult._sum.totalPrice || 0,
          completedTrips: earningsResult._count.id,
        },
        recentBookings,
        alerts,
        unresolvedComments: vendor.reviewComments.length,
      },
    });
  },
);

// Helper to check if MOU is expiring within 2 months
function isMouExpiringSoon(expiryDate: Date): {
  isExpiring: boolean;
  daysLeft: number;
  isExpired: boolean;
} {
  const now = new Date();
  const twoMonthsFromNow = new Date();
  twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);

  const daysLeft = Math.ceil(
    (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  const isExpired = expiryDate < now;

  if (isExpired || expiryDate <= twoMonthsFromNow) {
    return { isExpiring: true, daysLeft, isExpired };
  }
  return { isExpiring: false, daysLeft, isExpired };
}

// ============== ONBOARD VENDOR (INVITATION) ==============

/**
 * Onboard a new vendor
 * Admin provides: companyName, email, bankName, bankAccountNumber, bankIban
 * Creates placeholder user + vendor, sends invitation link
 */
export const onboardVendor = asyncWrapper(
  async (req: Request, res: Response) => {
    const { companyName, email } = req.body;

    if (!companyName || !email) {
      throw new BadRequestError("companyName and email are required");
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new BadRequestError("A user with this email already exists");
    }

    // Check if vendor with same company name exists
    const existingVendor = await prisma.vendor.findFirst({
      where: { companyName: { equals: companyName, mode: "insensitive" } },
    });
    if (existingVendor) {
      throw new BadRequestError(
        "A vendor with this company name already exists",
      );
    }

    // Generate invitation token + 72-hour expiry (matches partner side)
    const invitationToken = crypto.randomBytes(32).toString("hex");
    const invitationExpiresAt = new Date();
    invitationExpiresAt.setHours(invitationExpiresAt.getHours() + 72);

    // Create placeholder user
    const user = await prisma.user.create({
      data: {
        email,
        name: companyName,
        role: "VENDOR",
        emailVerified: false,
      },
    });

    // Create vendor with INVITED status and bank details
    const vendor = await prisma.vendor.create({
      data: {
        userId: user.id,
        companyName,
        status: "INVITED",
        invitationToken,
        invitationSentAt: new Date(),
        invitationExpiresAt,
        invitedByUserId: req.user!.id,
      },
    });

    // Log the invitation
    await prisma.vendorInvitationLog.create({
      data: {
        vendorId: vendor.id,
        email,
        companyName,
        action: "SENT",
        sentByUserId: req.user!.id,
        sentByName: req.user!.name || req.user!.email,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "VENDOR_ONBOARDED",
        entity: "Vendor",
        entityId: vendor.id,
        changes: {
          companyName,
          email,
        },
      },
    });

    // Fire the invitation email. Failure does NOT roll back the vendor
    // record — admin can re-trigger via the Resend Invitation button.
    // We surface the email status in the response so the admin sees a
    // clear warning if the send failed.
    const emailResult = await sendInvitationEmail({
      to: email,
      companyName,
      inviteToken: invitationToken,
      type: "vendor",
      expiresInHours: 72,
    });

    if (!emailResult.ok) {
      console.error(
        `[onboardVendor] Email send failed for ${email}: ${emailResult.error}`,
      );
    }

    res.json({
      success: true,
      message: emailResult.ok
        ? `Invitation sent to ${email}`
        : `Vendor created, but invitation email failed to send. Use Resend to retry.`,
      data: {
        vendorId: vendor.id,
        companyName,
        email,
        invitationSentAt: vendor.invitationSentAt,
        invitationExpiresAt: vendor.invitationExpiresAt,
        emailSent: emailResult.ok,
        // Include token in dev only so admin can paste-test without
        // needing actual email delivery.
        invitationToken:
          process.env.NODE_ENV === "development" ? invitationToken : undefined,
      },
    });
  },
);

/**
 * Resend invitation to a vendor
 */
export const resendVendorInvitation = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: { user: { select: { email: true } } },
    });

    if (!vendor) {
      throw new NotFoundError("Vendor");
    }

    if (vendor.status !== "INVITED") {
      throw new BadRequestError(
        "Can only resend invitation to vendors with INVITED status",
      );
    }

    // Generate new token + 72-hour expiry (matches initial invite)
    const invitationToken = crypto.randomBytes(32).toString("hex");
    const invitationExpiresAt = new Date();
    invitationExpiresAt.setHours(invitationExpiresAt.getHours() + 72);

    await prisma.vendor.update({
      where: { id },
      data: {
        invitationToken,
        invitationSentAt: new Date(),
        invitationExpiresAt,
      },
    });

    // Log the resend
    await prisma.vendorInvitationLog.create({
      data: {
        vendorId: vendor.id,
        email: vendor.user.email,
        companyName: vendor.companyName,
        action: "RESENT",
        sentByUserId: req.user!.id,
        sentByName: req.user!.name || req.user!.email,
      },
    });

    // Fire the email. Same template + flow as the initial invitation —
    // recipient sees no difference between the first send and a resend.
    const emailResult = await sendInvitationEmail({
      to: vendor.user.email,
      companyName: vendor.companyName,
      inviteToken: invitationToken,
      type: "vendor",
      expiresInHours: 72,
    });

    if (!emailResult.ok) {
      console.error(
        `[resendVendorInvitation] Email send failed for ${vendor.user.email}: ${emailResult.error}`,
      );
    }

    res.json({
      success: true,
      message: emailResult.ok
        ? "Invitation resent successfully"
        : "Token regenerated, but email failed to send. Try again.",
      data: {
        emailSent: emailResult.ok,
        invitationToken:
          process.env.NODE_ENV === "development" ? invitationToken : undefined,
      },
    });
  },
);

// ============== PROFILE REVIEW ==============

/**
 * Get vendors pending profile review
 */
export const getVendorPendingReviews = asyncWrapper(
  async (req: Request, res: Response) => {
    const [pendingVendors, recentlyProcessed] = await Promise.all([
      // Vendors pending review
      prisma.vendor.findMany({
        where: { status: "PENDING_REVIEW" },
        orderBy: { profileSubmittedAt: "asc" },
        include: {
          user: { select: { id: true, email: true, name: true } },
          _count: {
            select: { vehicles: true, drivers: { where: { isActive: true } } },
          },
        },
      }),
      // Recently processed (approved or changes requested in last 7 days)
      prisma.vendor.findMany({
        where: {
          status: { in: ["APPROVED", "CHANGES_REQUESTED"] },
          profileReviewedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { profileReviewedAt: "desc" },
        take: 10,
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        pendingCount: pendingVendors.length,
        pending: pendingVendors.map((v) => ({
          id: v.id,
          companyName: v.companyName,
          contactPerson: v.contactPerson || v.user?.name,
          submittedAt: v.profileSubmittedAt,
          fleet: { vehicles: v._count.vehicles, drivers: v._count.drivers },
          user: v.user,
        })),
        recentlyProcessed: recentlyProcessed.map((v) => ({
          id: v.id,
          companyName: v.companyName,
          contactPerson: v.contactPerson || v.user?.name,
          status: v.status,
          reviewedAt: v.profileReviewedAt,
        })),
      },
    });
  },
);

/**
 * Get vendor profile for review (detailed view)
 */
export const getVendorProfileForReview = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true, phone: true } },
        reviewComments: { orderBy: { createdAt: "desc" } },
        vendorDocuments: { orderBy: { type: "asc" } },
      },
    });

    if (!vendor) {
      throw new NotFoundError("Vendor");
    }

    // Group comments by field. We include both live (unresolved) and comments
    // resolved during THIS review round only — old resolved comments from
    // earlier rounds (previous accepts, previous rejections that were
    // resolved) would otherwise still light up the ACCEPTED chip forever.
    // Round boundary: resolved AFTER the last admin review, or ever-resolved
    // when there hasn't been a review yet (first submission cycle). Mirrors
    // partner's getPartnerProfileForReview.
    const lastReviewAt = (vendor as any).profileReviewedAt?.getTime() ?? 0;
    const commentsByField: Record<string, any[]> = {};
    vendor.reviewComments.forEach((comment) => {
      const inCurrentRound =
        !comment.isResolved ||
        (comment.resolvedAt && comment.resolvedAt.getTime() > lastReviewAt);
      if (!inCurrentRound) return;
      if (!commentsByField[comment.fieldName]) {
        commentsByField[comment.fieldName] = [];
      }
      commentsByField[comment.fieldName].push({
        id: comment.id,
        comment: comment.comment,
        // Enum discriminator so the frontend can render CHANGED/REJECTED/
        // ACCEPTED chips based on type without prefix-parsing.
        type: (comment as any).type,
        isResolved: comment.isResolved,
        resolvedAt: comment.resolvedAt,
        createdAt: comment.createdAt,
      });
    });

    const unresolvedCommentCount = vendor.reviewComments.filter(
      (c) => !c.isResolved,
    ).length;

    // Build documents map: type → doc info (or null if missing) — mirrors partner
    const uploadedDocsMap = new Map(
      vendor.vendorDocuments.map((d) => [d.type, d] as const),
    );

    // "Replaced since last review" detection.
    //
    // Original (incorrect) approach: compare `doc.updatedAt` against
    // `vendor.profileReviewedAt`. That timestamp only bumps when admin clicks
    // Approve or Request Changes at the bottom — NOT when admin rejects an
    // individual field. So if the vendor's profile had ever been
    // approved/changes-requested before, the OLD profileReviewedAt would
    // still be earlier than the doc's last upload, and the flag would fire
    // immediately after a fresh per-field rejection — making it look like
    // the vendor had already addressed the rejection the admin just made.
    //
    // Correct approach: per-doc, find the most recent UNRESOLVED rejection
    // comment for that doc and compare `doc.updatedAt` against that
    // comment's createdAt. The flag should only fire when the doc has been
    // re-uploaded AFTER the rejection was made — i.e., the vendor has
    // actually done something about it.
    //
    // Resolved comments are ignored (those rejections already concluded).
    // If a doc has no unresolved rejection at all, the flag is N/A and we
    // return false (the doc is in a clean / new-comment / non-rejected
    // state, so "addressed" doesn't apply).
    function computeReplaced(
      docType: string,
      docUpdatedAt: Date | null | undefined,
    ): boolean {
      if (!docUpdatedAt) return false;
      const rejectionComments = (commentsByField[docType] || []).filter(
        (c: any) => !c.isResolved && c.comment?.startsWith?.("❌ Rejected:"),
      );
      if (rejectionComments.length === 0) return false;
      // Most recent rejection's createdAt
      const mostRecent: Date = rejectionComments.reduce((acc: Date, c: any) => {
        const t = new Date(c.createdAt);
        return t > acc ? t : acc;
      }, new Date(0));
      return new Date(docUpdatedAt).getTime() > mostRecent.getTime();
    }

    const documents = REQUIRED_VENDOR_DOCUMENTS.map((type) => {
      const doc = uploadedDocsMap.get(type);
      const replacedSinceLastReview =
        !!doc && computeReplaced(type, doc.updatedAt);
      return {
        type,
        label: VENDOR_DOCUMENT_LABELS[type],
        uploaded: !!doc,
        fileUrl: doc?.fileUrl || null,
        fileName: doc?.fileName || null,
        expiryDate: doc?.expiryDate || null,
        uploadedAt: doc?.createdAt || null,
        updatedAt: doc?.updatedAt || null,
        replacedSinceLastReview,
      };
    });

    const missingDocuments = documents
      .filter((d) => !d.uploaded)
      .map((d) => d.label);

    const allDocumentsUploaded = missingDocuments.length === 0;

    // Sign each document URL so the frontend viewer can fetch them
    const documentsWithUrls = await Promise.all(
      documents.map(async (doc) => ({
        ...doc,
        fileUrl: doc.fileUrl ? await getReadUrl(doc.fileUrl) : null,
        // Preserve raw GCS path for the snapshot-diff that drives the
        // "Replaced" / "Addressed" indicators in the admin review modal.
        // Signed URLs rotate per request and can't be used as identifiers.
        filePath: doc.fileUrl || null,
      })),
    );

    const mouReadUrl = await getReadUrl(vendor.mouFileUrl);
    // Logo URL — admin needs to see the vendor's branding during
    // review. Signed for read access since raw GCS paths won't render.
    const logoReadUrl = await getReadUrl((vendor as any).logoUrl ?? null);

    res.json({
      success: true,
      data: {
        id: vendor.id,
        status: vendor.status,
        companyName: vendor.companyName,
        logoUrl: logoReadUrl,
        profile: {
          contactPerson: vendor.contactPerson,
          email: vendor.user?.email,
          phone: vendor.contactPhone || vendor.user?.phone,
          companyName: vendor.companyName,
          crNumber: vendor.crNumber,
          vatNumber: vendor.vatNumber,
          chamberOfCommerceNumber:
            (vendor as any).chamberOfCommerceNumber ?? null,
          baladyNumber: (vendor as any).baladyNumber ?? null,
          nationalAddress: (vendor as any).nationalAddress ?? null,
          address: vendor.address,
          bankName: vendor.bankName,
          bankAccountNumber: vendor.bankAccountNumber,
          bankIban: vendor.bankIban,
        },
        mou: {
          fileUrl: mouReadUrl,
          // Mirror of the detail endpoint — gives the admin UI a clean
          // way to render "not uploaded yet" rather than hiding the
          // entire MOU card when the file is missing.
          isUploaded: !!vendor.mouFileUrl,
          expiryDate: vendor.mouExpiryDate,
          uploadedAt: (vendor as any).mouUploadedAt ?? null,
          expiryWarning: vendor.mouExpiryDate
            ? isMouExpiringSoon(vendor.mouExpiryDate)
            : null,
          // Same per-field rejection comparison as documents (see
          // computeReplaced above): true when the MOU was uploaded AFTER the
          // most recent unresolved rejection comment for "mou". Prevents the
          // flag from firing immediately after admin clicks Reject — vendor
          // has to actually replace the file first.
          replacedSinceLastReview: computeReplaced(
            "mou",
            (vendor as any).mouUploadedAt,
          ),
        },
        documents: documentsWithUrls,
        allDocumentsUploaded,
        missingDocuments,
        comments: commentsByField,
        unresolvedCommentCount,
        submittedAt: vendor.profileSubmittedAt,
        previousProfile: (vendor as any).profileSnapshot || null,
      },
    });
  },
);

/**
 * Add review comment on a specific field
 */
export const addVendorReviewComment = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
      fieldName,
      comment,
      type: explicitType,
      resolveOnCreate,
    } = req.body as {
      fieldName?: string;
      comment?: string;
      /**
       * Explicit comment type. Mirrors partner. When omitted, we fall
       * back to prefix detection for callers that haven't been updated
       * yet (`❌ Rejected:` → ADMIN_REJECTION). New code should always
       * pass an explicit type.
       */
      type?: "ADMIN_REJECTION" | "VENDOR_REQUEST" | "ADMIN_COMMENT";
      /**
       * When true, the backend creates the comment already resolved and
       * skips the vendor-facing notification. Used for admin per-field
       * Accept on CHANGED fields — writes a durable "admin accepted this
       * value" audit-trail entry without pinging the vendor.
       */
      resolveOnCreate?: boolean;
    };

    if (!fieldName || !comment) {
      throw new BadRequestError("fieldName and comment are required");
    }

    const validFields = [
      // Profile fields
      "contactPerson",
      "email",
      "phone",
      "companyName",
      "crNumber",
      "vatNumber",
      "chamberOfCommerceNumber",
      "baladyNumber",
      "nationalAddress",
      "address",
      // Bank fields
      "bankName",
      "bankAccountNumber",
      "bankIban",
      // MOU
      "mou",
      // Document types (matches REQUIRED_VENDOR_DOCUMENTS)
      "CR",
      "VAT",
      "CHAMBER_OF_COMMERCE",
      "BALADY",
      "NATIONAL_ADDRESS",
      "IBAN_LETTER",
    ];

    if (!validFields.includes(fieldName)) {
      throw new BadRequestError(
        `Invalid fieldName. Must be one of: ${validFields.join(", ")}`,
      );
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: {
        vendorDocuments: { select: { type: true, fileUrl: true } },
      },
    });
    if (!vendor) {
      throw new NotFoundError("Vendor");
    }

    // Friendly label for the field, used in the notification body. The
    // frontend's `VENDOR_PROFILE_FIELD_LABELS` does this richer mapping,
    // but for a one-line notification a humanised key is enough.
    const fieldLabelMap: Record<string, string> = {
      contactPerson: "Contact Person",
      email: "Email",
      phone: "Phone",
      companyName: "Company Name",
      crNumber: "CR Number",
      vatNumber: "VAT Number",
      chamberOfCommerceNumber: "Chamber of Commerce Number",
      baladyNumber: "Balady Number",
      nationalAddress: "National Address",
      address: "Address",
      bankName: "Bank Name",
      bankAccountNumber: "Bank Account Number",
      bankIban: "IBAN",
      mou: "MOU",
      CR: "Commercial Registration",
      VAT: "VAT Certificate",
      CHAMBER_OF_COMMERCE: "Chamber of Commerce",
      BALADY: "Balady License",
      NATIONAL_ADDRESS: "National Address",
      IBAN_LETTER: "IBAN Letter",
    };
    const fieldLabel = fieldLabelMap[fieldName] || fieldName;

    // A rejection comment uses the `❌ Rejected:` prefix written by the
    // admin's reject flow. We tailor the notification copy to that case
    // so vendors immediately see which thing was rejected and the reason.
    // Explicit `type` from the client wins over prefix detection; legacy
    // callers that still embed "❌ Rejected:" continue to work.
    const isRejection = explicitType
      ? explicitType === "ADMIN_REJECTION"
      : comment.startsWith("❌ Rejected:");
    // Effective type stored on the row. If the client didn't specify,
    // derive from the rejection detection.
    const effectiveType:
      | "ADMIN_REJECTION"
      | "VENDOR_REQUEST"
      | "ADMIN_COMMENT" =
      explicitType ?? (isRejection ? "ADMIN_REJECTION" : "ADMIN_COMMENT");
    const reasonText = isRejection
      ? comment.replace(/^❌ Rejected:\s*/, "").trim()
      : comment;

    // ============== PROFILE SNAPSHOT MAINTENANCE ==============
    // The vendor portal compares each field's current value to the
    // snapshot stored on vendor.profileSnapshot to decide whether the
    // vendor has addressed a rejection in this round. We populate that
    // snapshot on every rejection (not just on whole-profile Request
    // Changes), so per-field reject — which is the more common admin
    // path — also feeds the vendor's addressed-state UI.
    //
    // Two behaviours:
    //   1. Snapshot is empty/null → take a full snapshot now. This is
    //      the "first rejection in a fresh cycle" case.
    //   2. Snapshot already populated and this field exists in it →
    //      advance snapshot[fieldName] to the current value. This is
    //      the snapshot-bump-on-rejection pattern we already use on
    //      vehicle and driver reviews: when admin rejects a field
    //      that the vendor previously addressed, we reset the baseline
    //      so the addressed flag flips back to "needs update" cleanly.
    //
    // Only fires on rejection comments (not plain comments). Plain
    // comments don't change the addressed state machine.
    if (isRejection) {
      const existing = (vendor as any).profileSnapshot;
      const isEmptySnap =
        !existing ||
        typeof existing !== "object" ||
        Object.keys(existing).length === 0;

      // Build a flat current-state map keyed by both input field names
      // and doc-type enums. Used by both branches below.
      const docMap = new Map<string, string | null>();
      for (const d of vendor.vendorDocuments ?? []) {
        docMap.set(d.type, d.fileUrl ?? null);
      }
      const currentByKey: Record<string, any> = {
        companyName: vendor.companyName ?? null,
        crNumber: vendor.crNumber ?? null,
        vatNumber: vendor.vatNumber ?? null,
        chamberOfCommerceNumber:
          (vendor as any).chamberOfCommerceNumber ?? null,
        baladyNumber: (vendor as any).baladyNumber ?? null,
        nationalAddress: (vendor as any).nationalAddress ?? null,
        contactPerson: vendor.contactPerson ?? null,
        contactPhone: vendor.contactPhone ?? null,
        address: vendor.address ?? null,
        bankName: vendor.bankName ?? null,
        bankAccountNumber: vendor.bankAccountNumber ?? null,
        bankIban: vendor.bankIban ?? null,
        mou: vendor.mouFileUrl ?? null,
      };
      for (const [type, url] of docMap) currentByKey[type] = url;

      if (isEmptySnap) {
        // Case 1: First rejection in a fresh cycle — capture everything
        // so future addresses can be diffed against this baseline.
        await prisma.vendor.update({
          where: { id },
          data: { profileSnapshot: currentByKey as any },
        });
      } else if (
        fieldName in (existing as Record<string, any>) &&
        currentByKey[fieldName] !== undefined
      ) {
        // Case 2: Re-rejecting a field. Bump just that field so the
        // diff resets — the vendor needs to make a NEW change for
        // "addressed" to fire again.
        const nextSnap = {
          ...(existing as Record<string, any>),
          [fieldName]: currentByKey[fieldName],
        };
        await prisma.vendor.update({
          where: { id },
          data: { profileSnapshot: nextSnap as any },
        });
      }
    }

    // Policy B (mirrors partner): if the admin is rejecting a field that had
    // a pending VENDOR_REQUEST comment on it, resolve that marker first.
    // This cleanly transitions the field from "editable at vendor's request"
    // to "admin found problem with your edit — please fix."
    if (isRejection) {
      await prisma.vendorReviewComment.updateMany({
        where: {
          vendorId: id,
          fieldName,
          isResolved: false,
          type: "VENDOR_REQUEST",
        },
        data: { isResolved: true, resolvedAt: new Date() },
      });
    }

    // When resolveOnCreate is true (used by admin's per-field Accept for
    // CHANGED-but-uncommented fields), create the comment already resolved
    // AND skip the vendor-facing notification. This is an audit-trail
    // marker for admin, not a signal to the vendor.
    if (resolveOnCreate) {
      const reviewComment = await prisma.vendorReviewComment.create({
        data: {
          vendorId: id,
          fieldName,
          comment,
          type: effectiveType,
          createdBy: req.user!.id,
          isResolved: true,
          resolvedAt: new Date(),
        },
      });
      return res.json({
        success: true,
        message: "Field accepted",
        data: reviewComment,
      });
    }

    // Write the comment + notification in a single transaction so we
    // never end up with a comment the vendor was never told about.
    const [reviewComment] = await prisma.$transaction([
      prisma.vendorReviewComment.create({
        data: {
          vendorId: id,
          fieldName,
          comment,
          type: effectiveType,
          createdBy: req.user!.id,
        },
      }),
      prisma.notification.create({
        data: {
          userId: vendor.userId,
          title: isRejection
            ? `${fieldLabel} rejected`
            : `New comment on ${fieldLabel}`,
          message: isRejection
            ? `Admin rejected ${fieldLabel}: ${reasonText}. Please update and resubmit.`
            : `Admin added a comment on ${fieldLabel}: ${reasonText}`,
          type: isRejection
            ? "VENDOR_PROFILE_FIELD_REJECTED"
            : "VENDOR_PROFILE_REVIEW_COMMENT",
          data: { vendorId: id, fieldName },
        },
      }),
    ]);

    res.json({
      success: true,
      message: "Comment added",
      data: reviewComment,
    });
  },
);

/**
 * Resolve a vendor profile review comment
 */
export const resolveVendorReviewComment = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id, commentId } = req.params;

    const comment = await prisma.vendorReviewComment.findFirst({
      where: { id: commentId, vendorId: id },
    });

    if (!comment) throw new NotFoundError("Comment");
    if (comment.isResolved)
      throw new BadRequestError("Comment is already resolved");

    await prisma.vendorReviewComment.update({
      where: { id: commentId },
      data: { isResolved: true, resolvedAt: new Date() },
    });

    res.json({
      success: true,
      message: "Comment resolved",
    });
  },
);

// ============== DRIVER REVIEW COMMENTS ==============
// Field-level comments — mirror VendorReviewComment but scoped to a driver

const VALID_DRIVER_FIELDS = [
  // Driver profile text fields
  "firstName",
  "lastName",
  "phone",
  "nationalId",
  "licenseNumber",
  // Individual doc-type enum values (used by the per-doc review UI)
  "PROFILE_PHOTO",
  "IQAMA_NATIONAL_ID",
  "DRIVING_LICENSE",
];

export const addDriverReviewComment = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id, driverId } = req.params;
    const { fieldName, comment } = req.body;

    if (!fieldName || !comment) {
      throw new BadRequestError("fieldName and comment are required");
    }

    if (!VALID_DRIVER_FIELDS.includes(fieldName)) {
      throw new BadRequestError(
        `Invalid fieldName. Must be one of: ${VALID_DRIVER_FIELDS.join(", ")}`,
      );
    }

    const driver = await prisma.driver.findFirst({
      where: { id: driverId, vendorId: id },
    });
    if (!driver) throw new NotFoundError("Driver");

    const reviewComment = await prisma.driverReviewComment.create({
      data: {
        driverId,
        fieldName,
        comment,
        createdBy: req.user!.id,
      },
    });

    // See addVehicleReviewComment for the full rationale. Same idea:
    // when admin re-rejects a previously-replaced doc/field, roll
    // the editSnapshot forward to the just-rejected value so the
    // frontend's diff doesn't keep the "addressed" UI lit after
    // the rejection is locked in.
    const isRejection =
      typeof comment === "string" && comment.startsWith("❌ Rejected:");
    const currentSnapshot =
      (driver.editSnapshot as Record<string, any> | null) || null;
    const snapshotIsPopulated =
      currentSnapshot !== null &&
      typeof currentSnapshot === "object" &&
      Object.keys(currentSnapshot).length > 0;

    if (isRejection && snapshotIsPopulated) {
      const DRIVER_DOC_TYPES = [
        "PROFILE_PHOTO",
        "IQAMA_NATIONAL_ID",
        "DRIVING_LICENSE",
      ];
      const DRIVER_INPUT_FIELDS = [
        "firstName",
        "lastName",
        "phone",
        "nationalId",
        "licenseNumber",
      ];

      let updatedSnapshot: Record<string, any> | null = null;

      if (DRIVER_DOC_TYPES.includes(fieldName)) {
        const doc = await prisma.driverDocument.findFirst({
          where: { driverId, type: fieldName as any },
          select: { fileUrl: true },
        });
        const fileUrl = doc?.fileUrl ?? null;
        updatedSnapshot = { ...currentSnapshot, [fieldName]: fileUrl };

        // PROFILE_PHOTO has a second view in the snapshot — the
        // driver row's photoUrl column, which the admin frontend
        // also diffs in the driver-photo IIFE. Bump both so the
        // re-rejection clears both keys' diff signal.
        if (fieldName === "PROFILE_PHOTO") {
          updatedSnapshot.photoUrl = driver.photoUrl;
        }
      } else if (DRIVER_INPUT_FIELDS.includes(fieldName)) {
        updatedSnapshot = {
          ...currentSnapshot,
          [fieldName]: (driver as any)[fieldName],
        };
      }

      if (updatedSnapshot) {
        await prisma.driver.update({
          where: { id: driverId },
          data: { editSnapshot: updatedSnapshot as any },
        });
      }
    }

    res.json({
      success: true,
      message: "Comment added",
      data: reviewComment,
    });
  },
);

export const resolveDriverReviewComment = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id, driverId, commentId } = req.params;

    const driver = await prisma.driver.findFirst({
      where: { id: driverId, vendorId: id },
    });
    if (!driver) throw new NotFoundError("Driver");

    const comment = await prisma.driverReviewComment.findFirst({
      where: { id: commentId, driverId },
    });
    if (!comment) throw new NotFoundError("Comment");

    if (comment.isResolved) {
      return res.json({
        success: true,
        message: "Comment already resolved",
        data: comment,
      });
    }

    const updated = await prisma.driverReviewComment.update({
      where: { id: commentId },
      data: { isResolved: true, resolvedAt: new Date() },
    });

    res.json({
      success: true,
      message: "Comment resolved",
      data: updated,
    });
  },
);

// ============== VEHICLE REVIEW COMMENTS ==============

const VALID_VEHICLE_FIELDS = [
  // Logical buckets (kept for backward compatibility with bulk comments)
  "vehiclePhotos",
  "numberPlates",
  "odometer",
  "insurance",
  "istimara",
  // Individual doc-type enum values (used by the per-image review UI)
  "PHOTO_FRONT",
  "PHOTO_BACK",
  "PHOTO_LEFT",
  "PHOTO_RIGHT",
  "PHOTO_INTERIOR_FRONT",
  "PHOTO_INTERIOR_BACK",
  "NUMBER_PLATE_FRONT",
  "NUMBER_PLATE_BACK",
  "ODOMETER",
  "INSURANCE",
  "ISTIMARA",
  // Vehicle info fields
  "make",
  "model",
  "year",
  "plateNumber",
  "color",
  "category",
  "mileage",
];

export const addVehicleReviewComment = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id, vehicleId } = req.params;
    const { fieldName, comment } = req.body;

    if (!fieldName || !comment) {
      throw new BadRequestError("fieldName and comment are required");
    }

    if (!VALID_VEHICLE_FIELDS.includes(fieldName)) {
      throw new BadRequestError(
        `Invalid fieldName. Must be one of: ${VALID_VEHICLE_FIELDS.join(", ")}`,
      );
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, vendorId: id },
    });
    if (!vehicle) throw new NotFoundError("Vehicle");

    const reviewComment = await prisma.vehicleReviewComment.create({
      data: {
        vehicleId,
        fieldName,
        comment,
        createdBy: req.user!.id,
      },
    });

    // Roll the snapshot baseline forward when admin re-rejects a
    // previously-replaced photo/doc/field. Without this the
    // editSnapshot still holds the pre-replacement value, so the
    // frontend's diff (snapshot[field] !== current value) keeps
    // returning true even after the new rejection — leaving the
    // contradictory state where the UI shows BOTH "Replaced /
    // Vendor uploaded a new file" AND "Rejected — vendor will be
    // notified" at the same time.
    //
    // Bumping snapshot[fieldName] to the just-rejected value means
    // the next "addressed" detection only fires when the vendor
    // uploads ANOTHER replacement after this rejection, which
    // matches the intended state machine: each round of
    // reject → replace → re-review starts from a fresh baseline.
    //
    // Only applied when the vehicle is mid-cycle (editSnapshot is
    // a populated object). Initial-round rejections happen before
    // "Request Changes" is fired, and the snapshot is captured
    // atomically there — we don't pre-populate it here.
    const isRejection =
      typeof comment === "string" && comment.startsWith("❌ Rejected:");
    const currentSnapshot =
      (vehicle.editSnapshot as Record<string, any> | null) || null;
    const snapshotIsPopulated =
      currentSnapshot !== null &&
      typeof currentSnapshot === "object" &&
      Object.keys(currentSnapshot).length > 0;

    if (isRejection && snapshotIsPopulated) {
      const VEHICLE_DOC_TYPES = [
        "PHOTO_FRONT",
        "PHOTO_BACK",
        "PHOTO_LEFT",
        "PHOTO_RIGHT",
        "PHOTO_INTERIOR_FRONT",
        "PHOTO_INTERIOR_BACK",
        "NUMBER_PLATE_FRONT",
        "NUMBER_PLATE_BACK",
        "ODOMETER",
        "INSURANCE",
        "ISTIMARA",
      ];
      const VEHICLE_INPUT_FIELDS = [
        "make",
        "model",
        "year",
        "plateNumber",
        "color",
        "category",
        "mileage",
      ];

      let currentValue: any = undefined;
      if (VEHICLE_DOC_TYPES.includes(fieldName)) {
        const doc = await prisma.vehicleDocument.findFirst({
          where: { vehicleId, type: fieldName as any },
          select: { fileUrl: true },
        });
        currentValue = doc?.fileUrl ?? null;
      } else if (VEHICLE_INPUT_FIELDS.includes(fieldName)) {
        currentValue = (vehicle as any)[fieldName];
      }
      // Legacy bucket names ("vehiclePhotos", etc.) and any
      // unrecognized fieldName fall through with currentValue
      // undefined and the snapshot is left untouched.

      if (currentValue !== undefined) {
        const updatedSnapshot = {
          ...currentSnapshot,
          [fieldName]: currentValue,
        };
        await prisma.vehicle.update({
          where: { id: vehicleId },
          data: { editSnapshot: updatedSnapshot as any },
        });
      }
    }

    res.json({
      success: true,
      message: "Comment added",
      data: reviewComment,
    });
  },
);

export const resolveVehicleReviewComment = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id, vehicleId, commentId } = req.params;

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, vendorId: id },
    });
    if (!vehicle) throw new NotFoundError("Vehicle");

    const comment = await prisma.vehicleReviewComment.findFirst({
      where: { id: commentId, vehicleId },
    });
    if (!comment) throw new NotFoundError("Comment");

    if (comment.isResolved) {
      return res.json({
        success: true,
        message: "Comment already resolved",
        data: comment,
      });
    }

    const updated = await prisma.vehicleReviewComment.update({
      where: { id: commentId },
      data: { isResolved: true, resolvedAt: new Date() },
    });

    res.json({
      success: true,
      message: "Comment resolved",
      data: updated,
    });
  },
);

/**
 * Approve vendor profile
 */
export const approveVendor = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: { reviewComments: { where: { isResolved: false } } },
    });

    if (!vendor) {
      throw new NotFoundError("Vendor");
    }

    if (vendor.status === "APPROVED") {
      throw new BadRequestError("Vendor is already approved");
    }

    // Check if there are unresolved comments
    if (vendor.reviewComments.length > 0) {
      throw new BadRequestError(
        `Cannot approve: ${vendor.reviewComments.length} unresolved comment(s) exist`,
      );
    }

    const updated = await prisma.vendor.update({
      where: { id },
      data: {
        status: "APPROVED",
        profileReviewedAt: new Date(),
        profileReviewedBy: req.user!.id,
        profileSnapshot: {} as any, // Clear snapshot — partner pattern
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "VENDOR_APPROVED",
        entity: "Vendor",
        entityId: id,
      },
    });

    // Notify the vendor that their profile has been approved. Counterpart
    // to VENDOR_PROFILE_FIELD_REJECTED — without this, the vendor never
    // hears back after a successful review, leaving them to guess whether
    // resubmission actually landed. The notification feeds the profile
    // sidebar badge (registered in vendor/sidebar.controller.ts) so the
    // vendor sees a red ping pointing them at the profile section.
    //
    // Type name `VENDOR_APPROVED` mirrors the partner side's
    // `PARTNER_APPROVED` for consistency across the two flows.
    await prisma.notification.create({
      data: {
        userId: vendor.userId,
        title: "Profile Approved",
        message:
          "Your profile has been reviewed and approved. You now have full access to the platform.",
        type: "VENDOR_APPROVED",
        data: { vendorId: id },
      },
    });

    res.json({
      success: true,
      message: "Vendor approved successfully",
      data: {
        id: updated.id,
        status: updated.status,
        approvedAt: updated.profileReviewedAt,
      },
    });
  },
);

/**
 * Request changes to vendor profile
 */
export const requestVendorChanges = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { comments } = req.body; // Optional: array of {fieldName, comment}

    const vendor = await prisma.vendor.findUnique({ where: { id } });
    if (!vendor) {
      throw new NotFoundError("Vendor");
    }

    if (vendor.status !== "PENDING_REVIEW") {
      throw new BadRequestError(
        "Can only request changes for vendors in PENDING_REVIEW status",
      );
    }

    // Add comments if provided
    if (comments && Array.isArray(comments) && comments.length > 0) {
      await prisma.vendorReviewComment.createMany({
        data: comments.map((c: { fieldName: string; comment: string }) => ({
          vendorId: id,
          fieldName: c.fieldName,
          comment: c.comment,
          createdBy: req.user!.id,
        })),
      });
    }

    // Snapshot the current profile so the admin sees a diff once the vendor edits.
    // Includes ALL fields the vendor's UI compares against to decide
    // "addressed": input fields (companyName, crNumber, etc.), each
    // required-doc fileUrl keyed by its type (CR/VAT/...), and the MOU
    // fileUrl. Without doc/MOU keys here, the vendor portal's emerald
    // "Addressed" badge would never appear for those items because the
    // diff would compare current fileUrl against undefined.
    const currentVendor = await prisma.vendor.findUnique({
      where: { id },
      select: {
        companyName: true,
        crNumber: true,
        vatNumber: true,
        chamberOfCommerceNumber: true,
        baladyNumber: true,
        nationalAddress: true,
        contactPerson: true,
        contactPhone: true,
        address: true,
        bankName: true,
        bankAccountNumber: true,
        bankIban: true,
        mouFileUrl: true,
        vendorDocuments: {
          select: { type: true, fileUrl: true },
        },
      },
    });
    // Flatten docs into snapshot keys matching the doc-type enums
    // (CR, VAT, CHAMBER_OF_COMMERCE, BALADY, NATIONAL_ADDRESS, IBAN_LETTER).
    // MOU is stored under the literal "mou" key — matches the lookup
    // path in vendor/profile.tsx's MOU IIFE (tries "mou" then "MOU").
    const snapshotData: Record<string, any> = {
      companyName: currentVendor?.companyName ?? null,
      crNumber: currentVendor?.crNumber ?? null,
      vatNumber: currentVendor?.vatNumber ?? null,
      chamberOfCommerceNumber:
        (currentVendor as any)?.chamberOfCommerceNumber ?? null,
      baladyNumber: (currentVendor as any)?.baladyNumber ?? null,
      nationalAddress: (currentVendor as any)?.nationalAddress ?? null,
      contactPerson: currentVendor?.contactPerson ?? null,
      contactPhone: currentVendor?.contactPhone ?? null,
      address: currentVendor?.address ?? null,
      bankName: currentVendor?.bankName ?? null,
      bankAccountNumber: currentVendor?.bankAccountNumber ?? null,
      bankIban: currentVendor?.bankIban ?? null,
      mou: currentVendor?.mouFileUrl ?? null,
    };
    for (const d of currentVendor?.vendorDocuments ?? []) {
      snapshotData[d.type] = d.fileUrl ?? null;
    }

    const updated = await prisma.vendor.update({
      where: { id },
      data: {
        status: "CHANGES_REQUESTED",
        profileReviewedAt: new Date(),
        profileReviewedBy: req.user!.id,
        profileSnapshot: snapshotData as any,
      },
    });

    // TODO: Send notification to vendor about requested changes

    res.json({
      success: true,
      message: "Changes requested",
      data: {
        id: updated.id,
        status: updated.status,
      },
    });
  },
);

// ============== SUSPEND / REACTIVATE ==============

/**
 * Suspend a vendor
 */
export const suspendVendor = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body;

    const vendor = await prisma.vendor.findUnique({ where: { id } });
    if (!vendor) {
      throw new NotFoundError("Vendor");
    }

    if (vendor.status === "SUSPENDED") {
      throw new BadRequestError("Vendor is already suspended");
    }

    const previousStatus = vendor.status;

    const updated = await prisma.vendor.update({
      where: { id },
      data: { status: "SUSPENDED" },
    });

    // Log the suspension
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "VENDOR_SUSPENDED",
        entity: "Vendor",
        entityId: id,
        changes: { previousStatus, reason },
      },
    });

    // Notify the vendor. Includes admin-supplied reason when present
    // so they know the "why" without contacting support. The
    // notification drives both the bell + the suspension banner
    // refresh on next sidebar-badge poll.
    await prisma.notification.create({
      data: {
        userId: vendor.userId,
        title: "Account Suspended",
        message: reason
          ? `Your LuxDrive vendor account has been suspended. Reason: ${reason}`
          : "Your LuxDrive vendor account has been suspended. Contact admin for details.",
        type: "VENDOR_SUSPENDED",
        data: { vendorId: id, reason: reason || null },
      },
    });

    res.json({
      success: true,
      message: "Vendor suspended",
      data: { id: updated.id, status: updated.status },
    });
  },
);

/**
 * Reactivate a suspended vendor
 */
export const reactivateVendor = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const vendor = await prisma.vendor.findUnique({ where: { id } });
    if (!vendor) {
      throw new NotFoundError("Vendor");
    }

    if (vendor.status !== "SUSPENDED") {
      throw new BadRequestError("Vendor is not suspended");
    }

    const updated = await prisma.vendor.update({
      where: { id },
      data: { status: "APPROVED" },
    });

    // Log the reactivation
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "VENDOR_REACTIVATED",
        entity: "Vendor",
        entityId: id,
      },
    });

    // Notify the vendor — good news, they can resume operations.
    await prisma.notification.create({
      data: {
        userId: vendor.userId,
        title: "Account Reactivated",
        message:
          "Your LuxDrive vendor account has been reactivated. You can now resume your operations.",
        type: "VENDOR_REACTIVATED",
        data: { vendorId: id },
      },
    });

    res.json({
      success: true,
      message: "Vendor reactivated",
      data: { id: updated.id, status: updated.status },
    });
  },
);

// ============== BANK DETAILS MANAGEMENT ==============

/**
 * Admin directly updates vendor bank details
 * Distinction: admin-initiated change (not from vendor request)
 */
export const updateVendorBankDetails = asyncWrapper(
  async (req: Request, res: Response) => {
    throw new BadRequestError(
      "Admin cannot directly edit vendor bank details. Vendor must submit a bank update request.",
    );
  },
);

/**
 * Get all pending bank update requests
 */
export const getBankUpdateRequests = asyncWrapper(
  async (req: Request, res: Response) => {
    const { status = "PENDING", page = "1", limit = "10" } = req.query;

    const where: any = {};
    if (status && status !== "all") {
      where.status = status;
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [requests, total] = await Promise.all([
      prisma.vendorBankUpdateRequest.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: "desc" },
        include: {
          vendor: {
            select: {
              id: true,
              companyName: true,
              bankName: true,
              bankAccountNumber: true,
              bankIban: true,
              user: { select: { email: true, name: true } },
            },
          },
        },
      }),
      prisma.vendorBankUpdateRequest.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        requests,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  },
);

/**
 * Get single bank update request detail
 */
export const getBankUpdateRequestDetail = asyncWrapper(
  async (req: Request, res: Response) => {
    const { requestId } = req.params;

    const request = await prisma.vendorBankUpdateRequest.findUnique({
      where: { id: requestId },
      include: {
        vendor: {
          select: {
            id: true,
            companyName: true,
            bankName: true,
            bankAccountNumber: true,
            bankIban: true,
            user: { select: { email: true, name: true } },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundError("Bank update request");
    }

    res.json({
      success: true,
      data: request,
    });
  },
);

/**
 * Approve bank update request — updates vendor bank details
 */
export const approveBankUpdateRequest = asyncWrapper(
  async (req: Request, res: Response) => {
    const { requestId } = req.params;
    const { adminNote } = req.body;

    const request = await prisma.vendorBankUpdateRequest.findUnique({
      where: { id: requestId },
      include: { vendor: true },
    });

    if (!request) {
      throw new NotFoundError("Bank update request");
    }

    if (request.status !== "PENDING") {
      throw new BadRequestError("Request has already been processed");
    }

    // Update request status and vendor bank details in a transaction
    const [updatedRequest] = await prisma.$transaction([
      prisma.vendorBankUpdateRequest.update({
        where: { id: requestId },
        data: {
          status: "APPROVED",
          adminNote: adminNote || null,
          processedBy: req.user!.id,
          processedAt: new Date(),
        },
      }),
      prisma.vendor.update({
        where: { id: request.vendorId },
        data: {
          bankName: request.requestedBankName ?? request.vendor.bankName,
          bankAccountNumber:
            request.requestedBankAccountNumber ??
            request.vendor.bankAccountNumber,
          bankIban: request.requestedBankIban ?? request.vendor.bankIban,
        },
      }),
      // Log audit with distinction: vendor-requested change
      prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: "VENDOR_BANK_UPDATED_PER_REQUEST",
          entity: "Vendor",
          entityId: request.vendorId,
          changes: {
            requestId,
            initiatedBy: "VENDOR_REQUEST",
            previousValues: {
              bankName: request.previousBankName,
              bankAccountNumber: request.previousBankAccountNumber,
              bankIban: request.previousBankIban,
            },
            newValues: {
              bankName: request.requestedBankName,
              bankAccountNumber: request.requestedBankAccountNumber,
              bankIban: request.requestedBankIban,
            },
          },
        },
      }),
      // Notify vendor
      prisma.notification.create({
        data: {
          userId: request.vendor.userId,
          title: "Bank Update Request Approved",
          message:
            "Your bank details update request has been approved and changes are now in effect.",
          type: "BANK_UPDATE_APPROVED",
          data: { requestId },
        },
      }),
    ]);

    res.json({
      success: true,
      message: "Bank update request approved and bank details updated",
      data: updatedRequest,
    });
  },
);

/**
 * Reject bank update request
 */
export const rejectBankUpdateRequest = asyncWrapper(
  async (req: Request, res: Response) => {
    const { requestId } = req.params;
    const { adminNote } = req.body;

    if (!adminNote) {
      throw new BadRequestError(
        "adminNote is required when rejecting a request",
      );
    }

    const request = await prisma.vendorBankUpdateRequest.findUnique({
      where: { id: requestId },
      include: { vendor: true },
    });

    if (!request) {
      throw new NotFoundError("Bank update request");
    }

    if (request.status !== "PENDING") {
      throw new BadRequestError("Request has already been processed");
    }

    const updated = await prisma.vendorBankUpdateRequest.update({
      where: { id: requestId },
      data: {
        status: "REJECTED",
        adminNote,
        processedBy: req.user!.id,
        processedAt: new Date(),
      },
    });

    // Notify vendor
    await prisma.notification.create({
      data: {
        userId: request.vendor.userId,
        title: "Bank Update Request Rejected",
        message: `Your bank details update request has been rejected. Reason: ${adminNote}`,
        type: "BANK_UPDATE_REJECTED",
        data: { requestId, reason: adminNote },
      },
    });

    res.json({
      success: true,
      message: "Bank update request rejected",
      data: updated,
    });
  },
);

// ============== DRIVERS (per vendor) ==============

/**
 * Get drivers for a specific vendor
 * Shows: driver name, document types uploaded, expiry dates, photo, status, search/pagination
 */
export const getVendorDrivers = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
      search,
      status,
      activeStatus = "active",
      page = "1",
      limit = "10",
    } = req.query;

    const vendor = await prisma.vendor.findUnique({ where: { id } });
    if (!vendor) {
      throw new NotFoundError("Vendor");
    }

    const where: any = { vendorId: id };

    // Default to showing only active (non-soft-deleted) drivers. Admin
    // can opt into seeing deleted drivers via ?activeStatus=deleted, or
    // both via ?activeStatus=all. Done this way so the default behaviour
    // matches what the vendor sees in their own portal — admin viewing
    // a vendor's drivers should see the same list by default, with the
    // option to expand to deleted records for audit purposes.
    if (activeStatus === "active") {
      where.isActive = true;
    } else if (activeStatus === "deleted") {
      where.isActive = false;
    }
    // activeStatus === "all" → no isActive filter applied

    if (search) {
      const searchStr = search as string;
      where.OR = [
        { firstName: { contains: searchStr, mode: "insensitive" } },
        { lastName: { contains: searchStr, mode: "insensitive" } },
        { phone: { contains: searchStr, mode: "insensitive" } },
      ];
    }

    if (status && status !== "all") {
      where.status = status;
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [drivers, total] = await Promise.all([
      prisma.driver.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: "desc" },
        include: {
          documents: {
            select: { id: true, type: true, expiryDate: true, fileUrl: true },
          },
          assignedVehicle: {
            select: { id: true, make: true, model: true, plateNumber: true },
          },
          _count: {
            select: { reviewComments: { where: { isResolved: false } } },
          },
        },
      }),
      prisma.driver.count({ where }),
    ]);

    const now = new Date();

    const formattedDrivers = await Promise.all(
      drivers.map(async (driver) => {
        // Check document types uploaded (actual enum values from schema)
        const docTypes = driver.documents.map((d) => d.type);
        const hasIqamaOrNationalId = docTypes.includes("IQAMA_NATIONAL_ID");
        const hasDrivingLicense = docTypes.includes("DRIVING_LICENSE");
        const hasProfilePhoto = docTypes.includes("PROFILE_PHOTO");

        // Check for expiring/expired docs
        const expiringDocs = driver.documents.filter(
          (d) =>
            d.expiryDate &&
            d.expiryDate > now &&
            d.expiryDate <= new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
        );
        const expiredDocs = driver.documents.filter(
          (d) => d.expiryDate && d.expiryDate < now,
        );

        // Inline thumbnails (signed) for card preview
        const thumbnails = await Promise.all(
          driver.documents.slice(0, 3).map(async (d) => ({
            type: d.type,
            fileUrl: await getReadUrl(d.fileUrl),
          })),
        );

        return {
          id: driver.id,
          name: `${driver.firstName} ${driver.lastName}`,
          firstName: driver.firstName,
          lastName: driver.lastName,
          phone: driver.phone,
          nationalId: driver.nationalId,
          licenseNumber: driver.licenseNumber,
          photoUrl: await getReadUrl(driver.photoUrl),
          status: driver.status,
          isActive: driver.isActive,
          rating: driver.rating,
          assignedVehicle: driver.assignedVehicle,
          unresolvedCommentCount: driver._count.reviewComments,
          documents: {
            types: docTypes,
            hasIqamaOrNationalId,
            hasDrivingLicense,
            hasProfilePhoto,
            expiringCount: expiringDocs.length,
            expiredCount: expiredDocs.length,
            uploadedCount: docTypes.length,
            requiredCount: 3, // PROFILE_PHOTO + IQAMA_NATIONAL_ID + DRIVING_LICENSE
          },
          thumbnails,
          createdAt: driver.createdAt,
        };
      }),
    );

    res.json({
      success: true,
      data: {
        drivers: formattedDrivers,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  },
);

/**
 * Get driver detail with all documents (View All Docs)
 * Shows: phone, status, photo, name, iqama/national ID, driving license viewer
 */
export const getVendorDriverDetail = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id, driverId } = req.params;

    const driver = await prisma.driver.findFirst({
      where: { id: driverId, vendorId: id },
      include: {
        documents: true,
        assignedVehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            plateNumber: true,
            category: true,
          },
        },
        reviewRequests: {
          where: { isResolved: false },
          orderBy: { createdAt: "desc" },
        },
        reviewComments: {
          orderBy: { createdAt: "desc" },
        },
        vendor: { select: { id: true, companyName: true } },
      },
    });

    if (!driver) {
      throw new NotFoundError("Driver");
    }

    // Mirror partner pattern: flat array, one entry per required type
    const uploadedDocsMap = new Map(driver.documents.map((d) => [d.type, d]));

    const documents = REQUIRED_DRIVER_DOCUMENTS.map((type) => {
      const doc = uploadedDocsMap.get(type);
      return {
        type,
        label: DRIVER_DOCUMENT_LABELS[type],
        uploaded: !!doc,
        id: doc?.id || null,
        fileUrl: doc?.fileUrl || null,
        fileName: (doc as any)?.fileName || null,
        expiryDate: doc?.expiryDate || null,
      };
    });

    const documentsWithUrls = await Promise.all(
      documents.map(async (doc) => ({
        ...doc,
        fileUrl: doc.fileUrl ? await getReadUrl(doc.fileUrl) : null,
        // Stable raw GCS path used by the snapshot-diff that drives
        // "REPLACED" badges + addressed-state. Mirrors the vendor and
        // vehicle doc responses in this controller.
        filePath: doc.fileUrl || null,
      })),
    );

    const missingDocuments = documentsWithUrls
      .filter((d) => !d.uploaded)
      .map((d) => d.label);
    const allDocumentsUploaded = missingDocuments.length === 0;

    // Sign the driver's photoUrl too
    const signedPhotoUrl = await getReadUrl(driver.photoUrl);

    // Group review comments by field for partner-style display
    const commentsByField: Record<string, any[]> = {};
    driver.reviewComments.forEach((c) => {
      if (!commentsByField[c.fieldName]) commentsByField[c.fieldName] = [];
      commentsByField[c.fieldName].push({
        id: c.id,
        comment: c.comment,
        isResolved: c.isResolved,
        createdAt: c.createdAt,
      });
    });

    const unresolvedCommentCount = driver.reviewComments.filter(
      (c) => !c.isResolved,
    ).length;

    res.json({
      success: true,
      data: {
        id: driver.id,
        firstName: driver.firstName,
        lastName: driver.lastName,
        name: `${driver.firstName} ${driver.lastName}`,
        phone: driver.phone,
        nationalId: driver.nationalId,
        licenseNumber: driver.licenseNumber,
        photoUrl: signedPhotoUrl,
        // Raw GCS path for the driver photo — paired with the signed
        // photoUrl above so the admin's "REPLACED" detection on the
        // driver photo IIFE can use a stable identifier rather than
        // the rotating signed URL.
        photoPath: driver.photoUrl || null,
        status: driver.status,
        isActive: driver.isActive,
        rating: driver.rating,
        assignedVehicle: driver.assignedVehicle,
        vendor: driver.vendor,
        documents: documentsWithUrls, // FLAT ARRAY
        missingDocuments,
        allDocumentsUploaded,
        pendingReviewRequests: driver.reviewRequests,
        comments: commentsByField,
        unresolvedCommentCount,
        editSnapshot: driver.editSnapshot,
        createdAt: driver.createdAt,
      },
    });
  },
);

/**
 * Approve driver
 */
export const approveDriver = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id, driverId } = req.params;

    const driver = await prisma.driver.findFirst({
      where: { id: driverId, vendorId: id },
      include: {
        vendor: true,
        reviewComments: { where: { isResolved: false } },
      },
    });

    if (!driver) {
      throw new NotFoundError("Driver");
    }

    if (driver.status === "APPROVED") {
      throw new BadRequestError("Driver is already approved");
    }

    // Block approval if there are unresolved field-level comments
    if (driver.reviewComments.length > 0) {
      throw new BadRequestError(
        `Cannot approve — ${driver.reviewComments.length} unresolved comment(s). Please accept or reject each comment first.`,
      );
    }

    const updated = await prisma.$transaction([
      prisma.driver.update({
        where: { id: driverId },
        data: {
          status: "APPROVED",
          editSnapshot: Prisma.JsonNull, // clear snapshot once approved
          // Clear any auto-suspension. Admin approval is the gate that brings
          // a suspended driver back online after renewal.
          isActive: true,
          suspendedForDocs: false,
        },
      }),
      // Resolve any pending admin-initiated review requests
      prisma.driverReviewRequest.updateMany({
        where: { driverId, isResolved: false },
        data: {
          isResolved: true,
          resolvedAt: new Date(),
          status: "APPROVED",
          reviewedBy: req.user!.id,
          reviewedAt: new Date(),
        },
      }),
    ]);

    // Notify vendor
    await prisma.notification.create({
      data: {
        userId: driver.vendor.userId,
        title: "Driver Approved",
        message: `Driver ${driver.firstName} ${driver.lastName} has been approved and can now be assigned to bookings.`,
        type: "DRIVER_APPROVED",
        data: {
          driverId,
          driverName: `${driver.firstName} ${driver.lastName}`,
        },
      },
    });

    res.json({
      success: true,
      message: "Driver approved",
      data: { id: updated[0].id, status: updated[0].status },
    });
  },
);

/**
 * Request changes for driver — specify fields and message
 */
export const requestDriverChanges = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id, driverId } = req.params;
    const { fields, message } = req.body;

    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      throw new BadRequestError(
        "At least one flagged field is required before requesting changes",
      );
    }

    if (!message) {
      throw new BadRequestError("message is required");
    }

    // Accept text fields and doc-type enums
    const validFields = [
      // Text fields
      "firstName",
      "lastName",
      "phone",
      "nationalId",
      "licenseNumber",
      // Doc-type enums
      "PROFILE_PHOTO",
      "IQAMA_NATIONAL_ID",
      "DRIVING_LICENSE",
    ];

    const invalidFields = fields.filter(
      (f: string) => !validFields.includes(f),
    );
    if (invalidFields.length > 0) {
      throw new BadRequestError(
        `Invalid fields: ${invalidFields.join(", ")}. Valid: ${validFields.join(", ")}`,
      );
    }

    const driver = await prisma.driver.findFirst({
      where: { id: driverId, vendorId: id },
      include: { vendor: true },
    });

    if (!driver) {
      throw new NotFoundError("Driver");
    }

    // Snapshot driver state for diff display.
    //
    // This snapshot drives the "Vendor has addressed this" UX on the
    // admin side. The frontend's computeFieldState helper compares
    // snapshot[fieldName] against the current value to detect that
    // the vendor has updated a rejected field. For this to work the
    // snapshot has to carry every editable field — both the input
    // fields rendered in profileFields AND the doc fileUrls keyed
    // by their doc.type (PROFILE_PHOTO, IQAMA_NATIONAL_ID,
    // DRIVING_LICENSE).
    //
    // Scalar identity fields (nationalId, licenseNumber) are Driver
    // columns and belong in the snapshot alongside firstName/lastName/
    // phone so the vendor's "Addressed" UI can diff the pre-review
    // value against the vendor's corrected value once they edit inline.
    //
    // Without the doc fileUrls in the snapshot the rejected-photo/
    // doc path stayed stuck on "❌ Rejected — vendor will be
    // notified" even after the vendor re-uploaded, because the
    // admin UI had no way to see that the fileUrl had changed.
    const driverFull = await prisma.driver.findUnique({
      where: { id: driverId },
      select: {
        firstName: true,
        lastName: true,
        phone: true,
        nationalId: true,
        licenseNumber: true,
        photoUrl: true,
      },
    });

    const driverDocs = await prisma.driverDocument.findMany({
      where: { driverId },
      select: { type: true, fileUrl: true },
    });
    const driverDocSnapshot: Record<string, string | null> = {};
    for (const d of driverDocs) {
      driverDocSnapshot[d.type] = d.fileUrl;
    }

    const driverSnapshot = {
      ...driverFull,
      ...driverDocSnapshot,
    };

    // Create review request (admin-initiated, already approved since admin is initiating it)
    await prisma.driverReviewRequest.create({
      data: {
        driverId,
        fields,
        message,
        requestType: "ADMIN_INITIATED",
        status: "APPROVED",
        reviewedBy: req.user!.id,
        reviewedAt: new Date(),
        createdBy: req.user!.id,
      },
    });

    // Look up existing unresolved comments so we don't duplicate the admin's own flags
    const existingComments = await prisma.driverReviewComment.findMany({
      where: { driverId, isResolved: false },
      select: { id: true, fieldName: true },
    });
    const alreadyFlagged = new Set(existingComments.map((c) => c.fieldName));

    // Only create placeholder comments for items the admin hasn't already commented on
    const itemsNeedingComment = fields.filter(
      (f: string) => !alreadyFlagged.has(f),
    );
    if (itemsNeedingComment.length > 0) {
      await prisma.driverReviewComment.createMany({
        data: itemsNeedingComment.map((field: string) => ({
          driverId,
          fieldName: field,
          comment: `Admin requested update: ${message}`,
          createdBy: req.user!.id,
        })),
      });
    }

    // Resolve any stale unresolved comments that aren't part of THIS round
    // of Request Changes. These are typically "Change requested by vendor:"
    // comments left over from previously-approved vendor-initiated change
    // requests — without this cleanup they accumulate and the vendor's
    // unresolvedReviews banner shows the entire history every cycle.
    const fieldsSet = new Set(fields);
    const staleCommentIds = existingComments
      .filter((c) => !fieldsSet.has(c.fieldName))
      .map((c) => c.id);
    if (staleCommentIds.length > 0) {
      await prisma.driverReviewComment.updateMany({
        where: { id: { in: staleCommentIds } },
        data: { isResolved: true, resolvedAt: new Date() },
      });
    }

    // Update driver status
    await prisma.driver.update({
      where: { id: driverId },
      data: {
        status: "CHANGES_REQUESTED",
        editSnapshot: driverSnapshot as any,
      },
    });

    // Notify vendor
    await prisma.notification.create({
      data: {
        userId: driver.vendor.userId,
        title: "Driver Update Required",
        message: `Admin has requested changes for driver ${driver.firstName} ${driver.lastName}. Fields: ${fields.join(", ")}. Details: ${message}`,
        type: "DRIVER_CHANGES_REQUESTED",
        data: { driverId, fields, message },
      },
    });

    res.json({
      success: true,
      message: "Change request sent to vendor",
      data: { driverId, status: "CHANGES_REQUESTED", fields, message },
    });
  },
);

// ============== VEHICLES (per vendor) ==============

/**
 * Get vehicles for a specific vendor
 * Columns: Vehicle name + reg# + year, Category, Doc status (VP, NP, OR, LD), search/pagination
 */
export const getVendorVehicles = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { search, status, page = "1", limit = "10" } = req.query;

    const vendor = await prisma.vendor.findUnique({ where: { id } });
    if (!vendor) {
      throw new NotFoundError("Vendor");
    }

    // No active/deleted filter for vehicles: vehicle deletion is a HARD
    // delete (removes the row), and `isActive: false` is an OPERATIONAL
    // state flag (suspended-for-docs by cron, deactivated by vendor, or
    // maintenance) — not a deletion indicator. So we list every vehicle
    // row that belongs to this vendor; their per-row `status` (APPROVED /
    // EXPIRED_DOCS / UNDER_MAINTENANCE etc.) tells admin what state each
    // is in. Drivers use a real soft-delete and DO have an activeStatus
    // filter — see getVendorDrivers above.
    const where: any = { vendorId: id };

    if (search) {
      const searchStr = search as string;
      where.OR = [
        { make: { contains: searchStr, mode: "insensitive" } },
        { model: { contains: searchStr, mode: "insensitive" } },
        { plateNumber: { contains: searchStr, mode: "insensitive" } },
      ];
    }

    if (status && status !== "all") {
      where.status = status;
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [vehicles, total] = await Promise.all([
      prisma.vehicle.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: "desc" },
        include: {
          documents: {
            select: { id: true, type: true, expiryDate: true, fileUrl: true },
          },
          driver: {
            select: { id: true, firstName: true, lastName: true },
          },
          _count: {
            select: { reviewComments: { where: { isResolved: false } } },
          },
        },
      }),
      prisma.vehicle.count({ where }),
    ]);

    // Photo types to surface inline (in display order)
    const PHOTO_TYPE_PRIORITY = [
      "PHOTO_FRONT",
      "PHOTO_LEFT",
      "PHOTO_RIGHT",
      "PHOTO_BACK",
      "PHOTO_INTERIOR_FRONT",
      "PHOTO_INTERIOR_BACK",
    ];

    const formattedVehicles = await Promise.all(
      vehicles.map(async (vehicle) => {
        const docTypes = vehicle.documents.map((d) => d.type);

        // Build document status columns based on actual VehicleDocumentType enum values
        const docStatus = {
          // VP: any one of the 6 vehicle photo types is enough
          VP: docTypes.some((t) => PHOTO_TYPE_PRIORITY.includes(t)),
          // NP: either plate angle
          NP: docTypes.some((t) =>
            ["NUMBER_PLATE_FRONT", "NUMBER_PLATE_BACK"].includes(t),
          ),
          OR: docTypes.includes("ODOMETER"),
          // LD: insurance or istimara
          LD: docTypes.some((t) => ["INSURANCE", "ISTIMARA"].includes(t)),
        };

        // First 3 vehicle photos (preferring exterior angles), signed for inline preview
        const photoDocs = vehicle.documents
          .filter((d) => PHOTO_TYPE_PRIORITY.includes(d.type))
          .sort(
            (a, b) =>
              PHOTO_TYPE_PRIORITY.indexOf(a.type) -
              PHOTO_TYPE_PRIORITY.indexOf(b.type),
          )
          .slice(0, 3);

        const thumbnails = await Promise.all(
          photoDocs.map(async (d) => ({
            type: d.type,
            fileUrl: await getReadUrl(d.fileUrl),
          })),
        );

        return {
          id: vehicle.id,
          name: `${vehicle.make} ${vehicle.model}`,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          plateNumber: vehicle.plateNumber,
          category: vehicle.category,
          color: vehicle.color,
          status: vehicle.status,
          isActive: vehicle.isActive,
          assignedDriver: vehicle.driver
            ? {
                id: vehicle.driver.id,
                name: `${vehicle.driver.firstName} ${vehicle.driver.lastName}`,
              }
            : null,
          documentStatus: docStatus,
          documentCount: docTypes.length,
          unresolvedCommentCount: vehicle._count.reviewComments,
          thumbnails,
          createdAt: vehicle.createdAt,
        };
      }),
    );

    res.json({
      success: true,
      data: {
        vehicles: formattedVehicles,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  },
);

/**
 * Get vehicle detail with all documents (View All Docs)
 * Shows: name, reg#, year, type, status, assigned driver, mileage,
 *        vehicle photos (6 views), number plates, odometer, legal docs
 */
export const getVendorVehicleDetail = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id, vehicleId } = req.params;

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, vendorId: id },
      include: {
        documents: true,
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            photoUrl: true,
          },
        },
        reviewRequests: {
          where: { isResolved: false },
          orderBy: { createdAt: "desc" },
        },
        reviewComments: {
          orderBy: { createdAt: "desc" },
        },
        vendor: { select: { id: true, companyName: true } },
      },
    });

    if (!vehicle) {
      throw new NotFoundError("Vehicle");
    }

    // Mirror partner pattern EXACTLY: flat array, one entry per required type,
    // populated with the uploaded doc if it exists. fileUrl is signed.
    const uploadedDocsMap = new Map(vehicle.documents.map((d) => [d.type, d]));

    const documents = REQUIRED_VEHICLE_DOCUMENTS.map((type) => {
      const doc = uploadedDocsMap.get(type);
      return {
        type,
        label: VEHICLE_DOCUMENT_LABELS[type],
        uploaded: !!doc,
        id: doc?.id || null,
        fileUrl: doc?.fileUrl || null,
        fileName: (doc as any)?.fileName || null,
        expiryDate: doc?.expiryDate || null,
      };
    });

    const documentsWithUrls = await Promise.all(
      documents.map(async (doc) => ({
        ...doc,
        fileUrl: doc.fileUrl ? await getReadUrl(doc.fileUrl) : null,
        // Raw GCS path for snapshot-diff (REPLACED badge). Same fix
        // applied to the vendor and driver doc responses above.
        filePath: doc.fileUrl || null,
      })),
    );

    const missingDocuments = documentsWithUrls
      .filter((d) => !d.uploaded)
      .map((d) => d.label);
    const allDocumentsUploaded = missingDocuments.length === 0;

    // Group review comments by field
    const commentsByField: Record<string, any[]> = {};
    vehicle.reviewComments.forEach((c) => {
      if (!commentsByField[c.fieldName]) commentsByField[c.fieldName] = [];
      commentsByField[c.fieldName].push({
        id: c.id,
        comment: c.comment,
        isResolved: c.isResolved,
        createdAt: c.createdAt,
      });
    });

    const unresolvedCommentCount = vehicle.reviewComments.filter(
      (c) => !c.isResolved,
    ).length;

    // Sign assigned driver photoUrl if present
    const assignedDriverWithSignedPhoto = vehicle.driver
      ? {
          ...vehicle.driver,
          photoUrl: await getReadUrl(vehicle.driver.photoUrl),
        }
      : null;

    res.json({
      success: true,
      data: {
        id: vehicle.id,
        make: vehicle.make,
        model: vehicle.model,
        name: `${vehicle.make} ${vehicle.model}`,
        year: vehicle.year,
        plateNumber: vehicle.plateNumber,
        category: vehicle.category,
        color: vehicle.color,
        seats: vehicle.seats,
        features: vehicle.features,
        mileage: vehicle.mileage,
        status: vehicle.status,
        isActive: vehicle.isActive,
        assignedDriver: assignedDriverWithSignedPhoto,
        vendor: vehicle.vendor,
        documents: documentsWithUrls, // FLAT ARRAY like partner
        missingDocuments,
        allDocumentsUploaded,
        pendingReviewRequests: vehicle.reviewRequests,
        comments: commentsByField,
        unresolvedCommentCount,
        editSnapshot: vehicle.editSnapshot,
        createdAt: vehicle.createdAt,
      },
    });
  },
);

/**
 * Approve vehicle — only approved vehicles can be used for bookings
 */
export const approveVehicle = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id, vehicleId } = req.params;

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, vendorId: id },
      include: {
        vendor: true,
        reviewComments: { where: { isResolved: false } },
      },
    });

    if (!vehicle) {
      throw new NotFoundError("Vehicle");
    }

    if (vehicle.status === "APPROVED") {
      throw new BadRequestError("Vehicle is already approved");
    }

    if (vehicle.reviewComments.length > 0) {
      throw new BadRequestError(
        `Cannot approve — ${vehicle.reviewComments.length} unresolved comment(s). Please accept or reject each comment first.`,
      );
    }

    const updated = await prisma.$transaction([
      prisma.vehicle.update({
        where: { id: vehicleId },
        data: {
          status: "APPROVED",
          editSnapshot: Prisma.JsonNull,
          // Clear any auto-suspension imposed by the doc-expiry cron. Admin approval
          // is the gate that brings a suspended vehicle back online after renewal.
          isActive: true,
          suspendedForDocs: false,
        },
      }),
      prisma.vehicleReviewRequest.updateMany({
        where: { vehicleId, isResolved: false },
        data: {
          isResolved: true,
          resolvedAt: new Date(),
          status: "APPROVED",
          reviewedBy: req.user!.id,
          reviewedAt: new Date(),
        },
      }),
    ]);

    await prisma.notification.create({
      data: {
        userId: vehicle.vendor.userId,
        title: "Vehicle Approved",
        message: `Vehicle ${vehicle.make} ${vehicle.model} (${vehicle.plateNumber}) has been approved and can now be used for bookings.`,
        type: "VEHICLE_APPROVED",
        data: { vehicleId, vehicleName: `${vehicle.make} ${vehicle.model}` },
      },
    });

    res.json({
      success: true,
      message: "Vehicle approved",
      data: { id: updated[0].id, status: updated[0].status },
    });
  },
);

/**
 * Request changes for vehicle — specify documents needing re-upload
 */
export const requestVehicleChanges = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id, vehicleId } = req.params;
    const { documents, message } = req.body;

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      throw new BadRequestError(
        "At least one flagged field is required before requesting changes",
      );
    }

    if (!message) {
      throw new BadRequestError("message is required");
    }

    // Accept text fields, logical document buckets, AND individual doc-type enums
    const validItems = [
      // Document buckets
      "vehiclePhotos",
      "numberPlates",
      "odometer",
      "insurance",
      "istimara",
      // Individual doc-type enums (used when admin rejects a specific photo)
      "PHOTO_FRONT",
      "PHOTO_BACK",
      "PHOTO_LEFT",
      "PHOTO_RIGHT",
      "PHOTO_INTERIOR_FRONT",
      "PHOTO_INTERIOR_BACK",
      "NUMBER_PLATE_FRONT",
      "NUMBER_PLATE_BACK",
      "ODOMETER",
      "INSURANCE",
      "ISTIMARA",
      // Text fields
      "make",
      "model",
      "year",
      "plateNumber",
      "color",
      "category",
      "mileage",
    ];

    const invalidDocs = documents.filter(
      (d: string) => !validItems.includes(d),
    );
    if (invalidDocs.length > 0) {
      throw new BadRequestError(
        `Invalid items: ${invalidDocs.join(", ")}. Valid: ${validItems.join(", ")}`,
      );
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, vendorId: id },
      include: { vendor: true },
    });

    if (!vehicle) {
      throw new NotFoundError("Vehicle");
    }

    // Snapshot vehicle state for diff display.
    //
    // Mirrors the driver snapshot pattern in requestDriverChanges:
    // input fields PLUS doc fileUrls keyed by doc.type, so the
    // frontend's computeFieldState helper can detect when a vendor
    // has replaced a rejected photo or document. Doc.type values
    // (PHOTO_FRONT, NUMBER_PLATE_BACK, ODOMETER, INSURANCE, etc.)
    // line up 1:1 with the doc-type rejection keys in validItems
    // above and with the keys the admin frontend uses to render
    // each tile, so the diff is straightforward.
    const vehicleFull = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        make: true,
        model: true,
        year: true,
        plateNumber: true,
        color: true,
        category: true,
        mileage: true,
      },
    });

    const vehicleDocs = await prisma.vehicleDocument.findMany({
      where: { vehicleId },
      select: { type: true, fileUrl: true },
    });
    const vehicleDocSnapshot: Record<string, string | null> = {};
    for (const d of vehicleDocs) {
      vehicleDocSnapshot[d.type] = d.fileUrl;
    }

    const vehicleSnapshot = {
      ...vehicleFull,
      ...vehicleDocSnapshot,
    };

    // Create review request (admin-initiated)
    await prisma.vehicleReviewRequest.create({
      data: {
        vehicleId,
        documents,
        message,
        requestType: "ADMIN_INITIATED",
        status: "APPROVED",
        reviewedBy: req.user!.id,
        reviewedAt: new Date(),
        createdBy: req.user!.id,
      },
    });

    // Look up existing unresolved comments so we don't duplicate the admin's own flags
    const existingComments = await prisma.vehicleReviewComment.findMany({
      where: { vehicleId, isResolved: false },
      select: { id: true, fieldName: true },
    });
    const alreadyFlagged = new Set(existingComments.map((c) => c.fieldName));

    // Only create placeholder comments for items the admin hasn't already commented on
    const itemsNeedingComment = documents.filter(
      (d: string) => !alreadyFlagged.has(d),
    );
    if (itemsNeedingComment.length > 0) {
      await prisma.vehicleReviewComment.createMany({
        data: itemsNeedingComment.map((doc: string) => ({
          vehicleId,
          fieldName: doc,
          comment: `Admin requested update: ${message}`,
          createdBy: req.user!.id,
        })),
      });
    }

    // Resolve any stale unresolved comments that aren't part of THIS round
    // of Request Changes. These are typically "Change requested by vendor:"
    // comments left over from previously-approved vendor-initiated change
    // requests — without this cleanup they accumulate and the vendor's
    // unresolvedReviews banner shows the entire history every cycle.
    const documentsSet = new Set(documents);
    const staleCommentIds = existingComments
      .filter((c) => !documentsSet.has(c.fieldName))
      .map((c) => c.id);
    if (staleCommentIds.length > 0) {
      await prisma.vehicleReviewComment.updateMany({
        where: { id: { in: staleCommentIds } },
        data: { isResolved: true, resolvedAt: new Date() },
      });
    }

    // Update vehicle status
    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        status: "CHANGES_REQUESTED",
        editSnapshot: vehicleSnapshot as any,
      },
    });

    // Notify vendor
    await prisma.notification.create({
      data: {
        userId: vehicle.vendor.userId,
        title: "Vehicle Document Update Required",
        message: `Admin has requested document updates for ${vehicle.make} ${vehicle.model} (${vehicle.plateNumber}). Documents: ${documents.join(", ")}. Details: ${message}`,
        type: "VEHICLE_CHANGES_REQUESTED",
        data: { vehicleId, documents, message },
      },
    });

    res.json({
      success: true,
      message: "Change request sent to vendor",
      data: { vehicleId, status: "CHANGES_REQUESTED", documents, message },
    });
  },
);

// ============== MOU MANAGEMENT ==============

/**
 * Get vendors with expiring MOUs (within 2 months)
 */
export const getVendorExpiringMous = asyncWrapper(
  async (req: Request, res: Response) => {
    const twoMonthsFromNow = new Date();
    twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);

    const expiringMous = await prisma.vendor.findMany({
      where: {
        status: "APPROVED",
        mouExpiryDate: { lte: twoMonthsFromNow },
      },
      select: {
        id: true,
        companyName: true,
        mouExpiryDate: true,
        mouExpiryNotified: true,
        user: { select: { email: true } },
      },
      orderBy: { mouExpiryDate: "asc" },
    });

    const formatted = expiringMous.map((v) => ({
      ...v,
      email: v.user?.email,
      daysUntilExpiry: Math.ceil(
        (v.mouExpiryDate!.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      ),
      isExpired: v.mouExpiryDate! < new Date(),
    }));

    res.json({
      success: true,
      data: formatted,
    });
  },
);

// ============== VENDOR BOOKINGS ==============

/**
 * Get bookings for a specific vendor
 */
export const getVendorBookings = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, page = "1", limit = "10" } = req.query;

    const vendor = await prisma.vendor.findUnique({ where: { id } });
    if (!vendor) {
      throw new NotFoundError("Vendor");
    }

    const where: any = { vendorId: id };
    if (status && status !== "all") {
      where.status = status;
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          bookingRef: true,
          guestName: true,
          tripDate: true,
          tripTime: true,
          pickupAddress: true,
          dropoffAddress: true,
          vehicleClass: true,
          totalPrice: true,
          status: true,
          createdAt: true,
          driver: {
            select: { firstName: true, lastName: true },
          },
          vehicle: {
            select: { make: true, model: true, plateNumber: true },
          },
        },
      }),
      prisma.booking.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        bookings,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  },
);
